// ======================================================
// BLACKBOX LAB — MAIN RENDERER
// ======================================================
import { aircraftProfiles } from "./profiles/aircraftProfiles.js";
import { buildFlightAnalysis } from "./analysis/flightAnalysis.js";
import { getMetadataValue } from "./analysis/metadataReader.js";
import { findHeader } from "./analysis/headerHelpers.js";
import { findTelemetryHeaderIndex } from "./analysis/telemetryHeader.js";
import {
   getColumnValues,
  getColumnAverage,
  getStandardDeviation,
  clampScore
} from "./analysis/mathHelpers.js";
import { updateScreen } from "./ui/screenUpdater.js";
import { readLogFile } from "./analysis/logFileReader.js";
import { buildLogAnalysis } from "./analysis/logAnalysisBuilder.js";
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







// ======================================================
// 08. ESC ANALYSIS
// ======================================================





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
const logData = await readLogFile(logFileInput.files[0]);

if (!logData) {
  return;
}

const {
  file,
  sizeKb,
  text,
  lines,
  fileType
} = logData;

  const {
  extraSummary,
  telemetryText
} = buildLogAnalysis({
  fileType,
  lines,
  aircraftProfiles
});

  // ====================================================
  // 16. SCREEN UPDATE
  // ====================================================

 updateScreen({
  telemetryText,
  file,
  sizeKb,
  lines,
  extraSummary,
  telemetryColumns,
  fileStatus,
  summaryFileName,
  summaryFileSize,
  summaryStatus,
  rawPreview
});
});