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
    const bounceBackWindowStart =
  Number.isInteger(responsePeakSampleIndex)
    ? responsePeakSampleIndex + 1
    : null;

const bounceBackWindow =
  Number.isInteger(bounceBackWindowStart) &&
  responseResult
    ? responseResult.values.slice(
        bounceBackWindowStart,
        responseWindowEnd
      )
    : [];

const validBounceBackWindow =
  bounceBackWindow.filter((value) =>
    Number.isFinite(value)
  );
  const bounceBackSampleCount =
  validBounceBackWindow.length;

const hasSufficientBounceBackWindow =
  bounceBackSampleCount >= 3;
  const bounceBackExtreme =
  hasSufficientBounceBackWindow
    ? commandDirection > 0
      ? Math.min(...validBounceBackWindow)
      : Math.max(...validBounceBackWindow)
    : null;

    const responseReachedTarget =
  Number.isFinite(responsePeak) &&
  Number.isFinite(commandTarget)
    ? commandDirection > 0
      ? responsePeak >= commandTarget
      : responsePeak <= commandTarget
    : false;

const bounceBackAmount =
  responseReachedTarget &&
  Number.isFinite(commandTarget) &&
  Number.isFinite(bounceBackExtreme)
    ? commandDirection > 0
      ? Math.max(
          0,
          commandTarget - bounceBackExtreme
        )
      : Math.max(
          0,
          bounceBackExtreme - commandTarget
        )
    : null;


    const bounceBackPercent =
  hasSufficientBounceBackWindow &&
  responseReachedTarget &&
  Number.isFinite(bounceBackAmount) &&
  Math.abs(commandedResponseChange) >= 10
    ? (
        bounceBackAmount /
        Math.abs(commandedResponseChange)
      ) * 100
    : null;
    const bounceBackEligible =
  hasSufficientBounceBackWindow &&
  responseReachedTarget &&
  Number.isFinite(bounceBackPercent);
  const settlingTolerance =
  Number.isFinite(commandedResponseChange)
    ? Math.max(
        2,
        Math.abs(commandedResponseChange) * 0.1
      )
    : null;
    const settlingInToleranceFlags =
  Number.isFinite(commandTarget) &&
  Number.isFinite(settlingTolerance)
    ? responseWindow.map((value) =>
        Number.isFinite(value) &&
        Math.abs(value - commandTarget) <=
          settlingTolerance
      )
    : [];
    const requiredSettledSamples = 20;
    let settlingStartOffset = null;
let consecutiveSettledSamples = 0;

for (
  let offset = 0;
  offset < settlingInToleranceFlags.length;
  offset += 1
) {
  if (settlingInToleranceFlags[offset]) {
    consecutiveSettledSamples += 1;
  } else {
    consecutiveSettledSamples = 0;
  }

  if (
    consecutiveSettledSamples >=
    requiredSettledSamples
  ) {
    settlingStartOffset =
      offset -
      requiredSettledSamples +
      1;

    break;
      }
    }

    const settlingSampleIndex =
  Number.isInteger(settlingStartOffset)
    ? responseWindowStart +
      settlingStartOffset
    : null;
    const settlingDurationSamples =
  Number.isInteger(settlingStartOffset)
    ? settlingStartOffset
    : null;
    const settlingDetected =
  Number.isInteger(settlingSampleIndex) &&
  Number.isInteger(settlingDurationSamples);
  const settlingEligible =
  !hasOverlappingCommand &&
  settlingDetected &&
  Math.abs(commandedResponseChange) >= 10;
  const ringingErrorWindow =
  Number.isFinite(commandTarget)
    ? bounceBackWindow.map((value) =>
        Number.isFinite(value)
          ? value - commandTarget
          : null
      )
    : [];
    const ringingNoiseThreshold =
  Number.isFinite(settlingTolerance)
    ? Math.max(
        1,
        settlingTolerance * 0.5
      )
    : 1;

const significantRingingErrorWindow =
  ringingErrorWindow.map((error) =>
    Number.isFinite(error) &&
    Math.abs(error) >= ringingNoiseThreshold
      ? error
      : 0
  );
  let ringingTargetCrossingCount = 0;
let previousRingingSign = 0;

for (
  const error of significantRingingErrorWindow
) {
  const currentRingingSign = Math.sign(error);

  if (currentRingingSign === 0) {
    continue;
  }

  if (
    previousRingingSign !== 0 &&
    currentRingingSign !== previousRingingSign
  ) {
    ringingTargetCrossingCount += 1;
  }

  previousRingingSign = currentRingingSign;
}
  const ringingSampleCount =
  significantRingingErrorWindow.length;

const hasSufficientRingingWindow =
  ringingSampleCount >= 20;
  const ringingEligible =
  !hasOverlappingCommand &&
  hasSufficientRingingWindow &&
  Math.abs(commandedResponseChange) >= 10;


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
bounceBackWindowStart,
bounceBackWindow,
validBounceBackWindow,
bounceBackSampleCount,
hasSufficientBounceBackWindow,
bounceBackExtreme,
bounceBackAmount,
bounceBackPercent,
bounceBackEligible,
settlingTolerance,
settlingInToleranceFlags,
requiredSettledSamples,
settlingStartOffset,
settlingSampleIndex,
settlingDurationSamples,
settlingDetected,
settlingEligible,
ringingErrorWindow,
ringingNoiseThreshold,
significantRingingErrorWindow,
ringingTargetCrossingCount,
ringingSampleCount,
hasSufficientRingingWindow,
ringingEligible,
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
  const pidTermValues = {
  p: groupedPidColumns.p.map(
    (columnName, axisIndex) => ({
      axis:
        axisNames[axisIndex] ??
        `Axis ${axisIndex}`,
      columnName,
      values: getColumnValues(
        lines,
        telemetryHeaderIndex,
        columnName
      )
    })
  ),

  i: groupedPidColumns.i.map(
    (columnName, axisIndex) => ({
      axis:
        axisNames[axisIndex] ??
        `Axis ${axisIndex}`,
      columnName,
      values: getColumnValues(
        lines,
        telemetryHeaderIndex,
        columnName
      )
    })
  ),

  d: groupedPidColumns.d.map(
    (columnName, axisIndex) => ({
      axis:
        axisNames[axisIndex] ??
        `Axis ${axisIndex}`,
      columnName,
      values: getColumnValues(
        lines,
        telemetryHeaderIndex,
        columnName
      )
    })
  ),

  feedforward:
    groupedPidColumns.feedforward.map(
      (columnName, axisIndex) => ({
        axis:
          axisNames[axisIndex] ??
          `Axis ${axisIndex}`,
        columnName,
        values: getColumnValues(
          lines,
          telemetryHeaderIndex,
          columnName
        )
      })
    )
};
const pidTermAverageAbsolute = {
  p: pidTermValues.p.map((termResult) => ({
    axis: termResult.axis,
    columnName: termResult.columnName,
    sampleCount: termResult.values.length,
    averageAbsolute:
      calculateAverageAbsolute(termResult.values)
  })),

  i: pidTermValues.i.map((termResult) => ({
    axis: termResult.axis,
    columnName: termResult.columnName,
    sampleCount: termResult.values.length,
    averageAbsolute:
      calculateAverageAbsolute(termResult.values)
  })),

  d: pidTermValues.d.map((termResult) => ({
    axis: termResult.axis,
    columnName: termResult.columnName,
    sampleCount: termResult.values.length,
    averageAbsolute:
      calculateAverageAbsolute(termResult.values)
  })),

  feedforward:
    pidTermValues.feedforward.map(
      (termResult) => ({
        axis: termResult.axis,
        columnName: termResult.columnName,
        sampleCount: termResult.values.length,
        averageAbsolute:
          calculateAverageAbsolute(
            termResult.values
          )
      })
    )
};
const pidCommandWindowsByAxis =
  commandEvents.map((axisResult, axisIndex) => ({
    axis: axisResult.axis,
    axisIndex,
    windows: axisResult.events
      .filter(
        (event) =>
          Number.isInteger(
            event?.responseWindowStart
          ) &&
          Number.isInteger(
            event?.responseWindowEnd
          ) &&
          event.responseWindowEnd >=
            event.responseWindowStart
      )
      .map((event) => ({
        startSampleIndex:
          event.responseWindowStart,
        endSampleIndex:
          event.responseWindowEnd
      }))
  }));
const getValuesFromCommandWindows = (
  values,
  windows
) => {
  const commandValues = [];

  for (const window of windows) {
    const startSampleIndex =
      Math.max(0, window.startSampleIndex);

    const endSampleIndex =
      Math.min(
        values.length - 1,
        window.endSampleIndex
      );

    for (
      let sampleIndex = startSampleIndex;
      sampleIndex <= endSampleIndex;
      sampleIndex += 1
    ) {
      const value = values[sampleIndex];

      if (Number.isFinite(value)) {
        commandValues.push(value);
      }
    }
  }

  return commandValues;
};
const pidCommandTermAverageAbsolute =
  axisNames.map((axis, axisIndex) => {
    const windows =
      pidCommandWindowsByAxis[axisIndex]
        ?.windows ?? [];

    const pValues =
      getValuesFromCommandWindows(
        pidTermValues.p[axisIndex]?.values ?? [],
        windows
      );

    const iValues =
      getValuesFromCommandWindows(
        pidTermValues.i[axisIndex]?.values ?? [],
        windows
      );

    const dValues =
      getValuesFromCommandWindows(
        pidTermValues.d[axisIndex]?.values ?? [],
        windows
      );

    const feedforwardValues =
      getValuesFromCommandWindows(
        pidTermValues.feedforward[axisIndex]
          ?.values ?? [],
        windows
      );

    return {
      axis,
      commandWindowCount: windows.length,
      pSampleCount: pValues.length,
      iSampleCount: iValues.length,
      dSampleCount: dValues.length,
      feedforwardSampleCount:
        feedforwardValues.length,
      pAverage:
        calculateAverageAbsolute(pValues),
      iAverage:
        calculateAverageAbsolute(iValues),
      dAverage:
        calculateAverageAbsolute(dValues),
      feedforwardAverage:
        calculateAverageAbsolute(
          feedforwardValues
        )
    };
  });
  const pidCommandTermContributionPercentages =
  pidCommandTermAverageAbsolute.map(
    (axisResult) => {
      const validTermAverages = [
        axisResult.pAverage,
        axisResult.iAverage,
        axisResult.dAverage,
        axisResult.feedforwardAverage
      ].filter((value) =>
        Number.isFinite(value)
      );
      

      

      const totalCommandActivity =
        validTermAverages.length > 0
          ? validTermAverages.reduce(
              (sum, value) => sum + value,
              0
            )
          : null;

      const calculatePercent = (value) =>
        Number.isFinite(value) &&
        Number.isFinite(totalCommandActivity) &&
        totalCommandActivity > 0
          ? (
              value /
              totalCommandActivity
            ) * 100
          : null;

      return {
        ...axisResult,
        totalCommandActivity,
        pPercent:
          calculatePercent(axisResult.pAverage),
        iPercent:
          calculatePercent(axisResult.iAverage),
        dPercent:
          calculatePercent(axisResult.dAverage),
        feedforwardPercent:
          calculatePercent(
            axisResult.feedforwardAverage
          )
      };
    }
  );

const pidTermContributionByAxis =
  axisNames.map((axis, axisIndex) => {
    const pAverage =
      pidTermAverageAbsolute.p[axisIndex]
        ?.averageAbsolute ?? null;

    const iAverage =
      pidTermAverageAbsolute.i[axisIndex]
        ?.averageAbsolute ?? null;

    const dAverage =
      pidTermAverageAbsolute.d[axisIndex]
        ?.averageAbsolute ?? null;

    const feedforwardAverage =
      pidTermAverageAbsolute.feedforward[
        axisIndex
      ]?.averageAbsolute ?? null;

    return {
      axis,
      pAverage,
      iAverage,
      dAverage,
      feedforwardAverage
    };
  });
  const pidTermContributionTotals =
  pidTermContributionByAxis.map((axisResult) => {
    const validTermAverages = [
      axisResult.pAverage,
      axisResult.iAverage,
      axisResult.dAverage,
      axisResult.feedforwardAverage
    ].filter((value) =>
      Number.isFinite(value)
    );

    const totalAverageActivity =
      validTermAverages.length > 0
        ? validTermAverages.reduce(
            (sum, value) => sum + value,
            0
          )
        : null;

    return {
      ...axisResult,
      totalAverageActivity
    };
  });
  const pidTermContributionPercentages =
  pidTermContributionTotals.map((axisResult) => {
    const total =
      axisResult.totalAverageActivity;

    const calculatePercent = (value) =>
      Number.isFinite(value) &&
      Number.isFinite(total) &&
      total > 0
        ? (value / total) * 100
        : null;

    return {
      ...axisResult,
      pPercent:
        calculatePercent(axisResult.pAverage),
      iPercent:
        calculatePercent(axisResult.iAverage),
      dPercent:
        calculatePercent(axisResult.dAverage),
      feedforwardPercent:
        calculatePercent(
          axisResult.feedforwardAverage
        )
    };
  });
  const dominantPidTermByAxis =
  pidTermContributionPercentages.map(
    (axisResult) => {
      const termPercentages = [
        {
          term: "P",
          percent: axisResult.pPercent
        },
        {
          term: "I",
          percent: axisResult.iPercent
        },
        {
          term: "D",
          percent: axisResult.dPercent
        },
        {
          term: "Feedforward",
          percent:
            axisResult.feedforwardPercent
        }
      ].filter((termResult) =>
        Number.isFinite(termResult.percent)
      );

      const dominantTerm =
        termPercentages.reduce(
          (highest, termResult) => {
            if (
              !highest ||
              termResult.percent >
                highest.percent
            ) {
              return termResult;
            }

            return highest;
          },
          null
        );

      return {
        axis: axisResult.axis,
        dominantTerm:
          dominantTerm?.term ?? null,
        dominantPercent:
          dominantTerm?.percent ?? null
      };
    }
  );

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
  const pidCommandBalanceAssessment =
  pidCommandTermContributionPercentages.map(
    (axisResult) => {
      const hasUsableContributionData =
        axisResult.commandWindowCount >= 3 &&
        Number.isFinite(axisResult.iPercent) &&
        Number.isFinite(axisResult.pPercent) &&
        Number.isFinite(
          axisResult.feedforwardPercent
        );

      const isHighestTrackingErrorAxis =
        highestTrackingErrorAxis?.axis ===
        axisResult.axis;

      const iRemainsDominantDuringCommands =
        axisResult.iPercent >= 65;

      const commandSupportIsLow =
        axisResult.pPercent +
          axisResult.feedforwardPercent <
        35;

      const status =
        !hasUsableContributionData
          ? "Insufficient Data"
          : isHighestTrackingErrorAxis &&
              iRemainsDominantDuringCommands &&
              commandSupportIsLow
            ? "Review"
            : "Clear";

      return {
        axis: axisResult.axis,
        status,
        commandWindowCount:
          axisResult.commandWindowCount,
        isHighestTrackingErrorAxis,
        iRemainsDominantDuringCommands,
        commandSupportIsLow
      };
    }
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
 ...commandEvents.flatMap((axisResult) => {
  const validBounceBackEvents =
    axisResult.events.filter((event) =>
      event?.bounceBackEligible === true &&
      Number.isFinite(event?.bounceBackPercent)
    );

  const bounceBackPercentValues =
    validBounceBackEvents.map(
      (event) => event.bounceBackPercent
    );
const averageBounceBackPercent =
  bounceBackPercentValues.length > 0
    ? bounceBackPercentValues.reduce(
        (sum, value) => sum + value,
        0
      ) / bounceBackPercentValues.length
    : null;
    const sortedBounceBackPercentValues =
  [...bounceBackPercentValues].sort(
    (a, b) => a - b
  );

const medianBounceBackPercent =
sortedBounceBackPercentValues.length > 0
    ? sortedBounceBackPercentValues.length % 2 === 1
      ? sortedBounceBackPercentValues[
          Math.floor(
            sortedBounceBackPercentValues.length / 2
          )
        ]
      : (
          sortedBounceBackPercentValues[
            sortedBounceBackPercentValues.length / 2 - 1
          ] +
          sortedBounceBackPercentValues[
            sortedBounceBackPercentValues.length / 2
          ]
        ) / 2
    : null;
    const maximumBounceBackPercent =
  bounceBackPercentValues.length > 0
    ? Math.max(...bounceBackPercentValues)
    : null;
  
  const trimmedBounceBackPercentValues =
  sortedBounceBackPercentValues.length >= 4
    ? sortedBounceBackPercentValues.slice(0, -1)
    : sortedBounceBackPercentValues;

const trimmedMaximumBounceBackPercent =
  trimmedBounceBackPercentValues.length > 0
    ? Math.max(...trimmedBounceBackPercentValues)
    : null;
    const highestBounceBackEvent =
  validBounceBackEvents.reduce(
    (highestEvent, event) => {
      if (
        !highestEvent ||
        event.bounceBackPercent >
          highestEvent.bounceBackPercent
      ) {
        return event;
      }

      return highestEvent;
    },
    null
    );
    const bounceBackConfidence =
  validBounceBackEvents.length >= 5
    ? "High"
    : validBounceBackEvents.length >= 3
      ? "Medium"
      : validBounceBackEvents.length >= 2
        ? "Low"
        : "Insufficient";
        const bounceBackRecommendation =
  bounceBackConfidence === "Insufficient" ||
  bounceBackConfidence === "Low"
    ? `Collect more clean ${axisResult.axis} command events before evaluating bounce-back.`
    : Number.isFinite(medianBounceBackPercent) &&
        medianBounceBackPercent >= 15
      ? `Review ${axisResult.axis} for repeated response reversal after command peaks. Confirm the pattern before changing PID gains.`
      : `No repeated ${axisResult.axis} bounce-back pattern was identified from the valid command events.`;
      const bounceBackStatus =
  bounceBackConfidence === "Insufficient" ||
  bounceBackConfidence === "Low"
    ? "Insufficient Data"
    : Number.isFinite(medianBounceBackPercent) &&
        medianBounceBackPercent >= 15
      ? "Review"
      : "Clear";
return [
  `${axisResult.axis} events with valid bounce-back measurements: ${validBounceBackEvents.length}`,
  `${axisResult.axis} bounce-back status: ${bounceBackStatus}`,
  `${axisResult.axis} bounce-back confidence: ${bounceBackConfidence}`,
  `${axisResult.axis} bounce-back evidence: ${validBounceBackEvents.length} valid event${
  validBounceBackEvents.length === 1 ? "" : "s"
}`,
  `${axisResult.axis} bounce-back recommendation: ${bounceBackRecommendation}`,

  `${axisResult.axis} average event bounce-back: ${
    Number.isFinite(averageBounceBackPercent)
      ? averageBounceBackPercent.toFixed(2)
      : "Unavailable"
  }%`,

  `${axisResult.axis} median event bounce-back: ${
    Number.isFinite(medianBounceBackPercent)
      ? medianBounceBackPercent.toFixed(2)
      : "Unavailable"
  }%`,

  `${axisResult.axis} trimmed maximum event bounce-back: ${
    Number.isFinite(trimmedMaximumBounceBackPercent)
      ? trimmedMaximumBounceBackPercent.toFixed(2)
      : "Unavailable"
  }%`,

  `${axisResult.axis} raw maximum event bounce-back: ${
    Number.isFinite(maximumBounceBackPercent)
      ? maximumBounceBackPercent.toFixed(2)
      : "Unavailable"
  }%`,

  highestBounceBackEvent
    ? `${axisResult.axis} highest bounce-back event details — sample: ${highestBounceBackEvent.sampleIndex}, target: ${
        Number.isFinite(highestBounceBackEvent.commandTarget)
          ? highestBounceBackEvent.commandTarget.toFixed(2)
          : "Unavailable"
      }, response peak: ${
        Number.isFinite(highestBounceBackEvent.responsePeak)
          ? highestBounceBackEvent.responsePeak.toFixed(2)
          : "Unavailable"
      }, bounce-back extreme: ${
        Number.isFinite(highestBounceBackEvent.bounceBackExtreme)
          ? highestBounceBackEvent.bounceBackExtreme.toFixed(2)
          : "Unavailable"
      }, bounce-back: ${
        Number.isFinite(highestBounceBackEvent.bounceBackPercent)
          ? highestBounceBackEvent.bounceBackPercent.toFixed(2)
          : "Unavailable"
      }%`
    : `${axisResult.axis} highest bounce-back event details: Unavailable`
];
}),
...commandEvents.flatMap((axisResult) => {
  const validSettlingEvents =
    axisResult.events.filter((event) =>
      event?.settlingEligible === true &&
      Number.isFinite(
        event?.settlingDurationSamples
      )
    );

  const settlingDurationSamples =
    validSettlingEvents.map(
      (event) => event.settlingDurationSamples
    );
const averageSettlingDurationSamples =
  settlingDurationSamples.length > 0
    ? settlingDurationSamples.reduce(
        (sum, value) => sum + value,
        0
      ) / settlingDurationSamples.length
    : null;
    const sortedSettlingDurationSamples =
  [...settlingDurationSamples].sort(
    (a, b) => a - b
  );

const medianSettlingDurationSamples =
  sortedSettlingDurationSamples.length > 0
    ? sortedSettlingDurationSamples.length % 2 === 1
      ? sortedSettlingDurationSamples[
          Math.floor(
            sortedSettlingDurationSamples.length / 2
          )
        ]
      : (
          sortedSettlingDurationSamples[
            sortedSettlingDurationSamples.length / 2 - 1
          ] +
          sortedSettlingDurationSamples[
            sortedSettlingDurationSamples.length / 2
          ]
        ) / 2
    : null;
    const maximumSettlingDurationSamples =
  settlingDurationSamples.length > 0
    ? Math.max(...settlingDurationSamples)
    : null;
    const trimmedSettlingDurationSamples =
  sortedSettlingDurationSamples.length >= 4
    ? sortedSettlingDurationSamples.slice(0, -1)
    : sortedSettlingDurationSamples;

const trimmedMaximumSettlingDurationSamples =
  trimmedSettlingDurationSamples.length > 0
    ? Math.max(...trimmedSettlingDurationSamples)
    : null;
    const highestSettlingDurationEvent =
  validSettlingEvents.reduce(
    (highestEvent, event) => {
      if (
        !highestEvent ||
        event.settlingDurationSamples >
          highestEvent.settlingDurationSamples
      ) {
        return event;
      }

      return highestEvent;
    },
    null
  );
  const settlingConfidence =
  validSettlingEvents.length >= 5
    ? "High"
    : validSettlingEvents.length >= 3
      ? "Medium"
      : validSettlingEvents.length >= 2
        ? "Low"
        : "Insufficient";
        const settlingRecommendation =
  settlingConfidence === "Insufficient" ||
  settlingConfidence === "Low"
    ? `Collect more clean ${axisResult.axis} command events before evaluating settling behavior.`
    : Number.isFinite(
        medianSettlingDurationSamples
      ) &&
        medianSettlingDurationSamples >= 100
      ? `Review ${axisResult.axis} for slow settling after command changes. Confirm the pattern with another log before changing PID values.`
      : `No repeated slow-settling pattern was identified for ${axisResult.axis}.`;
      const settlingStatus =
  settlingConfidence === "Insufficient" ||
  settlingConfidence === "Low"
    ? "Insufficient Data"
    : Number.isFinite(
        medianSettlingDurationSamples
      ) &&
        medianSettlingDurationSamples >= 100
      ? "Review"
      : "Clear";
  return [
  `${axisResult.axis} settling status: ${settlingStatus}`,
  `${axisResult.axis} settling confidence: ${settlingConfidence}`,
  `${axisResult.axis} settling evidence: ${validSettlingEvents.length} valid event${
    validSettlingEvents.length === 1 ? "" : "s"
  }`,
  
  `${axisResult.axis} settling recommendation: ${settlingRecommendation}`,
  `${axisResult.axis} average settling duration: ${
  Number.isFinite(averageSettlingDurationSamples)
    ? averageSettlingDurationSamples.toFixed(2)
    : "Unavailable"
} samples`,

`${axisResult.axis} median settling duration: ${
  Number.isFinite(medianSettlingDurationSamples)
    ? medianSettlingDurationSamples.toFixed(2)
    : "Unavailable"
} samples`,
`${axisResult.axis} trimmed maximum settling duration: ${
  Number.isFinite(trimmedMaximumSettlingDurationSamples)
    ? trimmedMaximumSettlingDurationSamples.toFixed(2)
    : "Unavailable"
} samples`,

`${axisResult.axis} raw maximum settling duration: ${
  Number.isFinite(maximumSettlingDurationSamples)
    ? maximumSettlingDurationSamples.toFixed(2)
    : "Unavailable"
} samples`,
highestSettlingDurationEvent
  ? `${axisResult.axis} slowest settling event details — sample: ${highestSettlingDurationEvent.sampleIndex}, command end: ${highestSettlingDurationEvent.commandEndSampleIndex}, target: ${
      Number.isFinite(highestSettlingDurationEvent.commandTarget)
        ? highestSettlingDurationEvent.commandTarget.toFixed(2)
        : "Unavailable"
    }, settling start: ${
      Number.isInteger(highestSettlingDurationEvent.settlingSampleIndex)
        ? highestSettlingDurationEvent.settlingSampleIndex
        : "Unavailable"
    }, duration: ${
      Number.isFinite(highestSettlingDurationEvent.settlingDurationSamples)
        ? highestSettlingDurationEvent.settlingDurationSamples.toFixed(2)
        : "Unavailable"
    } samples`
  : `${axisResult.axis} slowest settling event details: Unavailable`
];
}),
...commandEvents.flatMap((axisResult) => {
  const validRingingEvents =
    axisResult.events.filter((event) =>
      event?.ringingEligible === true &&
      Number.isFinite(
        event?.ringingTargetCrossingCount
      )
    );

  const ringingCrossingCounts =
    validRingingEvents.map(
      (event) =>
        event.ringingTargetCrossingCount
    );

const averageRingingCrossingCount =
  ringingCrossingCounts.length > 0
    ? ringingCrossingCounts.reduce(
        (sum, value) => sum + value,
        0
      ) / ringingCrossingCounts.length
    : null;
    const sortedRingingCrossingCounts =
  [...ringingCrossingCounts].sort(
    (a, b) => a - b
  );

const medianRingingCrossingCount =
  sortedRingingCrossingCounts.length > 0
    ? sortedRingingCrossingCounts.length % 2 === 1
      ? sortedRingingCrossingCounts[
          Math.floor(
            sortedRingingCrossingCounts.length / 2
          )
        ]
      : (
          sortedRingingCrossingCounts[
            sortedRingingCrossingCounts.length / 2 - 1
          ] +
          sortedRingingCrossingCounts[
            sortedRingingCrossingCounts.length / 2
          ]
        ) / 2
    : null;
    const maximumRingingCrossingCount =
  ringingCrossingCounts.length > 0
    ? Math.max(...ringingCrossingCounts)
    : null;
    const trimmedRingingCrossingCounts =
  sortedRingingCrossingCounts.length >= 4
    ? sortedRingingCrossingCounts.slice(0, -1)
    : sortedRingingCrossingCounts;

const trimmedMaximumRingingCrossingCount =
  trimmedRingingCrossingCounts.length > 0
    ? Math.max(...trimmedRingingCrossingCounts)
    : null;
    const highestRingingEvent =
  validRingingEvents.reduce(
    (highestEvent, event) => {
      if (
        !highestEvent ||
        event.ringingTargetCrossingCount >
          highestEvent.ringingTargetCrossingCount
      ) {
        return event;
      }

      return highestEvent;
    },
    null
  );
  const ringingConfidence =
  validRingingEvents.length >= 5
    ? "High"
    : validRingingEvents.length >= 3
      ? "Medium"
      : validRingingEvents.length >= 2
        ? "Low"
        : "Insufficient";
        const ringingRecommendation =
  ringingConfidence === "Insufficient" ||
  ringingConfidence === "Low"
    ? `Collect more clean ${axisResult.axis} command events before evaluating sustained ringing.`
    : Number.isFinite(
        medianRingingCrossingCount
      ) &&
        medianRingingCrossingCount >= 3
      ? `Review ${axisResult.axis} for repeated post-command ringing. Confirm the pattern with another log before changing PID or filter values.`
      : `No repeated sustained-ringing pattern was identified for ${axisResult.axis}.`;
      const ringingStatus =
  ringingConfidence === "Insufficient" ||
  ringingConfidence === "Low"
    ? "Insufficient Data"
    : Number.isFinite(
        medianRingingCrossingCount
      ) &&
        medianRingingCrossingCount >= 3
      ? "Review"
      : "Clear";
  return [
  `${axisResult.axis} ringing status: ${ringingStatus}`,
  `${axisResult.axis} ringing confidence: ${ringingConfidence}`,
  `${axisResult.axis} ringing evidence: ${validRingingEvents.length} valid event${
    validRingingEvents.length === 1 ? "" : "s"
  }`,
  `${axisResult.axis} ringing recommendation: ${ringingRecommendation}`,
  `${axisResult.axis} average ringing target crossings: ${
  Number.isFinite(averageRingingCrossingCount)
    ? averageRingingCrossingCount.toFixed(2)
    : "Unavailable"
}`,

`${axisResult.axis} median ringing target crossings: ${
  Number.isFinite(medianRingingCrossingCount)
    ? medianRingingCrossingCount.toFixed(2)
    : "Unavailable"
}`,
`${axisResult.axis} trimmed maximum ringing target crossings: ${
  Number.isFinite(trimmedMaximumRingingCrossingCount)
    ? trimmedMaximumRingingCrossingCount.toFixed(2)
    : "Unavailable"
}`,

`${axisResult.axis} raw maximum ringing target crossings: ${
  Number.isFinite(maximumRingingCrossingCount)
    ? maximumRingingCrossingCount.toFixed(2)
    : "Unavailable"
}`,
highestRingingEvent
  ? `${axisResult.axis} highest ringing event details — sample: ${highestRingingEvent.sampleIndex}, command end: ${highestRingingEvent.commandEndSampleIndex}, target: ${
      Number.isFinite(highestRingingEvent.commandTarget)
        ? highestRingingEvent.commandTarget.toFixed(2)
        : "Unavailable"
    }, response peak: ${
      Number.isFinite(highestRingingEvent.responsePeak)
        ? highestRingingEvent.responsePeak.toFixed(2)
        : "Unavailable"
    }, meaningful target crossings: ${
      Number.isFinite(highestRingingEvent.ringingTargetCrossingCount)
        ? highestRingingEvent.ringingTargetCrossingCount.toFixed(2)
        : "Unavailable"
    }`
  : `${axisResult.axis} highest ringing event details: Unavailable`
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
  ...pidCommandTermContributionPercentages.map(
  (axisResult) =>
    `${axisResult.axis} command-event PID contribution from ${
      axisResult.commandWindowCount
    } window${
      axisResult.commandWindowCount === 1 ? "" : "s"
    } — P: ${
      Number.isFinite(axisResult.pPercent)
        ? axisResult.pPercent.toFixed(2)
        : "Unavailable"
    }%, I: ${
      Number.isFinite(axisResult.iPercent)
        ? axisResult.iPercent.toFixed(2)
        : "Unavailable"
    }%, D: ${
      Number.isFinite(axisResult.dPercent)
        ? axisResult.dPercent.toFixed(2)
        : "Unavailable"
    }%, Feedforward: ${
      Number.isFinite(axisResult.feedforwardPercent)
        ? axisResult.feedforwardPercent.toFixed(2)
        : "Unavailable"
    }%`
),
...pidCommandBalanceAssessment.map(
  (axisResult) =>
    `${axisResult.axis} command-balance status: ${
      axisResult.status
    } from ${
      axisResult.commandWindowCount
    } command window${
      axisResult.commandWindowCount === 1 ? "" : "s"
    }`
),
...pidCommandBalanceAssessment.map(
  (axisResult) =>
    axisResult.status === "Review"
      ? `${axisResult.axis} command-balance finding: I remains dominant during command events while P plus feedforward support stays below 35%, and this axis also has the highest tracking error. Review setpoint, axis error, feedforward, and I behavior together before changing any PID value.`
      : axisResult.status === "Clear"
        ? `${axisResult.axis} command-balance finding: No combined tracking-error and command-support concern was identified.`
        : `${axisResult.axis} command-balance finding: More usable command windows are required before evaluating PID-term balance.`
),
  ...pidTermContributionPercentages.map(
  (axisResult) =>
    `${axisResult.axis} PID-term contribution — P: ${
      Number.isFinite(axisResult.pPercent)
        ? axisResult.pPercent.toFixed(2)
        : "Unavailable"
    }%, I: ${
      Number.isFinite(axisResult.iPercent)
        ? axisResult.iPercent.toFixed(2)
        : "Unavailable"
    }%, D: ${
      Number.isFinite(axisResult.dPercent)
        ? axisResult.dPercent.toFixed(2)
        : "Unavailable"
    }%, Feedforward: ${
      Number.isFinite(axisResult.feedforwardPercent)
        ? axisResult.feedforwardPercent.toFixed(2)
        : "Unavailable"
    }%`
),

...dominantPidTermByAxis.map(
  (axisResult) =>
    `${axisResult.axis} dominant PID term: ${
      axisResult.dominantTerm ?? "Unavailable"
    } at ${
      Number.isFinite(axisResult.dominantPercent)
        ? axisResult.dominantPercent.toFixed(2)
        : "Unavailable"
    }%`
),
     `P-term columns detected: ${groupedPidColumns.p.length}`,
      `P-term column names: ${groupedPidColumns.p.join(", ")}`,
      `Axis setpoint column names: ${axisSetpointColumns.join(", ")}`,
`I-term columns detected: ${groupedPidColumns.i.length}`,
`D-term columns detected: ${groupedPidColumns.d.length}`,
`Feedforward columns detected: ${groupedPidColumns.feedforward.length}`,
`PID-sum columns detected: ${groupedPidColumns.pidSum.length}`
    ],
    recommendations: [
      ...pidCommandBalanceAssessment
  .filter(
    (axisResult) =>
      axisResult.status === "Review"
  )
  .map(
    (axisResult) =>
      `Review ${axisResult.axis} command balance before changing PID values. I remains dominant during command events while P plus feedforward support stays below 35%, and this axis also has the highest tracking error. Compare setpoint, axis error, feedforward, and I behavior together.`
  ),
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