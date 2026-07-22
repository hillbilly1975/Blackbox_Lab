// ======================================================
// BLACKBOX LAB — MAIN RENDERER
// ======================================================
import { aircraftProfiles } from "./profiles/aircraftProfiles.js";
import { updateScreen } from "./ui/screenUpdater.js";
import { initNavigation } from "./ui/navigation.js";
import {
  renderTimeSeriesChart,
  renderSpectrumChart,
  CHART_COLORS
} from "./ui/charts.js";
import { readLogFile } from "./analysis/logFileReader.js";
import { buildLogAnalysis } from "./analysis/logAnalysisBuilder.js";
import { findTelemetryHeaderIndex } from "./analysis/telemetryHeader.js";
import { getColumnValues } from "./analysis/mathHelpers.js";
import {
  computeNoiseSpectrum,
  estimateSampleRate
} from "./analysis/dsp/fft.js";
//
// SECTION MAP
// 01. DOM REFERENCES
// 02. NAVIGATION
// 03. FILE PICKER
// 04. FLIGHT SELECTION
// 05. CHART DATA HELPERS
// 06. CHART RENDERING
// 07. ANALYSIS + SCREEN UPDATE
//
// ======================================================
//
// 01. DOM REFERENCES
// ======================================================

const chooseFileButton = document.getElementById("chooseFileButton");
const openLogButton = document.getElementById("openLogButton");
const logFileInput = document.getElementById("logFileInput");

const fileStatus = document.getElementById("fileStatus");
const flightPicker = document.getElementById("flightPicker");
const flightSelect = document.getElementById("flightSelect");
const decodeInfo = document.getElementById("decodeInfo");

const summaryFileName = document.getElementById("summaryFileName");
const summaryFileSize = document.getElementById("summaryFileSize");
const summaryStatus = document.getElementById("summaryStatus");
const rawPreview = document.getElementById("rawPreview");
const telemetryColumns = document.getElementById("telemetryColumns");

const filterAnalysisStatus = document.getElementById("filterAnalysisStatus");
const filterAnalysisScore = document.getElementById("filterAnalysisScore");
const filterAnalysisConfidence = document.getElementById("filterAnalysisConfidence");
const filterAnalysisFindings = document.getElementById("filterAnalysisFindings");
const filterAnalysisRecommendations = document.getElementById("filterAnalysisRecommendations");

const pidAnalysisStatus = document.getElementById("pidAnalysisStatus");
const pidAnalysisScore = document.getElementById("pidAnalysisScore");
const pidAnalysisConfidence = document.getElementById("pidAnalysisConfidence");
const pidAnalysisFindings = document.getElementById("pidAnalysisFindings");
const pidAnalysisRecommendations = document.getElementById("pidAnalysisRecommendations");

const chartGyro = document.getElementById("chartGyro");
const chartTracking = document.getElementById("chartTracking");
const chartHeadspeed = document.getElementById("chartHeadspeed");
const chartPower = document.getElementById("chartPower");
const chartSpectrum = document.getElementById("chartSpectrum");

// ======================================================
// 02. NAVIGATION
// ======================================================

initNavigation();

// ======================================================
// 03. FILE PICKER
// ======================================================

function openFilePicker() {
  logFileInput.click();
}

chooseFileButton.addEventListener("click", openFilePicker);
openLogButton.addEventListener("click", openFilePicker);

let loadedLog = null;

logFileInput.addEventListener("change", async () => {
  const logData = await readLogFile(logFileInput.files[0]);

  if (!logData || logData.flights.length === 0) {
    fileStatus.textContent =
      "Could not read any flight data from this file.";
    return;
  }

  loadedLog = logData;

  // ====================================================
  // 04. FLIGHT SELECTION
  // ====================================================

  flightSelect.innerHTML = "";

  logData.flights.forEach((flight, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = flight.label;
    flightSelect.appendChild(option);
  });

  flightPicker.hidden = logData.flights.length < 2;

  analyzeFlight(0);
});

flightSelect.addEventListener("change", () => {
  if (loadedLog) {
    analyzeFlight(Number(flightSelect.value));
  }
});

// ======================================================
// 05. CHART DATA HELPERS
// ======================================================

function findColumns(headerLine, patterns) {
  const names = headerLine.split(",").map((name) => name.trim());

  return names.filter((name) =>
    patterns.some((pattern) => pattern.test(name))
  );
}

// Sample long flights down to a plottable size while
// keeping the shape of the signal.
function decimate(values, maximumPoints = 60000) {
  if (values.length <= maximumPoints) {
    return values;
  }

  const stride = Math.ceil(values.length / maximumPoints);
  const output = [];

  for (let i = 0; i < values.length; i += stride) {
    output.push(values[i]);
  }

  return output;
}

function buildChartData(lines) {
  const headerIndex = findTelemetryHeaderIndex(lines);

  if (headerIndex < 0) {
    return null;
  }

  const headerLine = lines[headerIndex];

  const columnValues = (name) =>
    getColumnValues(lines, headerIndex, name);

  const timeColumn = findColumns(headerLine, [/^time/i])[0];

  if (!timeColumn) {
    return null;
  }

  const timeMicroseconds = columnValues(timeColumn);
  const startTime = timeMicroseconds[0] ?? 0;
  const timeSeconds = timeMicroseconds.map(
    (value) => (value - startTime) / 1_000_000
  );

  return {
    headerLine,
    headerIndex,
    timeMicroseconds,
    timeSeconds,
    columnValues
  };
}

// ======================================================
// 06. CHART RENDERING
// ======================================================

function renderSeriesChart(element, chartData, patterns, options = {}) {
  const columns = findColumns(chartData.headerLine, patterns).slice(0, 6);

  if (columns.length === 0) {
    element.innerHTML =
      '<p class="chart-empty">This log has no data for this chart.</p>';
    return;
  }

  const series = columns.map((name, index) => ({
    label: name,
    values: decimate(chartData.columnValues(name)),
    color: CHART_COLORS[index % CHART_COLORS.length]
  }));

  renderTimeSeriesChart(element, {
    timeSeconds: decimate(chartData.timeSeconds),
    series,
    yLabel: options.yLabel ?? ""
  });
}

function renderAllCharts(lines) {
  const chartData = buildChartData(lines);

  if (!chartData) {
    for (const element of [
      chartGyro,
      chartTracking,
      chartHeadspeed,
      chartPower,
      chartSpectrum
    ]) {
      element.innerHTML =
        '<p class="chart-empty">No plottable telemetry found in this log.</p>';
    }

    return;
  }

  renderSeriesChart(chartGyro, chartData, [/^gyroADC/i, /^gyroUnfilt/i], {
    yLabel: "deg/s"
  });

  renderSeriesChart(
    chartTracking,
    chartData,
    [/^setpoint\[0\]/i, /^gyroADC\[0\]/i],
    { yLabel: "roll axis" }
  );

  renderSeriesChart(
    chartHeadspeed,
    chartData,
    [/headspeed/i, /^rpm/i, /governor/i],
    { yLabel: "rpm" }
  );

  renderSeriesChart(
    chartPower,
    chartData,
    [/^motor\[/i, /vbat/i, /amperage/i, /current/i],
    { yLabel: "" }
  );

  // ---- noise spectrum (Filter Lab) ----
  const sampleRate = estimateSampleRate(chartData.timeMicroseconds);

  const gyroColumns = findColumns(chartData.headerLine, [
    /^gyroUnfilt/i,
    /^gyroADC/i
  ]).slice(0, 3);

  const spectra = [];

  if (sampleRate) {
    gyroColumns.forEach((name, index) => {
      const spectrum = computeNoiseSpectrum(
        chartData.columnValues(name),
        sampleRate
      );

      if (spectrum) {
        spectra.push({
          label: name,
          spectrum,
          color: CHART_COLORS[index % CHART_COLORS.length]
        });
      }
    });
  }

  if (spectra.length > 0) {
    renderSpectrumChart(chartSpectrum, spectra);
  } else {
    chartSpectrum.innerHTML =
      '<p class="chart-empty">Not enough gyro data for a spectrum.</p>';
  }
}

// ======================================================
// 07. ANALYSIS + SCREEN UPDATE
// ======================================================

function analyzeFlight(flightIndex) {
  const flight = loadedLog.flights[flightIndex];
  const { file, sizeKb, fileType } = loadedLog;
  const lines = flight.lines;

  decodeInfo.textContent = flight.decodeInfo
    ? `Binary .bbl decoded natively — ${flight.decodeInfo}`
    : fileType;

  const {
    extraSummary,
    telemetryText,
    filterAnalysis,
    pidAnalysis
  } = buildLogAnalysis({
    fileType,
    lines,
    aircraftProfiles
  });

  updateScreen({
    telemetryText,
    file,
    sizeKb,
    lines,
    extraSummary,
    telemetryColumns,
    filterAnalysis,
    pidAnalysis,
    fileStatus,
    summaryFileName,
    summaryFileSize,
    summaryStatus,
    filterAnalysisStatus,
    filterAnalysisScore,
    filterAnalysisConfidence,
    filterAnalysisFindings,
    filterAnalysisRecommendations,
    pidAnalysisStatus,
    pidAnalysisScore,
    pidAnalysisConfidence,
    pidAnalysisFindings,
    pidAnalysisRecommendations,
    rawPreview
  });

  renderAllCharts(lines);
}
