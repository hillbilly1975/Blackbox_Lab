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
      value: motorOutputColumns
    }
  ];

  const findings = [
    `The filter-analysis engine inspected ${allColumns.length} Blackbox columns.`,
    `${detectedGroupCount} of 5 required filter-analysis column groups were detected.`
  ];

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

  const score = Math.round(
    (detectedGroupCount / 5) * 100
  );

  let status = "Insufficient Data";
  let severity = "warning";

  if (detectedGroupCount === 5) {
    status = "Basic Filter Analysis Complete";
    severity = "info";
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
  } else {
    recommendations.push(
      "Raw and filtered gyro values were compared successfully. Next, evaluate frequency content and determine whether useful control motion is being removed."
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
    findings,
    recommendations,
    evidence,
    detectedColumns: detectedGroups,
  };
}