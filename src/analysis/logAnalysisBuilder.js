import { buildAnalysisContext } from "./analysisContext.js";
import { getMetadataValue } from "./metadataReader.js";
import { findTelemetryHeaderIndex } from "./telemetryHeader.js";
import { findHeader } from "./headerHelpers.js";
import {
  getColumnValues,
  getColumnAverage,
  getColumnSamples
} from "./mathHelpers.js";
import { buildFlightAnalysis } from "./flightAnalysis.js";
import { analyzePids } from "./pidAnalysis.js";
import { analyzeFilters } from "./filterAnalysis.js";
function detectHeadspeedProfiles(
  headspeedValues,
  governorTargetValues,
  alignedHeadspeedSamples = []
) {
  const rowAlignedSamples =
  Array.isArray(alignedHeadspeedSamples)
    ? alignedHeadspeedSamples
    : [];
  if (
  !Array.isArray(headspeedValues) ||
  !Array.isArray(governorTargetValues)
) {
  return [];
}

const profileSamples =
  rowAlignedSamples.length > 0
    ? rowAlignedSamples
    : headspeedValues.map((measuredRpm, index) => ({
        rowIndex: null,
        measuredRpm: Number(measuredRpm),
        targetRpm: Number(governorTargetValues[index])
      }));

 const sampleCount = profileSamples.length;

  const profileGroups = new Map();

  for (const sample of profileSamples) {
  const measuredRpm = Number(sample.measuredRpm);
  const targetRpm = Number(sample.targetRpm);

    if (
      !Number.isFinite(measuredRpm) ||
      !Number.isFinite(targetRpm) ||
      targetRpm < 300
    ) {
      continue;
    }

    // Ignore spool-up, spool-down, and large transient errors.
    const minimumStableRpm = targetRpm * 0.7;
    const maximumStableRpm = targetRpm * 1.3;

    if (
      measuredRpm < minimumStableRpm ||
      measuredRpm > maximumStableRpm
    ) {
      continue;
    }

    // Combine tiny target fluctuations into the same RPM profile.
    const targetBucket =
      Math.round(targetRpm / 10) * 10;

    if (!profileGroups.has(targetBucket)) {
      profileGroups.set(targetBucket, {
        targetRpm: targetBucket,
        measuredTotal: 0,
        sampleCount: 0,
        sampleIndexes: [],
        minimumRpm: measuredRpm,
        maximumRpm: measuredRpm
      });
    }

    const profile = profileGroups.get(targetBucket);

    profile.measuredTotal += measuredRpm;
    profile.sampleCount += 1;
    if (Number.isInteger(sample.rowIndex)) {
  profile.sampleIndexes.push(sample.rowIndex);
}
    profile.minimumRpm = Math.min(
      profile.minimumRpm,
      measuredRpm
    );
    profile.maximumRpm = Math.max(
      profile.maximumRpm,
      measuredRpm
    );
  }

  return Array.from(profileGroups.values())
    .filter((profile) => profile.sampleCount >= 1000)
    .map((profile) => ({
      targetRpm: profile.targetRpm,
      averageRpm:
        profile.measuredTotal / profile.sampleCount,
      minimumRpm: profile.minimumRpm,
      maximumRpm: profile.maximumRpm,
      sampleCount: profile.sampleCount,
      sampleIndexes: profile.sampleIndexes
    }))
    .sort((a, b) => a.targetRpm - b.targetRpm);
}
export function buildLogAnalysis({
  fileType,
  lines,
  aircraftProfiles,
  
}) {
  let extraSummary = "";
  let telemetryText = "No telemetry found.";
  let analysisContext = null;
  let filterAnalysis = null;
  let pidAnalysis = null;
  // ====================================================
  // BLACKBOX BBL LOG
  // ====================================================

  if (fileType === "Blackbox BBL Log") {
    const firmware = getMetadataValue(lines, "firmware");
    const firmwareRevision = getMetadataValue(
      lines,
      "Firmware revision"
    );

    const board = getMetadataValue(lines, "Board information");
    const craftName = getMetadataValue(lines, "Craft name");
    const logStart = getMetadataValue(lines, "Log start datetime");

    const profile =
      aircraftProfiles[craftName.toLowerCase()] || null;

    const telemetryHeaderIndex =
      findTelemetryHeaderIndex(lines);

    let averageEscOutput = null;
    let averageEscRPM = null;
    let flightAnalysis = null;
    

    // --------------------------------------------------
    // 15A. TELEMETRY COLUMN EXTRACTION
    // --------------------------------------------------

    if (telemetryHeaderIndex >= 0) {
      const headers = lines[telemetryHeaderIndex]
        .split(",")
        .map((header) => header.trim());

      const escOutputHeader = findHeader(
        headers,
        ["escthr"]
      );

      const escRpmHeader = findHeader(
        headers,
        ["escrpm"]
      );

      const headspeedHeader = findHeader(
        headers,
        ["headspeed"]
      );

      const governorTargetHeader = findHeader(
        headers,
        ["govtarget"]
      );

      averageEscOutput = getColumnAverage(
        lines,
        telemetryHeaderIndex,
        escOutputHeader
      );

      averageEscRPM = getColumnAverage(
        lines,
        telemetryHeaderIndex,
        escRpmHeader
      );
      const headspeedValues = getColumnValues(
  lines,
  telemetryHeaderIndex,
  headspeedHeader
);

const headspeedSamples = getColumnSamples(
  lines,
  telemetryHeaderIndex,
  headspeedHeader
);

const averageHeadspeed = getColumnAverage(
  lines,
  telemetryHeaderIndex,
  headspeedHeader
);

const governorTargetValues = getColumnValues(
  lines,
  telemetryHeaderIndex,
  governorTargetHeader
);

const governorTargetSamples = getColumnSamples(
  lines,
  telemetryHeaderIndex,
  governorTargetHeader
);

const governorTargetByRow = new Map(
  governorTargetSamples.map((sample) => [
    sample.rowIndex,
    sample.value
  ])
);

const alignedHeadspeedSamples = headspeedSamples
  .map((sample) => ({
    rowIndex: sample.rowIndex,
    measuredRpm: sample.value,
    targetRpm: governorTargetByRow.get(sample.rowIndex)
  }))
  .filter((sample) =>
    Number.isFinite(sample.measuredRpm) &&
    Number.isFinite(sample.targetRpm)
  );
     
const headspeedProfiles =
  detectHeadspeedProfiles(
    headspeedValues,
    governorTargetValues,
    alignedHeadspeedSamples
  );

console.log(
  "Detected headspeed profiles:",
  headspeedProfiles
);
      const keyHeaders = [
        ["Time", findHeader(headers, ["time"])],

        [
          "Battery Voltage",
          findHeader(headers, ["vbat", "escv"])
        ],

        [
          "Current",
          findHeader(headers, ["current", "esci"])
        ],

        [
          "ESC Output",
          findHeader(
            headers,
            ["escthr", "throttle", "motor"]
          )
        ],

        [
          "ESC RPM",
          findHeader(headers, ["escrpm"])
        ],

        [
          "Headspeed",
          headspeedHeader
        ],

        [
          "ESC Temperature",
          findHeader(headers, ["tesc", "tmcu", "esc2t"])
        ],

        [
          "Governor P",
          findHeader(headers, ["govp"])
        ],

        [
          "Governor I",
          findHeader(headers, ["govi"])
        ],

        [
          "Governor D",
          findHeader(headers, ["govd"])
        ],

        [
          "Governor Target",
          governorTargetHeader
        ]
      ];
     
  analysisContext = buildAnalysisContext({
  fileType,
  lines,
  aircraftProfile: profile,
  firmware,
  firmwareRevision,
  board,
  craftName,
  logStart,
  averageHeadspeed,
  headspeedProfiles,
  telemetryHeaderIndex,
  allColumns: headers,
  detectedTelemetry: {
    time: findHeader(headers, ["time"]),
    batteryVoltage: findHeader(headers, ["vbat", "escv"]),
    current: findHeader(headers, ["current", "esci"]),
    escOutput: escOutputHeader,
    escRpm: escRpmHeader,
    headspeed: headspeedHeader,
    escTemperature: findHeader(headers, ["tesc", "tmcu", "esc2t"]),
    governorP: findHeader(headers, ["govp"]),
    governorI: findHeader(headers, ["govi"]),
    governorD: findHeader(headers, ["govd"]),
    governorTarget: governorTargetHeader
  },

  evidenceSources: {
    bbl: fileType === "Blackbox BBL Log",
    csv: false,
    cli: false,
    aircraftProfile: Boolean(profile),
    telemetry: telemetryHeaderIndex >= 0,
    gps: false
  }

});
    filterAnalysis = analyzeFilters(
    analysisContext,
    lines
);
pidAnalysis = analyzePids(
  analysisContext,
  lines,
  filterAnalysis?.profileSpecificFilterAnalysis ?? []
);
      flightAnalysis = buildFlightAnalysis(
        averageEscOutput,
        profile,
        keyHeaders,
        headspeedValues,
        governorTargetValues
      );

      telemetryText =
        "KEY TELEMETRY FOUND\n" +
        "-------------------\n" +
        keyHeaders
          .map(([label, value]) => {
            return `${value ? "✓" : "✗"} ${label}: ${value || "Not found"}`;
          })
          .join("\n") +
        "\n\nCALCULATED VALUES\n" +
        "-----------------\n" +
        `Average ESC Output: ${
          averageEscOutput !== null
            ? `${(averageEscOutput / 10).toFixed(1)}%`
            : "N/A"
        }\n` +
        `Average ESC RPM: ${
          averageEscRPM !== null
            ? Math.round(averageEscRPM)
            : "N/A"
        }\n` +
        "\nALL COLUMNS\n" +
        "-----------\n" +
        headers.join("\n");
    }


    // --------------------------------------------------
    // 15B. BLACKBOX FLIGHT SUMMARY
    // --------------------------------------------------

    extraSummary = `
      File Type: ${fileType}<br>
      Craft Name: ${craftName}<br>
      Display Name: ${profile ? profile.displayName : "Unknown"}<br>
      Motor: ${profile ? profile.motor : "Unknown"}<br>
      ESC: ${profile ? profile.esc : "Unknown"}<br>
      Battery: ${profile ? profile.battery : "Unknown"}<br>
      Weight: ${profile ? `${profile.weightLb} lb` : "Unknown"}<br>
      Target ESC Output: ${profile ? profile.targetEscOutput : "Unknown"}<br>
      Firmware: ${firmware}<br>
      Firmware Revision: ${firmwareRevision}<br>
      Board: ${board}<br>
      Log Start: ${logStart}<br>
      Telemetry Header Row: ${
        telemetryHeaderIndex >= 0
          ? telemetryHeaderIndex
          : "Not found"
      }<br>
      Average ESC Output: ${
        averageEscOutput !== null
          ? `${(averageEscOutput / 10).toFixed(1)}%`
          : "N/A"
      }<br>
      Average ESC RPM: ${
        averageEscRPM !== null
          ? Math.round(averageEscRPM)
          : "N/A"
      }<br>

      <br>
      <strong>INTELLIGENT FLIGHT ANALYSIS</strong><br>

      Overall Flight Score: ${
        flightAnalysis
          ? `${flightAnalysis.overallScore}/100`
          : "N/A"
      }<br>

      Flight Rating: ${
        flightAnalysis
          ? flightAnalysis.rating
          : "Insufficient Data"
      }<br>

      Analysis Confidence: ${
        flightAnalysis
          ? `${flightAnalysis.confidence.label} (${flightAnalysis.confidence.score}/100)`
          : "Low"
      }<br>

      <br>
      <strong>System Scores</strong><br>

      Aircraft Profile: ${
        flightAnalysis
          ? `${flightAnalysis.profile.score}/100 — ${flightAnalysis.profile.status}`
          : "N/A"
      }<br>

      ESC Operating Range: ${
        flightAnalysis
          ? `${flightAnalysis.esc.score}/100 — ${flightAnalysis.esc.status}`
          : "N/A"
      }<br>

      Telemetry Quality: ${
        flightAnalysis
          ? `${flightAnalysis.telemetry.score}/100 — ${flightAnalysis.telemetry.status}`
          : "N/A"
      }<br>

      Governor Performance: ${
        flightAnalysis
          ? `${flightAnalysis.governor.score}/100 — ${flightAnalysis.governor.status}`
          : "N/A"
      }<br>

      <br>
      <strong>Findings</strong><br>

      ${
        flightAnalysis
          ? `✓ ${flightAnalysis.profile.finding}`
          : "✗ Aircraft profile analysis unavailable."
      }<br>

      ${
        flightAnalysis
          ? `${
              flightAnalysis.esc.severity === "warning"
                ? "⚠"
                : flightAnalysis.esc.severity === "caution"
                  ? "△"
                  : "✓"
            } ${flightAnalysis.esc.finding}`
          : "✗ ESC analysis unavailable."
      }<br>

      ${
        flightAnalysis
          ? `✓ ${flightAnalysis.telemetry.finding}`
          : "✗ Telemetry analysis unavailable."
      }<br>

      ${
        flightAnalysis
          ? `${flightAnalysis.governor.score > 0 ? "✓" : "⚠"} ${flightAnalysis.governor.finding}`
          : "✗ Governor analysis unavailable."
      }<br>
    `;


  // ====================================================
  // 15C. ROTORFLIGHT CLI DUMP
  // ====================================================

  } else if (fileType === "Rotorflight CLI Dump") {
    extraSummary = `
      File Type: ${fileType}<br>
      Status: Settings file detected<br>
      Next: CLI Reader will extract governor, filters, PIDs, ports, GPS, and receiver setup.
    `;


  // ====================================================
  // 15D. CSV TELEMETRY EXPORT
  // ====================================================

  } else if (fileType === "CSV Telemetry Export") {
    const headers = lines[0]
      .split(",")
      .map((header) => header.trim());

    const headspeedColumn = findHeader(
      headers,
      ["rpm", "headspeed"]
    );

    const voltageColumn = findHeader(
      headers,
      ["voltage", "volt", "cell"]
    );

    const escColumn = findHeader(
      headers,
      ["esc", "throttle", "motor"]
    );

    telemetryText = headers.join("\n");

    extraSummary = `
      File Type: ${fileType}<br>
      Columns: ${headers.length}<br>
      Headspeed Column: ${headspeedColumn || "Not found"}<br>
      Voltage Column: ${voltageColumn || "Not found"}<br>
      ESC/Motor Column: ${escColumn || "Not found"}<br>
    `;


  // ====================================================
  // 15E. UNKNOWN FILE
  // ====================================================

  } else {
    extraSummary = `
      File Type: ${fileType}<br>
      Status: Blackbox Lab does not recognize this file yet.
    `;
  }
  
    return {
  extraSummary,
  telemetryText,
  analysisContext,
  filterAnalysis,
  pidAnalysis,
  filterAnalysisSummaryFindings: filterAnalysis?.summaryFindings ?? []
  };
  }