import {
  getColumnValues,
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
  lines = []
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
const axisNames = [
  "Roll",
  "Pitch",
  "Yaw"
];

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
highestTrackingErrorAxis
  ? `${highestTrackingErrorAxis.axis} has the highest average tracking error at ${highestTrackingErrorAxis.averageAbsoluteError.toFixed(2)}. This axis deserves the closest review during PID tuning.`
  : "A highest tracking-error axis could not be identified.",
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
    : "Collect a log with valid Roll, Pitch, and Yaw tracking data before making PID changes."
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
  averageAbsoluteAxisError
},
},    analysisContext,
    lineCount: Array.isArray(lines)
      ? lines.length
      : 0
  };
}