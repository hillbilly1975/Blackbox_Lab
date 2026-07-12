// ======================================================
// BLACKBOX LAB — MAIN RENDERER
// ======================================================
import { aircraftProfiles } from "./profiles/aircraftProfiles.js";
import { buildFlightAnalysis } from "./analysis/flightAnalysis.js";
import { identifyFile } from "./analysis/fileIdentification.js";
import { getMetadataValue } from "./analysis/metadataReader.js";
import { findHeader } from "./analysis/headerHelpers.js";
import { findTelemetryHeaderIndex } from "./analysis/telemetryHeader.js";
import {
  getColumnValues,
  getStandardDeviation
} from "./analysis/mathHelpers.js";
//
// SECTION MAP
// 01. DOM REFERENCES
// 02. AIRCRAFT PROFILES
// 03. FILE PICKER
// 04. FILE TYPE IDENTIFICATION
// 05. METADATA READER
// 06. TELEMETRY HEADER DETECTION
// 07. COLUMN AND MATH HELPERS
// 08. ESC ANALYSIS
// 09. TELEMETRY ANALYSIS
// 10. AIRCRAFT PROFILE ANALYSIS
// 11. GOVERNOR ANALYSIS
// 12. FLIGHT SCORING AND CONFIDENCE
// 13. FLIGHT ANALYSIS BUILDER
// 14. BUTTON EVENTS
// 15. LOG FILE READER
// 16. SCREEN UPDATE
// ======================================================
//
// 01. DOM REFERENCES
// ======================================================



const chooseFileButton = document.getElementById("chooseFileButton");
const openLogButton = document.getElementById("openLogButton");
const logFileInput = document.getElementById("logFileInput");

const fileStatus = document.getElementById("fileStatus");
const summaryFileName = document.getElementById("summaryFileName");
const summaryFileSize = document.getElementById("summaryFileSize");
const summaryStatus = document.getElementById("summaryStatus");
const rawPreview = document.getElementById("rawPreview");
const telemetryColumns = document.getElementById("telemetryColumns");





// ======================================================
// 03. FILE PICKER
// ======================================================

function openFilePicker() {
  logFileInput.click();
}


// ======================================================
// 04. FILE TYPE IDENTIFICATION
// ======================================================



// ======================================================
// 05. METADATA READER
// ======================================================



// ======================================================
// 06. TELEMETRY HEADER DETECTION
// ======================================================





// ======================================================
// 07. COLUMN AND MATH HELPERS
// ======================================================



function getColumnAverage(lines, headerIndex, columnName) {
  const values = getColumnValues(lines, headerIndex, columnName);

  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return total / values.length;
}




// ======================================================
// 08. ESC ANALYSIS
// ======================================================

function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}




// ======================================================
// 09. TELEMETRY ANALYSIS
// ======================================================



// ======================================================
// 10. AIRCRAFT PROFILE ANALYSIS
// ======================================================







// ======================================================
// 12. FLIGHT SCORING AND CONFIDENCE
// ======================================================



// ======================================================
// 13. FLIGHT ANALYSIS BUILDER
// ======================================================



// ======================================================
// 14. BUTTON EVENTS
// ======================================================

chooseFileButton.addEventListener("click", openFilePicker);
openLogButton.addEventListener("click", openFilePicker);


// ======================================================
// 15. LOG FILE READER
// ======================================================

logFileInput.addEventListener("change", async () => {
  const file = logFileInput.files[0];

  if (!file) {
    return;
  }

  const sizeKb = (file.size / 1024).toFixed(1);
  const text = await file.text();

  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  const fileType = identifyFile(lines);

  let extraSummary = "";
  let telemetryText = "No telemetry found.";


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

      const governorTargetValues = getColumnValues(
        lines,
        telemetryHeaderIndex,
        governorTargetHeader
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


  // ====================================================
  // 16. SCREEN UPDATE
  // ====================================================

  telemetryColumns.textContent = telemetryText;

  fileStatus.textContent = `Loaded: ${file.name}`;
  summaryFileName.textContent = file.name;
  summaryFileSize.textContent = `${sizeKb} KB`;

  summaryStatus.innerHTML = `
    Log selected<br>
    Rows: ${lines.length}<br>
    ${extraSummary}
  `;

  const previewLines = lines
    .slice(0, 12)
    .join("\n");

  rawPreview.textContent = previewLines;
});