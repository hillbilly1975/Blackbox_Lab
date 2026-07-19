import {
  getColumnValues,
  getColumnValuesByRowIndexes,
  calculateAverageAbsolute
} from "./mathHelpers.js";

function findMatchingColumns(columns, searchTerms) {
  if (!Array.isArray(columns)) {
    return [];
  }

  return columns.filter((columnName) => {
    const normalizedName =
      String(columnName).toLowerCase();

    return searchTerms.some((searchTerm) =>
      normalizedName.includes(searchTerm)
    );
  });
}

function groupPidColumns(pidColumns) {
  const groups = {
    p: [],
    i: [],
    d: [],
    feedforward: [],
    pidSum: []
  };

  for (const columnName of pidColumns) {
    const normalizedName =
      String(columnName).toLowerCase();

    if (normalizedName.includes("pidsum")) {
      groups.pidSum.push(columnName);
    } else if (
      normalizedName.includes("axisf") ||
      normalizedName.includes("feedforward")
    ) {
      groups.feedforward.push(columnName);
    } else if (normalizedName.includes("axisd")) {
      groups.d.push(columnName);
    } else if (normalizedName.includes("axisi")) {
      groups.i.push(columnName);
    } else if (
  normalizedName.includes("axisp") &&
  !normalizedName.includes("axispd")
) {
  groups.p.push(columnName);
}
  }

  return groups;
}

export function analyzePids(
  analysisContext,
  lines = [],
  headspeedProfiles = []
) {
  const allColumns =
  analysisContext?.telemetry?.allColumns ?? [];

  const setpointColumns = findMatchingColumns(
    allColumns,
    [
      "setpoint",
      "axiscommand",
      "axiscommandf",
      "rccommand"
    ]
  );
const axisSetpointColumns =
  setpointColumns.filter((columnName) =>
    /^"?setpoint\[[0-2]\]"?$/i.test(
      String(columnName).trim()
    )
  );
  const axisErrorColumns = findMatchingColumns(
    allColumns,
    [
      "axiserror",
      "error"
    ]
  );

const telemetryHeaderIndex =
  analysisContext?.flight?.telemetryHeaderIndex ?? -1;

 

     
const axisErrorValues =
  axisErrorColumns.map((columnName) => ({
    columnName,
    values: getColumnValues(
      lines,
      telemetryHeaderIndex,
      columnName
    )
  }));
  const axisSetpointValues =
  axisSetpointColumns.map((columnName) => ({
    columnName,
    values: getColumnValues(
      lines,
      telemetryHeaderIndex,
      columnName
    )
  }));
  const axisNames = [
  "Roll",
  "Pitch",
  "Yaw"
];
  const reconstructedAxisResponse =
  axisSetpointValues.map((setpointResult, index) => {
    const errorResult = axisErrorValues[index];

    if (!errorResult) {
      return {
        axis: axisNames[index] ?? `Axis ${index}`,
        sampleCount: 0,
        values: []
      };
    }

    const sampleCount = Math.min(
      setpointResult.values.length,
      errorResult.values.length
    );

    const values = [];

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      values.push(
        setpointResult.values[sampleIndex] -
          errorResult.values[sampleIndex]
      );
    }

    return {
      axis: axisNames[index] ?? `Axis ${index}`,
      sampleCount,
      values
    };
  });
  const averageAbsoluteAxisResponse =
  reconstructedAxisResponse.map((axisResult) => ({
    axis: axisResult.axis,
    sampleCount: axisResult.sampleCount,
    averageAbsoluteResponse:
      calculateAverageAbsolute(axisResult.values)
  }));

  const instantaneousExceedanceAnalysis =
  reconstructedAxisResponse.map((responseResult, index) => {
    const setpointResult = axisSetpointValues[index];

    if (!setpointResult) {
      return {
        axis: responseResult.axis,
        commandSampleCount: 0,
        exceedanceSampleCount: 0,
exceedancePercent: null
      };
    }

    const sampleCount = Math.min(
      responseResult.values.length,
      setpointResult.values.length
    );

    let commandSampleCount = 0;
    let exceedanceSampleCount = 0;

    for (
      let sampleIndex = 0;
      sampleIndex < sampleCount;
      sampleIndex += 1
    ) {
      const setpoint =
        setpointResult.values[sampleIndex];

      const response =
        responseResult.values[sampleIndex];

      if (Math.abs(setpoint) < 5) {
        continue;
      }

      commandSampleCount += 1;

      const sameDirection =
        Math.sign(response) === Math.sign(setpoint);

      const exceededCommand =
        Math.abs(response) > Math.abs(setpoint);

      if (sameDirection && exceededCommand) {
        exceedanceSampleCount += 1;
      }
    }

    return {
  axis: responseResult.axis,
  commandSampleCount,
  exceedanceSampleCount,
  exceedancePercent:
    commandSampleCount > 0
      ? (
          exceedanceSampleCount /
          commandSampleCount
        ) * 100
      : null
};
  });
 const commandEvents =
  axisSetpointValues.map((setpointResult, axisIndex) => {
    const events = [];
    const values = setpointResult.values;
let lastAcceptedEventIndex =
  Number.NEGATIVE_INFINITY;

const minimumEventSpacing = 50;
    for (
      let sampleIndex = 20;
      sampleIndex < values.length;
      sampleIndex += 1
    ) {
      const previousValue = values[sampleIndex - 20];
      const currentValue = values[sampleIndex];

      const commandChange =
      currentValue - previousValue;
      if (Math.abs(commandChange) < 5) {
  continue;
}

if (
  sampleIndex - lastAcceptedEventIndex <
  minimumEventSpacing
) {
  continue;
}

lastAcceptedEventIndex = sampleIndex;
let commandEndSampleIndex =
  sampleIndex;

let stableSampleCount = 0;
const requiredStableSamples = 20;

for (
  let lookAheadIndex = sampleIndex + 1;
  lookAheadIndex <
    Math.min(sampleIndex + 300, values.length);
  lookAheadIndex += 1
) {
  const lookAheadChange =
    values[lookAheadIndex] -
    values[lookAheadIndex - 1];

  if (Math.abs(lookAheadChange) < 0.25) {
    stableSampleCount += 1;
  } else {
    stableSampleCount = 0;
  }

  commandEndSampleIndex =
    lookAheadIndex;

  if (
    stableSampleCount >=
    requiredStableSamples
  ) {
    commandEndSampleIndex =
      lookAheadIndex -
      requiredStableSamples +
      1;

    break;
  }
}

const commandTarget =
  values[commandEndSampleIndex];
const responseResult =
  reconstructedAxisResponse[axisIndex];
const responseWindowStart =
  commandEndSampleIndex;

const responseWindowEnd =
  Math.min(
    responseWindowStart + 200,
    responseResult?.values.length ?? 0
  );
const commandWindow =
  values.slice(
    responseWindowStart,
    responseWindowEnd
  );

const hasOverlappingCommand =
  commandWindow.some((value) =>
    Number.isFinite(value) &&
    Math.abs(value - commandTarget) >= 5
  );
const responseWindow =
  responseResult
    ? responseResult.values.slice(
        responseWindowStart,
        responseWindowEnd
      )
    : [];
const validResponseWindow =
  responseWindow.filter((value) =>
    Number.isFinite(value)
  );

const responsePeak =
  validResponseWindow.length > 0
    ? validResponseWindow.reduce(
        (peak, value) =>
          Math.abs(value) > Math.abs(peak)
            ? value
            : peak,
        validResponseWindow[0]
      )
    : null;

const responsePeakOffset =
  Number.isFinite(responsePeak)
    ? responseWindow.findIndex(
        (value) => value === responsePeak
      )
    : -1;

const responsePeakSampleIndex =
  responsePeakOffset >= 0
    ? responseWindowStart +
      responsePeakOffset
    : null;
 

const commandDirection =
  Math.sign(commandChange);

const responseStart =
  responseWindow.length > 0
    ? responseWindow[0]
    : null;

const responsePeakChange =
  Number.isFinite(responsePeak) &&
  Number.isFinite(responseStart)
    ? responsePeak - responseStart
    : null;

const responsePeakInCommandDirection =
  Number.isFinite(responsePeakChange) &&
  Math.sign(responsePeakChange) ===
    commandDirection;
const crossedCommandTarget =
  Number.isFinite(responsePeak) &&
  (
    commandDirection > 0
      ? responsePeak > commandTarget
      : responsePeak < commandTarget
  );
const commandedResponseChange =
  commandTarget - previousValue;

const overshootAmount =
  !hasOverlappingCommand &&
  responsePeakInCommandDirection &&
  crossedCommandTarget &&
  Number.isFinite(responsePeak) &&
  Number.isFinite(commandTarget)
    ? Math.abs(
        responsePeak - commandTarget
      )
    : null;

const overshootPercent =
  Number.isFinite(overshootAmount) &&
  Math.abs(commandedResponseChange) >= 10
    ? (
        overshootAmount /
        Math.abs(commandedResponseChange)
      ) * 100
    : null;
events.push({
  axis: axisNames[axisIndex] ?? `Axis ${axisIndex}`,
  sampleIndex,
  commandEndSampleIndex,
commandTarget,
  previousSetpoint: previousValue,
  currentSetpoint: currentValue,
  commandChange,
  commandedResponseChange,
commandDirection,
responsePeakInCommandDirection,
overshootAmount,
overshootPercent,
  responseWindowStart,
  responseWindowEnd,
  responseWindow,
  responsePeak,
responsePeakOffset,
responsePeakSampleIndex
});

    }
    return {
      axis: axisNames[axisIndex] ?? `Axis ${axisIndex}`,
      eventCount: events.length,
      events
    };
  });
const profileTrackingAnalysis =
  headspeedProfiles.map((profile) => {
    const axisResults =
      axisErrorColumns.map((columnName, index) => {
        const values =
          getColumnValuesByRowIndexes(
            lines,
            telemetryHeaderIndex,
            columnName,
            profile.sampleIndexes
          );

        return {
          axis: axisNames[index] ?? `Axis ${index}`,
          columnName,
          sampleCount: values.length,
          averageAbsoluteError:
            calculateAverageAbsolute(values)
        };
      });

    const validAxisErrors =
  axisResults
    .map((axisResult) =>
      axisResult.averageAbsoluteError
    )
    .filter((value) =>
      Number.isFinite(value)
    );

const averageTrackingError =
  validAxisErrors.length > 0
    ? validAxisErrors.reduce(
        (sum, value) => sum + value,
        0
      ) / validAxisErrors.length
    : null;

return {
  targetRpm: profile.targetRpm,
  sampleCount: profile.sampleIndexes.length,
  axisResults,
  averageTrackingError
};
  });
  const validProfileTrackingResults =
  profileTrackingAnalysis.filter((profile) =>
    Number.isFinite(profile.averageTrackingError)
  );

const bestTrackingProfile =
  validProfileTrackingResults.reduce(
    (best, profile) => {
      if (
        !best ||
        profile.averageTrackingError <
          best.averageTrackingError
      ) {
        return profile;
      }

      return best;
    },
    null
  );

const worstTrackingProfile =
  validProfileTrackingResults.reduce(
    (worst, profile) => {
      if (
        !worst ||
        profile.averageTrackingError >
          worst.averageTrackingError
      ) {
        return profile;
      }

      return worst;
    },
    null
  );
const averageAbsoluteAxisError =
  axisErrorValues.map((axisResult, index) => ({
    axis: axisNames[index] ?? `Axis ${index}`,
    columnName: axisResult.columnName,
    sampleCount: axisResult.values.length,
    averageAbsoluteError:
      calculateAverageAbsolute(axisResult.values)
  }));
  


const pidColumns = findMatchingColumns(
 
    allColumns,
    [
      "axisp",
      "axisi",
      "axisd",
      "axisf",
      "pidsum",
      "pid"
    ]
  );
  
   
const groupedPidColumns =
  groupPidColumns(pidColumns);
  const validAxisCount =
  averageAbsoluteAxisError.filter(
    (axisResult) =>
      Number.isFinite(axisResult.averageAbsoluteError) &&
      axisResult.sampleCount > 0
  ).length;
  const minimumSampleCount =
  averageAbsoluteAxisError.reduce(
    (smallest, axisResult) =>
      Math.min(smallest, axisResult.sampleCount),
    Number.POSITIVE_INFINITY
  );

let confidenceScore = 10;

if (validAxisCount === 3) {
  confidenceScore += 40;
}

if (minimumSampleCount >= 10000) {
  confidenceScore += 30;
}

if (
  axisSetpointColumns.length === 3 &&
  groupedPidColumns.p.length === 3 &&
  groupedPidColumns.i.length === 3 &&
  groupedPidColumns.d.length === 3 &&
  groupedPidColumns.feedforward.length === 3
) {
  confidenceScore += 20;
}

const confidenceLevel =
  confidenceScore >= 80
    ? "High"
    : confidenceScore >= 50
      ? "Medium"
      : "Low";
      const highestTrackingErrorAxis =
  averageAbsoluteAxisError.reduce(
    (highest, axisResult) => {
      if (
        !Number.isFinite(
          axisResult.averageAbsoluteError
        )
      ) {
        return highest;
      }

      if (
        !highest ||
        axisResult.averageAbsoluteError >
          highest.averageAbsoluteError
      ) {
        return axisResult;
      }

      return highest;
    },
    null
  );
  return {
    status: "PID Tracking Analysis Complete",
    score: null,
    confidence: {
  level: confidenceLevel,
  score: confidenceScore,
  
},

    findings: [
      `Axis setpoint columns detected: ${axisSetpointColumns.length}`,
      `Axis-error columns detected: ${axisErrorColumns.length}`,
      `Axis-error column names: ${axisErrorColumns.join(", ")}`,
      ...averageAbsoluteAxisError.map((axisResult) =>
        `${axisResult.axis} average absolute tracking error: ${
    Number.isFinite(axisResult.averageAbsoluteError)
      ? axisResult.averageAbsoluteError.toFixed(2)
      : "Unavailable"
  } from ${axisResult.sampleCount} samples`
),
...averageAbsoluteAxisResponse.map((axisResult) =>
  `${axisResult.axis} average absolute response: ${
    Number.isFinite(axisResult.averageAbsoluteResponse)
      ? axisResult.averageAbsoluteResponse.toFixed(2)
      : "Unavailable"
  } from ${axisResult.sampleCount} samples`
),
...instantaneousExceedanceAnalysis.map((axisResult) =>
  `${axisResult.axis} instantaneous exceedance rate: ${
    
    Number.isFinite(axisResult.exceedancePercent)
      ? axisResult.exceedancePercent.toFixed(2)
      : "Unavailable"
  }% from ${axisResult.commandSampleCount} command samples`
),
...commandEvents.map((axisResult) =>
  `${axisResult.axis} meaningful command events detected: ${axisResult.eventCount}`
),
...commandEvents.flatMap((axisResult) => {
  const validPeakEvents =
    axisResult.events.filter((event) =>
      Number.isFinite(event.responsePeak)
    );

  const averageAbsolutePeak =
    validPeakEvents.length > 0
      ? validPeakEvents.reduce(
          (sum, event) =>
            sum + Math.abs(event.responsePeak),
          0
        ) / validPeakEvents.length
      : null;

  return [
    `${axisResult.axis} events with valid response peaks: ${validPeakEvents.length}`,
    `${axisResult.axis} average absolute response peak: ${
      Number.isFinite(averageAbsolutePeak)
        ? averageAbsolutePeak.toFixed(2)
        : "Unavailable"
    }`
  ];
}),
...commandEvents.flatMap((axisResult) => {
  const validOvershootEvents =
    axisResult.events.filter((event) =>
      Number.isFinite(event.overshootPercent)
    );

  const averageOvershootPercent =
    validOvershootEvents.length > 0
      ? validOvershootEvents.reduce(
          (sum, event) =>
            sum + event.overshootPercent,
          0
        ) / validOvershootEvents.length
      : null;
const sortedOvershootPercentages =
  validOvershootEvents
    .map((event) => event.overshootPercent)
    .sort((firstValue, secondValue) =>
      firstValue - secondValue
    );

const medianOvershootPercent =
  sortedOvershootPercentages.length > 0
    ? (
        sortedOvershootPercentages[
          Math.floor(
            (sortedOvershootPercentages.length - 1) / 2
          )
        ] +
        sortedOvershootPercentages[
          Math.ceil(
            (sortedOvershootPercentages.length - 1) / 2
          )
        ]
      ) / 2
    : null;

const trimmedOvershootPercentages =
  sortedOvershootPercentages.length >= 5
    ? sortedOvershootPercentages.slice(0, -1)
    : sortedOvershootPercentages;

const trimmedMaximumOvershootPercent =
  trimmedOvershootPercentages.length > 0
    ? Math.max(...trimmedOvershootPercentages)
    : null;
  const maximumOvershootPercent =
    validOvershootEvents.length > 0
      ? Math.max(
          ...validOvershootEvents.map(
            (event) => event.overshootPercent
          )
        )
      : null;
const highestOvershootEvent =
  validOvershootEvents.reduce(
    (highestEvent, event) => {
      if (
        !highestEvent ||
        event.overshootPercent >
          highestEvent.overshootPercent
      ) {
        return event;
      }

      return highestEvent;
    },
    null
  );
  const overshootConfidence =
  
  validOvershootEvents.length >= 10
    ? "High"
    : validOvershootEvents.length >= 5
      ? "Medium"
      : validOvershootEvents.length >= 2
        ? "Low"
        : "Insufficient";
    const overshootRecommendation =
  overshootConfidence === "Insufficient"
    ? `Collect more clean ${axisResult.axis} command events before making an overshoot-related PID change.`
    : Number.isFinite(medianOvershootPercent) &&
        medianOvershootPercent >= 25
      ? `Review ${axisResult.axis} for repeated overshoot. Confirm the pattern with another log before changing PID or feedforward values.`
      : `No repeated ${axisResult.axis} overshoot pattern was identified from the available clean events.`;   
  
return [
  `${axisResult.axis} events with valid overshoot measurements: ${validOvershootEvents.length}`,
  `${axisResult.axis} overshoot confidence: ${overshootConfidence}`,
`${axisResult.axis} overshoot recommendation: ${overshootRecommendation}`,
  
  `${axisResult.axis} average event overshoot: ${
    Number.isFinite(averageOvershootPercent)
      ? averageOvershootPercent.toFixed(2)
      : "Unavailable"
  }%`,

  `${axisResult.axis} median event overshoot: ${
    Number.isFinite(medianOvershootPercent)
      ? medianOvershootPercent.toFixed(2)
      : "Unavailable"
  }%`,

  `${axisResult.axis} trimmed maximum event overshoot: ${
    Number.isFinite(trimmedMaximumOvershootPercent)
      ? trimmedMaximumOvershootPercent.toFixed(2)
      : "Unavailable"
  }%`,

  `${axisResult.axis} raw maximum event overshoot: ${
    Number.isFinite(maximumOvershootPercent)
      ? maximumOvershootPercent.toFixed(2)
      : "Unavailable"
  }%`
,

highestOvershootEvent
  ? `${axisResult.axis} highest overshoot event details — sample: ${highestOvershootEvent.sampleIndex}, command end: ${highestOvershootEvent.commandEndSampleIndex}, previous setpoint: ${highestOvershootEvent.previousSetpoint.toFixed(2)}, target: ${highestOvershootEvent.commandTarget.toFixed(2)}, commanded change: ${highestOvershootEvent.commandedResponseChange.toFixed(2)}, response peak: ${highestOvershootEvent.responsePeak.toFixed(2)}, overshoot: ${highestOvershootEvent.overshootPercent.toFixed(2)}%`
  : `${axisResult.axis} highest overshoot event details: Unavailable`
];
}),
 
highestTrackingErrorAxis
  ? `${highestTrackingErrorAxis.axis} has the highest average tracking error at ${highestTrackingErrorAxis.averageAbsoluteError.toFixed(2)}. This axis deserves the closest review during PID tuning.`
  : "A highest tracking-error axis could not be identified.",

...profileTrackingAnalysis.flatMap((profile) => [
  `${profile.targetRpm} RPM profile tracking from ${profile.sampleCount} samples:`,
  ...profile.axisResults.map((axisResult) =>
    `  ${axisResult.axis}: ${
      Number.isFinite(axisResult.averageAbsoluteError)
        ? axisResult.averageAbsoluteError.toFixed(2)
        : "Unavailable"
    } average absolute error`
  )
]),

bestTrackingProfile
  ? `${bestTrackingProfile.targetRpm} RPM has the lowest overall tracking error at ${bestTrackingProfile.averageTrackingError.toFixed(2)}.`
  : "A best tracking profile could not be identified.",

worstTrackingProfile
  ? `${worstTrackingProfile.targetRpm} RPM has the highest overall tracking error at ${worstTrackingProfile.averageTrackingError.toFixed(2)}.`
  : "A worst tracking profile could not be identified.",
     `P-term columns detected: ${groupedPidColumns.p.length}`,
      `P-term column names: ${groupedPidColumns.p.join(", ")}`,
      `Axis setpoint column names: ${axisSetpointColumns.join(", ")}`,
`I-term columns detected: ${groupedPidColumns.i.length}`,
`D-term columns detected: ${groupedPidColumns.d.length}`,
`Feedforward columns detected: ${groupedPidColumns.feedforward.length}`,
`PID-sum columns detected: ${groupedPidColumns.pidSum.length}`
    ],
    recommendations: [
  highestTrackingErrorAxis
    ? `Review ${highestTrackingErrorAxis.axis} first during PID tuning. Compare its setpoint, axis error, and P/I/D/feedforward response before changing any values.`
    : "Collect a log with valid Roll, Pitch, and Yaw tracking data before making PID changes.",
    bestTrackingProfile &&
worstTrackingProfile &&
bestTrackingProfile.targetRpm !==
  worstTrackingProfile.targetRpm
  ? `Use ${bestTrackingProfile.targetRpm} RPM as the current PID-tracking baseline. The ${worstTrackingProfile.targetRpm} RPM profile produced higher overall tracking error. Review its axis response and vibration evidence before changing global PID values.`
  : "More than one valid headspeed profile is needed for a profile-to-profile PID recommendation."
],
    evidence: [
      {
        source: "Setpoint Columns",
        value: setpointColumns
      },
      {
        source: "Axis Error Columns",
        value: axisErrorColumns
      },
      {
        source: "PID Columns",
        value: pidColumns
      }
    ],
    detectedColumns: {
  setpoint: setpointColumns,
  axisSetpoint: axisSetpointColumns,
  axisError: axisErrorColumns,
  pid: pidColumns,
  groupedPid: groupedPidColumns,
  trackingAnalysis: {
  averageAbsoluteAxisError,
  averageAbsoluteAxisResponse,
  instantaneousExceedanceAnalysis,
  commandEvents,
  profileTrackingAnalysis
},
},    analysisContext,
    lineCount: Array.isArray(lines)
      ? lines.length
      : 0
  };
}