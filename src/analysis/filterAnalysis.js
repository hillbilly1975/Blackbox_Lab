// ====================================================
// BLACKBOX LAB - FILTER ANALYSIS
// ====================================================

function findMatchingColumns(columns, patterns) {
  if (!Array.isArray(columns)) {
    return [];
  }

  return columns.filter((columnName) => {
    const normalizedName = String(columnName).toLowerCase();

    return patterns.some((pattern) =>
      normalizedName.includes(pattern)
    );
  });
}
function extractNumericColumnValues(
  lines,
  headerIndex,
  columnName,
  sampleStep = 10
) {
  if (
    !Array.isArray(lines) ||
    !Number.isInteger(headerIndex) ||
    headerIndex < 0 ||
    !columnName
  ) {
    return [];
  }

  const headers = lines[headerIndex]
    .split(",")
    .map((header) => header.trim());

  const columnIndex = headers.indexOf(columnName);

  if (columnIndex < 0) {
    return [];
  }

  const values = [];

  for (
    let rowIndex = headerIndex + 1;
    rowIndex < lines.length;
    rowIndex += sampleStep
  ) {
    const cells = lines[rowIndex].split(",");
    const value = Number(cells[columnIndex]);

    if (Number.isFinite(value)) {
      values.push(value);
    }
  }

  return values;
}
function calculateAverageAbsolute(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const total = values.reduce(
    (sum, value) => sum + Math.abs(value),
    0
  );

  return total / values.length;
}
function estimateSampleRate(lines, headerIndex) {
  if (
    !Array.isArray(lines) ||
    !Number.isInteger(headerIndex) ||
    headerIndex < 0
  ) {
    return null;
  }

  const headers = lines[headerIndex]
  .split(",")
  .map((header) =>
    header
      .trim()
      .replace(/^"|"$/g, "")
  );

  const timeColumnIndex = headers.indexOf("time");

  if (timeColumnIndex < 0) {
    return null;
  }

  const timeValues = [];

  const lastRow = Math.min(
    lines.length,
    headerIndex + 5001
  );

  for (
    let rowIndex = headerIndex + 1;
    rowIndex < lastRow;
    rowIndex += 1
  ) {
    const cells = lines[rowIndex].split(",");
    const timeValue = Number(
  cells[timeColumnIndex]
    ?.trim()
    .replace(/^"|"$/g, "")
);

    if (Number.isFinite(timeValue)) {
      timeValues.push(timeValue);
    }
  }

  if (timeValues.length < 2) {
    return null;
  }

  const intervals = [];

  for (let index = 1; index < timeValues.length; index += 1) {
    const interval =
      timeValues[index] - timeValues[index - 1];

    if (interval > 0) {
      intervals.push(interval);
    }
  }

  if (intervals.length === 0) {
    return null;
  }

  intervals.sort((a, b) => a - b);

  const middleIndex = Math.floor(intervals.length / 2);

  const medianInterval =
    intervals.length % 2 === 0
      ? (
          intervals[middleIndex - 1] +
          intervals[middleIndex]
        ) / 2
      : intervals[middleIndex];

  const intervalSeconds = medianInterval / 1_000_000;

  return {
    sampleRateHz: 1 / intervalSeconds,
    medianIntervalMicroseconds: medianInterval,
    sampleCount: timeValues.length
  };
}
function extractContiguousNumericWindow(
  lines,
  headerIndex,
  columnName,
  windowSize = 4096,
  startOffset = 0
) {
  if (
    !Array.isArray(lines) ||
    !Number.isInteger(headerIndex) ||
    headerIndex < 0 ||
    !columnName
  ) {
    return [];
  }

  const headers = lines[headerIndex]
    .split(",")
    .map((header) =>
      header
        .trim()
        .replace(/^"|"$/g, "")
    );

  const cleanColumnName = String(columnName)
    .trim()
    .replace(/^"|"$/g, "");

  const columnIndex =
    headers.indexOf(cleanColumnName);

  if (columnIndex < 0) {
    return [];
  }

  const values = [];

  const firstDataRow =
    headerIndex + 1 + startOffset;

  const lastDataRow = Math.min(
    lines.length,
    firstDataRow + windowSize
  );

  for (
    let rowIndex = firstDataRow;
    rowIndex < lastDataRow;
    rowIndex += 1
  ) {
    const cells = lines[rowIndex].split(",");

    const value = Number(
      cells[columnIndex]
        ?.trim()
        .replace(/^"|"$/g, "")
    );

    if (!Number.isFinite(value)) {
      return [];
    }

    values.push(value);
  }

  return values.length === windowSize
    ? values
    : [];
}
function calculateMagnitudeSpectrum(values, sampleRateHz) {
  if (
    !Array.isArray(values) ||
    values.length < 2 ||
    !Number.isFinite(sampleRateHz) ||
    sampleRateHz <= 0
  ) {
    return [];
  }

  const size = values.length;

  if ((size & (size - 1)) !== 0) {
    return [];
  }

  const average =
    values.reduce((sum, value) => sum + value, 0) / size;

  const real = new Array(size);
  const imaginary = new Array(size).fill(0);

  for (let index = 0; index < size; index += 1) {
    const hannWindow =
      0.5 -
      0.5 *
        Math.cos(
          (2 * Math.PI * index) /
          (size - 1)
        );

    real[index] =
      (values[index] - average) * hannWindow;
  }

  // Bit-reversal ordering
  for (
    let index = 1, reversedIndex = 0;
    index < size;
    index += 1
  ) {
    let bit = size >> 1;

    while (reversedIndex & bit) {
      reversedIndex ^= bit;
      bit >>= 1;
    }

    reversedIndex ^= bit;

    if (index < reversedIndex) {
      [real[index], real[reversedIndex]] =
        [real[reversedIndex], real[index]];

      [imaginary[index], imaginary[reversedIndex]] =
        [imaginary[reversedIndex], imaginary[index]];
    }
  }

  // Radix-2 FFT
  for (
    let blockSize = 2;
    blockSize <= size;
    blockSize <<= 1
  ) {
    const angleStep =
      (-2 * Math.PI) / blockSize;

    const halfBlock = blockSize >> 1;

    for (
      let blockStart = 0;
      blockStart < size;
      blockStart += blockSize
    ) {
      for (
        let offset = 0;
        offset < halfBlock;
        offset += 1
      ) {
        const angle = angleStep * offset;

        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);

        const evenIndex =
          blockStart + offset;

        const oddIndex =
          evenIndex + halfBlock;

        const oddReal =
          real[oddIndex] * cosine -
          imaginary[oddIndex] * sine;

        const oddImaginary =
          real[oddIndex] * sine +
          imaginary[oddIndex] * cosine;

        const evenReal = real[evenIndex];
        const evenImaginary =
          imaginary[evenIndex];

        real[evenIndex] =
          evenReal + oddReal;

        imaginary[evenIndex] =
          evenImaginary + oddImaginary;

        real[oddIndex] =
          evenReal - oddReal;

        imaginary[oddIndex] =
          evenImaginary - oddImaginary;
      }
    }
  }

  const spectrum = [];
  const nyquistBin = size / 2;

  for (
    let binIndex = 1;
    binIndex <= nyquistBin;
    binIndex += 1
  ) {
    spectrum.push({
      frequencyHz:
        (binIndex * sampleRateHz) / size,

      magnitude:
        Math.hypot(
          real[binIndex],
          imaginary[binIndex]
        ) / size
    });
  }

  return spectrum;
}

function findStrongestFrequency(
  spectrum,
  minimumFrequencyHz = 5
) {
  if (!Array.isArray(spectrum)) {
    return null;
  }

  const usableBins = spectrum.filter(
    (bin) =>
      Number.isFinite(bin.frequencyHz) &&
      Number.isFinite(bin.magnitude) &&
      bin.frequencyHz >= minimumFrequencyHz
  );

  if (usableBins.length === 0) {
    return null;
  }

  return usableBins.reduce(
    (strongest, bin) =>
      bin.magnitude > strongest.magnitude
        ? bin
        : strongest
  );
  }function buildAircraftFrequencyMap(
  analysisContext,
  headspeedOverride = null
) {
  
  const profile =
    analysisContext?.aircraft?.profile || {};

  const averageHeadspeed =
  Number.isFinite(headspeedOverride) &&
  headspeedOverride > 0
    ? headspeedOverride
    : analysisContext?.flight?.averageHeadspeed;

  const mainBladeCount =
    Number(profile.mainBladeCount);

  const tailBladeCount =
    Number(profile.tailBladeCount);

  const tailRatio =
    Number(profile.tailRatio);

  const mainGearRatio =
    Number(profile.mainGearRatio);

  const motorPoleCount =
    Number(profile.motorPoleCount);

  if (
    !Number.isFinite(averageHeadspeed) ||
    averageHeadspeed <= 0
  ) {
    return null;
  }

  const mainRotorHz =
    averageHeadspeed / 60;

  const mainBladePassHz =
    Number.isFinite(mainBladeCount)
      ? mainRotorHz * mainBladeCount
      : null;

  const tailRotorHz =
    Number.isFinite(tailRatio)
      ? mainRotorHz * tailRatio
      : null;

  const tailBladePassHz =
    Number.isFinite(tailRotorHz) &&
    Number.isFinite(tailBladeCount)
      ? tailRotorHz * tailBladeCount
      : null;

  const motorMechanicalHz =
    Number.isFinite(mainGearRatio)
      ? mainRotorHz * mainGearRatio
      : null;

  const motorElectricalHz =
    Number.isFinite(motorMechanicalHz) &&
    Number.isFinite(motorPoleCount)
      ? motorMechanicalHz *
        (motorPoleCount / 2)
      : null;

  return {
    averageHeadspeed,
    mainRotorHz,
    mainBladePassHz,
    tailRotorHz,
    tailBladePassHz,
    motorMechanicalHz,
    motorElectricalHz
  };
}
function findClosestAircraftFrequencyMatch(
  peakFrequencyHz,
  aircraftFrequencyMaps
) {
  if (
    !Number.isFinite(peakFrequencyHz) ||
    !Array.isArray(aircraftFrequencyMaps)
  ) {
    return null;
  }

  const frequencyNames = [
    "mainRotorHz",
    "mainBladePassHz",
    "tailRotorHz",
    "tailBladePassHz",
    "motorMechanicalHz",
    "motorElectricalHz"
  ];

  let closestMatch = null;

  for (const profileMap of aircraftFrequencyMaps) {
    const frequencies = profileMap?.frequencies;

    if (!frequencies) {
      continue;
    }

    for (const frequencyName of frequencyNames) {
      const expectedFrequencyHz =
        frequencies[frequencyName];

      if (!Number.isFinite(expectedFrequencyHz)) {
        continue;
      }

      const differenceHz = Math.abs(
        peakFrequencyHz - expectedFrequencyHz
      );

      const toleranceHz = Math.max(
        2,
        expectedFrequencyHz * 0.03
      );

      const candidateMatch = {
        frequencyName,
        peakFrequencyHz,
        expectedFrequencyHz,
        differenceHz,
        toleranceHz,
        isWithinTolerance:
          differenceHz <= toleranceHz,
        targetRpm: profileMap.targetRpm,
        averageRpm: profileMap.averageRpm
      };

      if (
        !closestMatch ||
        candidateMatch.differenceHz <
          closestMatch.differenceHz
      ) {
        closestMatch = candidateMatch;
      }
    }
  }

  return closestMatch;
}
export function analyzeFilters(
  analysisContext,
  lines = []
) {
  const unavailableResult = {
    score: 0,
    status: "Insufficient Data",
    severity: "unknown",
    confidence: {
      score: 0,
      label: "Low"
    },
    findings: [
      "Filter analysis requires gyro and PID-related Blackbox data."
    ],
    recommendations: [],
    evidence: []
  };

  if (!analysisContext) {
    return unavailableResult;
  }

  const evidenceSources =
    analysisContext.evidence?.sources || {};

  const allColumns =
    analysisContext.telemetry?.allColumns || [];

  const hasBlackboxLog =
    evidenceSources.bbl === true;

  const rawGyroColumns = findMatchingColumns(
    allColumns,
    [
  "gyroraw",
  "rawgyro",
  "gyro_raw"
    ]   
  );

  const filteredGyroColumns = findMatchingColumns(
    allColumns,
    [
      "gyroadc",
      "gyrofiltered",
      "filteredgyro",
      "gyro_filter",
      "gyrofilter",
      "gyro["
    ]
  ).filter(
    (columnName) =>
      !rawGyroColumns.includes(columnName)
  );

  const setpointColumns = findMatchingColumns(
    allColumns,
    [
      "setpoint",
      "axiscommand",
      "axiscommandf",
      "rccommand"
    ]
  );

  const pidColumns = findMatchingColumns(
    allColumns,
    [
      "axisp",
      "axisi",
      "axisd",
      "axisf",
      "axispd",
      "axiserror",
      "pid"
    ]
  );
const setpointAxisColumns = [0, 1, 2].map((axisIndex) =>
  setpointColumns.find(
    (column) =>
      column
        .replaceAll('"', "")
        .trim()
        .toLowerCase() === `setpoint[${axisIndex}]`
  )
);
const axisErrorColumns = [0, 1, 2].map((axisIndex) =>
  pidColumns.find(
    (column) =>
      column
        .replaceAll('"', "")
        .trim()
        .toLowerCase() === `axiserror[${axisIndex}]`
  )
);
  const motorOutputColumns = findMatchingColumns(
    allColumns,
    [
      "motor",
      "escoutput",
      "escthr",
      "throttle"
    ]
  );

  const detectedGroups = {
    rawGyro: rawGyroColumns,
    filteredGyro: filteredGyroColumns,
    setpoint: setpointColumns,
    pid: pidColumns,
    motorOutput: motorOutputColumns
  };
const telemetryHeaderIndex =
  analysisContext.flight?.telemetryHeaderIndex;
const sampleRate =
  estimateSampleRate(
    lines,
    telemetryHeaderIndex
  );
  ;
  const aircraftFrequencyMap =
  buildAircraftFrequencyMap(
    analysisContext
  );
const headspeedProfiles =
  analysisContext?.flight?.headspeedProfiles || [];
  function getProfileColumnValues(
  lines,
  headerIndex,
  columnName,
  sampleIndexes
) {
  if (
    !Array.isArray(lines) ||
    !Number.isInteger(headerIndex) ||
    headerIndex < 0 ||
    !columnName ||
    !Array.isArray(sampleIndexes)
  ) {
    return [];
  }

  const headers = lines[headerIndex]
    .split(",")
    .map((header) => header.trim());

  const columnIndex = headers.indexOf(columnName);

  if (columnIndex < 0) {
    return [];
  }

  return sampleIndexes
    .map((rowIndex) => {
      const line = lines[rowIndex];

      if (!line) {
        return null;
      }

      const cells = line.split(",");
      const value = Number(cells[columnIndex]);

      return Number.isFinite(value) ? value : null;
    })
    .filter((value) => value !== null);
}

 function buildProfileMechanicalFinding({
  targetRpm,
  sampleCount,
  roll,
  pitch,
  yaw
}) {
  const axes = [
    { name: "Roll", data: roll },
    { name: "Pitch", data: pitch },
    { name: "Yaw", data: yaw }
  ].filter(
    (axis) =>
      axis.data &&
      Number.isFinite(axis.data.rawAverage) &&
      Number.isFinite(axis.data.filteredAverage)
  );

  if (axes.length === 0) {
    return {
      status: "Insufficient Data",
      summary:
        `Not enough gyro data was available to evaluate the ${targetRpm} RPM profile.`,
      strongestAxis: null
    };
  }

  const strongestAxis = axes.reduce(
    (highest, current) =>
      current.data.filteredAverage >
      highest.data.filteredAverage
        ? current
        : highest
  );

  const averageFiltered =
    axes.reduce(
      (total, axis) =>
        total + axis.data.filteredAverage,
      0
    ) / axes.length;

  let status = "Cleanest Profile";

if (averageFiltered >= 16) {
  status = "Needs Review";
} else if (averageFiltered >= 12) {
  status = "Monitor";
}
  let confidence = "Low";

if (sampleCount >= 5000) {
  confidence = "High";
} else if (sampleCount >= 1500) {
  confidence = "Moderate";

}
const controlMotionAxes = [
  { name: "Roll", data: roll },
  { name: "Pitch", data: pitch },
  { name: "Yaw", data: yaw }
].filter(
  (axis) =>
    Number.isFinite(axis.data?.setpointAverage) &&
    Number.isFinite(axis.data?.axisErrorAverage)
);

let controlMotionAssessment =
  "Control-motion evidence was not available for this profile.";

if (controlMotionAxes.length > 0) {
  const controlRatios = controlMotionAxes
    .map((axis) => {
      const setpointAverage = axis.data.setpointAverage;
      const axisErrorAverage = axis.data.axisErrorAverage;

      if (setpointAverage <= 0) {
        return null;
      }

      return {
        axis: axis.name,
        ratio: axisErrorAverage / setpointAverage
      };
    })
    .filter(Boolean);

  if (controlRatios.length > 0) {
    const highestControlRatio = controlRatios.reduce(
      (highest, current) =>
        current.ratio > highest.ratio ? current : highest
    );

    if (highestControlRatio.ratio >= 0.5) {
      controlMotionAssessment =
        `${highestControlRatio.axis} shows a high control-error ratio, so this profile deserves review for tracking difficulty or possible excessive filtering.`;
    } else if (highestControlRatio.ratio >= 0.25) {
      controlMotionAssessment =
        `${highestControlRatio.axis} shows a moderate control-error ratio. Useful commanded motion appears present, but tracking should be monitored.`;
    } else {
      controlMotionAssessment =
        "Setpoint and axis-error data indicate that commanded motion is being tracked without obvious evidence of useful control motion being removed.";
    }
  }
}
  return {
    status,
    confidence,
sampleCount,
controlMotionAssessment,
    strongestAxis: strongestAxis.name,
    strongestFilteredAverage:
      strongestAxis.data.filteredAverage,
    averageFiltered,
    summary:
      `${targetRpm} RPM is rated ${status} with ${confidence} confidence from ${sampleCount} samples. ` +
      `${strongestAxis.name} has the highest remaining filtered vibration.`
  };
}

const profileSpecificFilterAnalysis = [];

for (const profile of headspeedProfiles) {
  const rollRawValues = getProfileColumnValues(
    lines,
    telemetryHeaderIndex,
    rawGyroColumns[0],
    profile.sampleIndexes
  );

  const rollFilteredValues = getProfileColumnValues(
    lines,
    telemetryHeaderIndex,
    filteredGyroColumns[0],
    profile.sampleIndexes
  );

  const rollRawAverage =
    calculateAverageAbsolute(rollRawValues);

  const rollFilteredAverage =
    calculateAverageAbsolute(rollFilteredValues);

  const rollReductionPercent =
    Number.isFinite(rollRawAverage) &&
    rollRawAverage > 0 &&
    Number.isFinite(rollFilteredAverage)
      ? ((rollRawAverage - rollFilteredAverage) /
          rollRawAverage) *
        100
      : null;

  const pitchRawValues = getProfileColumnValues(
    lines,
    telemetryHeaderIndex,
    rawGyroColumns[1],
    profile.sampleIndexes
  );

  const pitchFilteredValues = getProfileColumnValues(
    lines,
    telemetryHeaderIndex,
    filteredGyroColumns[1],
    profile.sampleIndexes
  );

  const pitchRawAverage =
    calculateAverageAbsolute(pitchRawValues);

  const pitchFilteredAverage =
    calculateAverageAbsolute(pitchFilteredValues);

  const pitchReductionPercent =
    Number.isFinite(pitchRawAverage) &&
    pitchRawAverage > 0 &&
    Number.isFinite(pitchFilteredAverage)
      ? ((pitchRawAverage - pitchFilteredAverage) /
          pitchRawAverage) *
        100
      : null;

  const yawRawValues = getProfileColumnValues(
    lines,
    telemetryHeaderIndex,
    rawGyroColumns[2],
    profile.sampleIndexes
  );

  const yawFilteredValues = getProfileColumnValues(
    lines,
    telemetryHeaderIndex,
    filteredGyroColumns[2],
    profile.sampleIndexes
  );

  const yawRawAverage =
    calculateAverageAbsolute(yawRawValues);

  const yawFilteredAverage =
    calculateAverageAbsolute(yawFilteredValues);

  const yawReductionPercent =
    Number.isFinite(yawRawAverage) &&
    yawRawAverage > 0 &&
    Number.isFinite(yawFilteredAverage)
      ? ((yawRawAverage - yawFilteredAverage) /
          yawRawAverage) *
        100
      : null;
const rollSetpointValues =
  setpointAxisColumns[0]
    ? getProfileColumnValues(
        lines,
        telemetryHeaderIndex,
        setpointAxisColumns[0],
        profile.sampleIndexes
      )
    : [];

const rollAxisErrorValues =
  axisErrorColumns[0]
    ? getProfileColumnValues(
        lines,
        telemetryHeaderIndex,
        axisErrorColumns[0],
        profile.sampleIndexes
      )
    : [];

const rollSetpointAverage =
  calculateAverageAbsolute(rollSetpointValues);

const rollAxisErrorAverage =
  calculateAverageAbsolute(rollAxisErrorValues);
  const pitchSetpointValues =
  setpointAxisColumns[1]
    ? getProfileColumnValues(
        lines,
        telemetryHeaderIndex,
        setpointAxisColumns[1],
        profile.sampleIndexes
      )
    : [];

const pitchAxisErrorValues =
  axisErrorColumns[1]
    ? getProfileColumnValues(
        lines,
        telemetryHeaderIndex,
        axisErrorColumns[1],
        profile.sampleIndexes
      )
    : [];

const yawSetpointValues =
  setpointAxisColumns[2]
    ? getProfileColumnValues(
        lines,
        telemetryHeaderIndex,
        setpointAxisColumns[2],
        profile.sampleIndexes
      )
    : [];

const yawAxisErrorValues =
  axisErrorColumns[2]
    ? getProfileColumnValues(
        lines,
        telemetryHeaderIndex,
        axisErrorColumns[2],
        profile.sampleIndexes
      )
    : [];

const pitchSetpointAverage =
  calculateAverageAbsolute(pitchSetpointValues);

const pitchAxisErrorAverage =
  calculateAverageAbsolute(pitchAxisErrorValues);

const yawSetpointAverage =
  calculateAverageAbsolute(yawSetpointValues);

const yawAxisErrorAverage =
  calculateAverageAbsolute(yawAxisErrorValues);
  const roll = {
    setpointAverage: rollSetpointAverage,
axisErrorAverage: rollAxisErrorAverage,
    rawAverage: rollRawAverage,
    filteredAverage: rollFilteredAverage,
    reductionPercent: rollReductionPercent
  };

  const pitch = {
    setpointAverage: pitchSetpointAverage,
axisErrorAverage: pitchAxisErrorAverage,
    rawAverage: pitchRawAverage,
    filteredAverage: pitchFilteredAverage,
    reductionPercent: pitchReductionPercent
  };

  const yaw = {
    setpointAverage: yawSetpointAverage,
axisErrorAverage: yawAxisErrorAverage,
    rawAverage: yawRawAverage,
    filteredAverage: yawFilteredAverage,
    reductionPercent: yawReductionPercent
  };

  profileSpecificFilterAnalysis.push({
    targetRpm: profile.targetRpm,
    averageRpm: profile.averageRpm,
    sampleCount: profile.sampleCount,
    sampleIndexes: profile.sampleIndexes,
    roll,
    pitch,
    yaw,
    mechanicalFinding:
     buildProfileMechanicalFinding({
  targetRpm: profile.targetRpm,
  sampleCount: profile.sampleCount,
  roll,
  pitch,
  yaw
})
  });
  }
  


const aircraftFrequencyMaps =
  headspeedProfiles.length > 0
    ? headspeedProfiles.map((profile) => ({
        targetRpm: profile.targetRpm,
        averageRpm: profile.averageRpm,
        minimumRpm: profile.minimumRpm,
        maximumRpm: profile.maximumRpm,
        sampleCount: profile.sampleCount,
        frequencies: buildAircraftFrequencyMap(
          analysisContext,
          profile.averageRpm
        )
      }))
    : aircraftFrequencyMap
      ? [
          {
            targetRpm: null,
            averageRpm:
              aircraftFrequencyMap.averageHeadspeed,
            minimumRpm: null,
            maximumRpm: null,
            sampleCount: null,
            frequencies: aircraftFrequencyMap
          }
        ]
      : [];
;
const rawGyroValues = rawGyroColumns
  .slice(0, 3)
  .map((columnName) => ({
    columnName,
    values: extractNumericColumnValues(
      lines,
      telemetryHeaderIndex,
      columnName
    )
  }));

const filteredGyroValues = filteredGyroColumns
  .slice(0, 3)
  .map((columnName) => ({
    columnName,
    values: extractNumericColumnValues(
      lines,
      telemetryHeaderIndex,
      columnName
    )
    }));
    
  
const axisNames = ["Roll", "Pitch", "Yaw"];

const gyroReductionByAxis = rawGyroValues.map(
  (rawAxis, index) => {
    const filteredAxis = filteredGyroValues[index];

    const rawAverage =
      calculateAverageAbsolute(rawAxis.values);

    const filteredAverage =
      calculateAverageAbsolute(
        filteredAxis?.values || []
      );

    const reductionPercent =
      Number.isFinite(rawAverage) &&
      rawAverage > 0 &&
      Number.isFinite(filteredAverage)
        ? ((rawAverage - filteredAverage) /
            rawAverage) *
          100
        : null;

    return {
      axis: axisNames[index] || `Axis ${index}`,
      rawColumn: rawAxis.columnName,
      filteredColumn:
        filteredAxis?.columnName || null,
      rawAverage,
      filteredAverage,
      reductionPercent
    };
  }
);
const fftWindowSize = 4096;

const rawFrequencyWindows =
  rawGyroColumns.slice(0, 3).map(
    (columnName) => ({
      columnName,
      values: extractContiguousNumericWindow(
        lines,
        telemetryHeaderIndex,
        columnName,
        fftWindowSize
      )
    })
  );

const filteredFrequencyWindows =
  filteredGyroColumns.slice(0, 3).map(
    (columnName) => ({
      columnName,
      values: extractContiguousNumericWindow(
        lines,
        telemetryHeaderIndex,
        columnName,
        fftWindowSize
      )
    })
  );
const frequencyPeaksByAxis = axisNames.map(
  (axisName, index) => {
    const rawSpectrum =
      calculateMagnitudeSpectrum(
        rawFrequencyWindows[index]?.values || [],
        sampleRate?.sampleRateHz
      );

    const filteredSpectrum =
      calculateMagnitudeSpectrum(
        filteredFrequencyWindows[index]?.values || [],
        sampleRate?.sampleRateHz
      );

    const rawPeak =
      findStrongestFrequency(
        rawSpectrum,
        20
      );

    const filteredPeak =
      findStrongestFrequency(
        filteredSpectrum,
        20
      );

    return {
      axis: axisName,
      rawPeak,
      filteredPeak
    };
  }
);
const aircraftFrequencyMatches =
  frequencyPeaksByAxis.map((axisResult) => ({
    axis: axisResult.axis,

    rawMatch:
      findClosestAircraftFrequencyMatch(
        axisResult.rawPeak?.frequencyHz,
        aircraftFrequencyMaps
      ),

    filteredMatch:
      findClosestAircraftFrequencyMatch(
        axisResult.filteredPeak?.frequencyHz,
        aircraftFrequencyMaps
      )
  }));

;

  const detectedGroupCount = Object.values(
    detectedGroups
  ).filter((columns) => columns.length > 0).length;

  const evidence = [
    {
      source: "Blackbox Log",
      status: hasBlackboxLog
        ? "Available"
        : "Unavailable"
    },
    {
      source: "Total Columns",
      value: allColumns.length
    },
    {
      source: "Raw Gyro Columns",
      value: rawGyroColumns
    },
    {
      source: "Filtered Gyro Columns",
      value: filteredGyroColumns
    },
    {
      source: "Setpoint Columns",
      value: setpointColumns
    },
    {
      source: "PID Columns",
      value: pidColumns
    },
    {
  source: "Motor Output Columns",
  value: motorOutputColumns,
},
{
  source: "Aircraft Frequency Matches",
  value: aircraftFrequencyMatches,
},
{
  source: "Profile-Specific Filter Analysis",
  value: profileSpecificFilterAnalysis,
},
];

const summaryFindings = [];

for (const profile of profileSpecificFilterAnalysis) {
  if (profile.mechanicalFinding?.summary) {
    summaryFindings.push(
      profile.mechanicalFinding.summary
    );
  }
  if (profile.mechanicalFinding?.controlMotionAssessment) {
  summaryFindings.push(
    `${profile.targetRpm} RPM control-motion check: ` +
    profile.mechanicalFinding.controlMotionAssessment
  );
}
}
  const findings = [
    `The filter-analysis engine inspected ${allColumns.length} Blackbox columns.`,
    `${detectedGroupCount} of 5 required filter-analysis column groups were detected.`
  ];
  
if (aircraftFrequencyMatches.length > 0) {
 findings.push(
    `Mechanical-frequency comparisons were completed for ${aircraftFrequencyMatches.length} stable headspeed ${
      aircraftFrequencyMatches.length === 1 ? "profile" : "profiles"
    }.`
  );
}
  if (rawGyroColumns.length > 0) {
    findings.push(
      `Raw gyro columns detected: ${rawGyroColumns.join(", ")}.`
    );
  } else {
    findings.push(
      "Raw gyro columns were not detected."
    );
  }

  if (filteredGyroColumns.length > 0) {
    findings.push(
      `Filtered gyro columns detected: ${filteredGyroColumns.join(", ")}.`
    );
  } else {
    findings.push(
      "Filtered gyro columns were not detected."
    );
  }

  if (setpointColumns.length > 0) {
    findings.push(
      `Setpoint columns detected: ${setpointColumns.join(", ")}.`
    );
  } else {
    findings.push(
      "Setpoint columns were not detected."
    );
  }

  if (pidColumns.length > 0) {
    findings.push(
      `PID-related columns detected: ${pidColumns.join(", ")}.`
    );
  } else {
    findings.push(
      "PID-related columns were not detected."
    );
  }

  if (motorOutputColumns.length > 0) {
    findings.push(
      `Motor-output columns detected: ${motorOutputColumns.join(", ")}.`
    );
  } else {
    findings.push(
      "Motor-output columns were not detected."
    );
  }
  let matchedMechanicalPeakCount = 0;
let unmatchedMechanicalPeakCount = 0;
let matchedFilteredPeakCount = 0;
let unmatchedFilteredPeakCount = 0;
  for (const axisMatch of aircraftFrequencyMatches) {
    
    const rawMatch = axisMatch.rawMatch;
    const filteredMatch = axisMatch.filteredMatch;

    if (rawMatch?.isWithinTolerance) {
      matchedMechanicalPeakCount += 1;
      findings.push(
        `${axisMatch.axis} raw peak at ` +
        `${rawMatch.peakFrequencyHz.toFixed(2)} Hz matched ` +
        `${rawMatch.frequencyName} at ` +
        `${rawMatch.targetRpm ?? Math.round(rawMatch.averageRpm)} RPM ` +
        `within ${rawMatch.differenceHz.toFixed(2)} Hz.`
      );
    } else if (rawMatch) {
      unmatchedMechanicalPeakCount += 1;
      findings.push(
        `${axisMatch.axis} raw peak at ` +
        `${rawMatch.peakFrequencyHz.toFixed(2)} Hz did not match a known ` +
        `aircraft frequency within tolerance. Closest was ` +
        `${rawMatch.frequencyName} at ` +
        `${rawMatch.expectedFrequencyHz.toFixed(2)} Hz, ` +
        `${rawMatch.differenceHz.toFixed(2)} Hz away.`
      );
    }
 if (filteredMatch?.isWithinTolerance) {
      matchedFilteredPeakCount += 1;

  
      findings.push(
        `${axisMatch.axis} filtered peak at ` +
        `${filteredMatch.peakFrequencyHz.toFixed(2)} Hz matched ` +
        `${filteredMatch.frequencyName} at ` +
        `${filteredMatch.targetRpm ?? Math.round(filteredMatch.averageRpm)} RPM ` +
        `within ${filteredMatch.differenceHz.toFixed(2)} Hz.`
      );
    }else if (filteredMatch) {
  unmatchedFilteredPeakCount += 1;
}
}
 
if (aircraftFrequencyMatches.length > 0) {
  if (matchedMechanicalPeakCount === 0 && unmatchedMechanicalPeakCount > 0) {
  summaryFindings.push(
    "The detected vibration peaks do not currently line up with the aircraft’s known rotating frequencies."
  );
  summaryFindings.push(
    "An unmatched vibration peak does not automatically mean there is a mechanical defect; it only means the strongest detected peak did not closely match the known rotating frequencies in the aircraft profile."
  );
const strongestAxes =
  profileSpecificFilterAnalysis
    .map((profile) => profile.mechanicalFinding?.strongestAxis)
    .filter(Boolean);

const yawIsStrongestAcrossProfiles =
  strongestAxes.length > 0 &&
  strongestAxes.every((axis) => axis === "Yaw");

if (yawIsStrongestAcrossProfiles) {
  summaryFindings.push(
    "Yaw being the strongest remaining filtered axis means the tail-control direction deserves the closest review. This does not prove a tail problem, but it makes tail mechanics, tail-blade balance, tail-drive frequencies, and yaw-control activity the most useful places to investigate next."
  );
}
}
  if (matchedMechanicalPeakCount > 0) {
  summaryFindings.push(
    `${matchedMechanicalPeakCount} detected vibration ${
      matchedMechanicalPeakCount === 1 ? "peak aligns" : "peaks align"
    } with known aircraft rotating frequencies.`
  );
}

summaryFindings.push(
  `Raw mechanical-frequency peaks: ${matchedMechanicalPeakCount} matched known aircraft frequencies and ${unmatchedMechanicalPeakCount} were outside tolerance.` 
);

summaryFindings.push(
  `Filtered mechanical-frequency peaks: ${matchedFilteredPeakCount} matched known aircraft frequencies and ${unmatchedFilteredPeakCount} were outside tolerance.`
);
}

findings.push(
  `Raw mechanical-frequency evidence: ` +
  `${matchedMechanicalPeakCount} matched and ` +
  `${unmatchedMechanicalPeakCount} outside tolerance.`
);

findings.push(
  `Filtered mechanical-frequency evidence: ` +
  `${matchedFilteredPeakCount} matched and ` +
  `${unmatchedFilteredPeakCount} outside tolerance.`
);
 evidence.push({
  source: "Mechanical Frequency Match Counts",
  value: {
  raw: {
    matched: matchedMechanicalPeakCount,
    outsideTolerance: unmatchedMechanicalPeakCount,
    totalCompared:
      matchedMechanicalPeakCount + unmatchedMechanicalPeakCount
  },
  filtered: {
    matched: matchedFilteredPeakCount,
    outsideTolerance: unmatchedFilteredPeakCount,
    totalCompared:
      matchedFilteredPeakCount + unmatchedFilteredPeakCount
  }
}
 });
  const dataCompletenessScore = Math.round(
  (detectedGroupCount / 5) * 100
);

const profileResultPenalty =
  profileSpecificFilterAnalysis.reduce((totalPenalty, profile) => {
    const profileStatus = profile.mechanicalFinding?.status;

    if (profileStatus === "Needs Review") {
      return totalPenalty + 10;
    }

    if (profileStatus === "Monitor") {
      return totalPenalty + 5;
    }

    return totalPenalty;
  }, 0);

const score = Math.max(
  0,
  Math.min(100, dataCompletenessScore - profileResultPenalty)
);
  let status = "Insufficient Data";
  let severity = "warning";

  if (detectedGroupCount === 5) {
  if (score >= 95) {
    status = "Filter Analysis Complete";
    severity = "info";
  } else if (score >= 80) {
    status = "Filter Analysis Complete — Monitor";
    severity = "warning";
  } else {
    status = "Filter Analysis Complete — Needs Review";
    severity = "warning";
  }
} else if (detectedGroupCount >= 3) {
    status = "Partial Column Detection";
    severity = "warning";
  }

  const confidenceScore = hasBlackboxLog
    ? Math.min(100, 20 + detectedGroupCount * 16)
    : detectedGroupCount * 10;

  let confidenceLabel = "Low";

  if (confidenceScore >= 80) {
    confidenceLabel = "High";
  } else if (confidenceScore >= 45) {
    confidenceLabel = "Moderate";
  }

  const recommendations = [];

  if (detectedGroupCount < 5) {
    recommendations.push(
      "Review the missing column groups before calculating filter-performance scores."
    );
  } else if (profileSpecificFilterAnalysis.length > 0) {
  const cleanestProfile =
    profileSpecificFilterAnalysis.reduce((bestProfile, currentProfile) => {
      const bestFiltered =
        bestProfile.mechanicalFinding?.averageFiltered ?? Infinity;

      const currentFiltered =
        currentProfile.mechanicalFinding?.averageFiltered ?? Infinity;

      return currentFiltered < bestFiltered
        ? currentProfile
        : bestProfile;
    });
const reductionValues = [
  cleanestProfile.roll?.reductionPercent,
  cleanestProfile.pitch?.reductionPercent,
  cleanestProfile.yaw?.reductionPercent
].filter(Number.isFinite);

const averageReduction =
  reductionValues.length > 0
    ? reductionValues.reduce((total, value) => total + value, 0) /
      reductionValues.length
    : null;
  
let filterReductionAssessment = "";

if (Number.isFinite(averageReduction)) {
  if (averageReduction < 15) {
    filterReductionAssessment =
      " The low average reduction suggests the filters may not be removing much vibration.";
  } else if (averageReduction > 60) {
    filterReductionAssessment =
      " The high average reduction deserves a closer check for possible over-filtering.";
  }
}
recommendations.push(
  `${cleanestProfile.targetRpm} RPM currently has the lowest remaining filtered vibration` +
  `${
    Number.isFinite(averageReduction)
      ? ` with an average gyro reduction of ${averageReduction.toFixed(1)}%`
      : ""
  }.` +
  filterReductionAssessment +
  ` It should be used as the baseline for the next comparison flight.`
);
} else {
  recommendations.push(
    "Raw and filtered gyro values were compared successfully, but no stable headspeed profiles were available for a profile-specific recommendation."
  );
}
  return {
    score,
    status,
    severity,
    confidence: {
      score: confidenceScore,
      label: confidenceLabel
    },
    summaryFindings,
    findings,
    recommendations,
    evidence,
    detectedColumns: detectedGroups,
    gyroReductionByAxis,
sampleRate,
frequencyPeaksByAxis,
aircraftFrequencyMaps,
aircraftFrequencyMatches,
profileSpecificFilterAnalysis,
};
}