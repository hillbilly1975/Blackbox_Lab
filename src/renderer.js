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
import { buildReportHtml, downloadReport } from "./ui/reportBuilder.js";
import { readLogFile } from "./analysis/logFileReader.js";
import {
  buildContribution,
  describeContribution
} from "./contribute/contributionBuilder.js";
import { uploadContribution } from "./contribute/uploader.js";
import {
  CONTRIBUTE_ENDPOINT,
  CONTRIBUTE_APP_VERSION
} from "./contribute/config.js";
import { APP_VERSION, checkForUpdate } from "./version.js";
import { buildLogAnalysis } from "./analysis/logAnalysisBuilder.js";
import { findTelemetryHeaderIndex } from "./analysis/telemetryHeader.js";
import { getColumnValues } from "./analysis/mathHelpers.js";
import { getMetadataValue } from "./analysis/metadataReader.js";
import {
  computeNoiseSpectrum,
  estimateSampleRate
} from "./analysis/dsp/fft.js";
import { buildFlightVerdict } from "./analysis/flightVerdict.js";
import { compareFlights } from "./analysis/compareFlights.js";
import { assessLogQuality } from "./analysis/logQuality.js";
import { adviseFilters } from "./analysis/filterAdvisor.js";
import {
  loadHistory,
  recordFlight,
  buildHistoryEntry,
  assessTrends,
  clearHistory
} from "./analysis/craftHistory.js";
import { analyzeGovernorLab } from "./analysis/governorLabAnalysis.js";
import { analyzeEscLab } from "./analysis/escLabAnalysis.js";
import { analyzeBatteryLab } from "./analysis/batteryLabAnalysis.js";
//
// SECTION MAP
// 01. DOM REFERENCES
// 02. NAVIGATION + SETTINGS
// 03. FILE PICKER + SAMPLE FLIGHT
// 04. FLIGHT SELECTION
// 05. DATASET (columns, spectra, labs, verdict)
// 06. RENDERING (charts, labs, verdict)
// 07. REPORT BUILDER
//
// ======================================================
//
// 01. DOM REFERENCES
// ======================================================

const el = (id) => document.getElementById(id);

const chooseFileButton = el("chooseFileButton");
const openLogButton = el("openLogButton");
const trySampleButton = el("trySampleButton");
const logFileInput = el("logFileInput");

const fileStatus = el("fileStatus");
const flightPicker = el("flightPicker");
const flightSelect = el("flightSelect");
const decodeInfo = el("decodeInfo");

const summaryFileName = el("summaryFileName");
const summaryFileSize = el("summaryFileSize");
const summaryStatus = el("summaryStatus");
const rawPreview = el("rawPreview");
const telemetryColumns = el("telemetryColumns");

const verdictCard = el("verdictCard");
const verdictSummary = el("verdictSummary");
const verdictCards = el("verdictCards");

const filterAnalysisStatus = el("filterAnalysisStatus");
const filterAnalysisScore = el("filterAnalysisScore");
const filterAnalysisConfidence = el("filterAnalysisConfidence");
const filterAnalysisFindings = el("filterAnalysisFindings");
const filterAnalysisRecommendations = el("filterAnalysisRecommendations");

const pidAnalysisStatus = el("pidAnalysisStatus");
const pidAnalysisScore = el("pidAnalysisScore");
const pidAnalysisConfidence = el("pidAnalysisConfidence");
const pidAnalysisFindings = el("pidAnalysisFindings");
const pidAnalysisRecommendations = el("pidAnalysisRecommendations");

const chartGyro = el("chartGyro");
const chartThrottle = el("chartThrottle");
const chartTracking = el("chartTracking");
const chartHeadspeed = el("chartHeadspeed");
const chartPower = el("chartPower");
const chartSpectrum = el("chartSpectrum");
const chartGovernor = el("chartGovernor");
const chartEsc = el("chartEsc");
const chartBattery = el("chartBattery");

const governorStory = el("governorStory");
const governorMetrics = el("governorMetrics");
const escStory = el("escStory");
const escMetrics = el("escMetrics");
const batteryStory = el("batteryStory");
const batteryMetrics = el("batteryMetrics");

const qualityCard = el("qualityCard");
const qualitySummary = el("qualitySummary");
const qualityChips = el("qualityChips");
const qualityWarnings = el("qualityWarnings");

const filterAdvisorCard = el("filterAdvisorCard");
const filterAdvisorStory = el("filterAdvisorStory");
const filterAdvisorTable = el("filterAdvisorTable");
const filterAdvisorRecommendations = el("filterAdvisorRecommendations");

const compareBaselineInfo = el("compareBaselineInfo");
const compareOpenButton = el("compareOpenButton");
const compareSampleButton = el("compareSampleButton");
const compareFileInput = el("compareFileInput");
const compareResultCard = el("compareResultCard");
const compareChartCard = el("compareChartCard");
const compareSummary = el("compareSummary");
const compareRows = el("compareRows");
const chartCompareSpectrum = el("chartCompareSpectrum");

const historyCraftSelect = el("historyCraftSelect");
const historyNote = el("historyNote");
const historyFindings = el("historyFindings");
const historyTrendCard = el("historyTrendCard");
const historyTableCard = el("historyTableCard");
const chartTrendVibration = el("chartTrendVibration");
const chartTrendDroop = el("chartTrendDroop");
const historyTable = el("historyTable");
const clearHistoryButton = el("clearHistoryButton");

const buildReportButton = el("buildReportButton");
const reportStatus = el("reportStatus");
const advancedModeToggle = el("advancedModeToggle");

// ======================================================
// 02. NAVIGATION + SETTINGS
// ======================================================

const navigation = initNavigation();

function applyAdvancedMode(enabled) {
  document.body.classList.toggle("advanced-mode", enabled);
  localStorage.setItem("blackboxLabAdvanced", enabled ? "1" : "0");
}

advancedModeToggle.checked =
  localStorage.getItem("blackboxLabAdvanced") === "1";
applyAdvancedMode(advancedModeToggle.checked);

advancedModeToggle.addEventListener("change", () => {
  applyAdvancedMode(advancedModeToggle.checked);
});

// ======================================================
// 03. FILE PICKER + SAMPLE FLIGHT
// ======================================================

function openFilePicker() {
  logFileInput.click();
}

chooseFileButton.addEventListener("click", openFilePicker);

// The sidebar "Open Blackbox Log" sits between navigation tabs and
// is easy to hit by accident once a log is loaded. After the first
// load it locks: one click arms it (🔓 — "click again"), a second
// click within a few seconds opens the picker. Before any log is
// loaded it behaves like a normal button.
const openLogLock = el("openLogLock");
let openLogArmed = false;
let openLogArmTimer = null;

function disarmOpenLog() {
  openLogArmed = false;
  openLogButton.classList.remove("armed");
  openLogButton.title = "";
  if (openLogLock && !openLogLock.hidden) {
    openLogLock.textContent = "🔒";
    openLogButton.title = "Click the lock to open another log";
  }
  if (openLogArmTimer) {
    clearTimeout(openLogArmTimer);
    openLogArmTimer = null;
  }
}

// Only the lock icon itself unlocks — clicks on the button
// body do nothing while locked, so "toggle" habits can't
// accidentally reopen the file dialog.
openLogButton.addEventListener("click", () => {
  if (!loadedLog) {
    openFilePicker();
    return;
  }

  if (openLogArmed) {
    disarmOpenLog();
    openFilePicker();
  }
});

openLogLock.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!loadedLog) return;

  if (openLogArmed) {
    disarmOpenLog();
    return;
  }

  openLogArmed = true;
  openLogLock.textContent = "🔓";
  openLogButton.classList.add("armed");
  openLogButton.title = "Unlocked — click to open another log";
  openLogArmTimer = setTimeout(disarmOpenLog, 4000);
});

let loadedLog = null;

async function loadFromFile(file) {
  fileStatus.textContent = `Reading ${file.name}...`;
  await new Promise((resolve) => setTimeout(resolve, 30));

  const logData = await readLogFile(file);

  if (!logData || logData.flights.length === 0) {
    fileStatus.textContent =
      "Could not read any flight data from this file.";
    return;
  }

  loadedLog = logData;

  // A log is in — lock the sidebar button against stray clicks.
  if (openLogLock) {
    openLogLock.hidden = false;
  }
  disarmOpenLog();

  flightSelect.innerHTML = "";

  logData.flights.forEach((flight, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = flight.label;
    flightSelect.appendChild(option);
  });

  flightPicker.hidden = logData.flights.length < 2;

  fileStatus.textContent =
    "Analyzing flight... (big logs take a few seconds)";
  await new Promise((resolve) => setTimeout(resolve, 30));

  analyzeFlight(0);

  // Swap the welcome hero for the working Home layout.
  document.body.classList.add("log-loaded");
}

logFileInput.addEventListener("change", async () => {
  if (logFileInput.files[0]) {
    try {
      await loadFromFile(logFileInput.files[0]);
    } catch (error) {
      fileStatus.textContent =
        "Something went wrong reading this log: " + error.message;
    }
  }

  // Allow re-opening the same file after a fix.
  logFileInput.value = "";
});

trySampleButton.addEventListener("click", async () => {
  if (!window.blackboxLab) {
    fileStatus.textContent =
      "Samples are available when running the desktop app.";
    return;
  }

  fileStatus.textContent = "Loading sample flight...";

  const bytes = await window.blackboxLab.readSampleLog(
    "sample-vibration-problem.bbl"
  );

  if (!bytes) {
    fileStatus.textContent = "Could not load the sample flight.";
    return;
  }

  const file = new File(
    [new Uint8Array(bytes)],
    "sample-vibration-problem.bbl"
  );

  await loadFromFile(file);

  fileStatus.textContent =
    "Loaded: sample flight (a helicopter with a mechanical problem — can you find it?)";
});

flightSelect.addEventListener("change", () => {
  if (loadedLog) {
    analyzeFlight(Number(flightSelect.value));
  }
});

// ======================================================
// 04. DATASET
// ======================================================

const UNFILTERED_GYRO_PATTERNS = [/^gyroUnfilt/i, /^gyroRAW/i];

function hasOwnUnfiltered(headerLine) {
  return findColumns(headerLine, UNFILTERED_GYRO_PATTERNS).length > 0;
}

function findColumns(headerLine, patterns) {
  const names = headerLine.split(",").map((name) => name.trim());

  return names.filter((name) =>
    patterns.some((pattern) => pattern.test(name))
  );
}

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

function averageOf(values) {
  let sum = 0;

  for (const value of values) {
    sum += value;
  }

  return values.length ? sum / values.length : null;
}

// Parse every data row exactly once. On big logs (100k+
// frames) splitting the lines per column read costs seconds;
// this table makes each column access instant.
function buildColumnTable(lines, headerIndex) {
  const names = lines[headerIndex].split(",").map((name) => name.trim());
  const table = new Map(names.map((name) => [name, []]));
  const columns = names.map((name) => table.get(name));

  for (let row = headerIndex + 1; row < lines.length; row += 1) {
    const parts = lines[row].split(",");

    for (let i = 0; i < columns.length; i += 1) {
      const value = Number(parts[i]);

      if (Number.isFinite(value)) {
        columns[i].push(value);
      }
    }
  }

  return table;
}

function buildDataset(lines, pidAnalysis) {
  const headerIndex = findTelemetryHeaderIndex(lines);

  if (headerIndex < 0) {
    return null;
  }

  const headerLine = lines[headerIndex];
  const columnTable = buildColumnTable(lines, headerIndex);
  const columnValues = (name) => columnTable.get(name) ?? [];
  const firstColumn = (patterns) => {
    const matches = findColumns(headerLine, patterns);

    if (!matches.length) {
      return null;
    }

    const values = columnValues(matches[0]);
    return values.length > 0 ? values : null;
  };

  const timeColumnName = findColumns(headerLine, [/^time/i])[0];

  if (!timeColumnName) {
    return null;
  }

  const timeMicroseconds = columnValues(timeColumnName);
  const startTime = timeMicroseconds[0] ?? 0;
  const timeSeconds = timeMicroseconds.map(
    (value) => (value - startTime) / 1_000_000
  );

  const headspeed = firstColumn([/headspeed/i, /^rpm/i]);
  const governorTarget = firstColumn([/governorTarget/i, /govTarget/i, /governor/i]);
  const vbat = firstColumn([/^vbat/i]);
  const amperage = firstColumn([/amperage/i, /^Ibat/i, /current/i, /^EscI$/i]);
  const motor = firstColumn([/^motor\[0\]/i]);

  // ---- spectra + labelled peaks ----
  // Analyze the governed part of the flight only: during
  // spool-up the rotor frequency sweeps, which smears the
  // vibration peaks across the spectrum.
  const sampleRate = estimateSampleRate(timeMicroseconds);
  // Noise lives in the UNFILTERED gyro. findColumns keeps
  // header order, so ask for unfiltered explicitly first
  // and fall back to the filtered trace only if a log has
  // nothing better.
  const unfilteredColumns = findColumns(headerLine, UNFILTERED_GYRO_PATTERNS);
  const gyroColumnNames = (
    unfilteredColumns.length > 0
      ? unfilteredColumns
      : findColumns(headerLine, [/^gyroADC/i])
  ).slice(0, 3);

  let spectrumStart = Math.floor(timeSeconds.length * 0.15);

  if (headspeed && headspeed.length > 200) {
    const settled = averageOf(
      headspeed.slice(-Math.floor(headspeed.length / 3))
    );

    if (settled && settled > 300) {
      const reached = headspeed.findIndex(
        (value) => value >= settled * 0.9
      );

      if (reached > 0 && reached < headspeed.length * 0.7) {
        spectrumStart = reached;
      }
    }
  }

  const spectra = [];

  if (sampleRate) {
    gyroColumnNames.forEach((name, index) => {
      const spectrum = computeNoiseSpectrum(
        columnValues(name).slice(spectrumStart),
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

  const governedHeadspeed = headspeed
    ? averageOf(headspeed.slice(-Math.floor(headspeed.length / 3)))
    : null;

  const markers = buildSpectrumMarkers(spectra, governedHeadspeed);

  // ---- filter advisor: unfiltered vs filtered gyro ----
  const filteredColumns = findColumns(headerLine, [/^gyroADC/i]).slice(0, 3);
  let filteredSpectrumStrongest = null;

  if (sampleRate && unfilteredColumns.length > 0 && filteredColumns.length > 0) {
    // Match the axis of the strongest unfiltered spectrum
    // so attenuation is measured apples-to-apples.
    let strongestIndex = 0;
    let strongestValue = 0;

    spectra.forEach((entry, index) => {
      let peak = 0;

      for (const value of entry.spectrum.magnitudes) {
        if (value > peak) {
          peak = value;
        }
      }

      if (peak > strongestValue) {
        strongestValue = peak;
        strongestIndex = index;
      }
    });

    const filteredName = filteredColumns[strongestIndex] ?? filteredColumns[0];
    filteredSpectrumStrongest = computeNoiseSpectrum(
      columnValues(filteredName).slice(spectrumStart),
      sampleRate
    );
  }

  const unfilteredSpectrumStrongest = (() => {
    if (spectra.length === 0) {
      return null;
    }

    let strongest = spectra[0];

    for (const entry of spectra) {
      if (
        Math.max(...entry.spectrum.magnitudes) >
        Math.max(...strongest.spectrum.magnitudes)
      ) {
        strongest = entry;
      }
    }

    return strongest.spectrum;
  })();

  const filterAdvice = adviseFilters({
    unfilteredSpectrum: unfilteredSpectrumStrongest,
    filteredSpectrum: hasOwnUnfiltered(headerLine)
      ? filteredSpectrumStrongest
      : null,
    headspeedRpm: governedHeadspeed
  });

  // ---- labs + verdict ----
  const labs = {
    governor: analyzeGovernorLab({ timeSeconds, headspeed, governorTarget }),
    esc: analyzeEscLab({ motor, amperage, vbat }),
    battery: analyzeBatteryLab({ timeSeconds, vbat, amperage })
  };

  const verdict = buildFlightVerdict({
    spectra,
    headspeed,
    governorTarget,
    vbat,
    pidAnalysis
  });

  // Evidence that zooms to the moment: attach a focus
  // window (chart + x-range) to the cards that have one.
  for (const card of verdict.cards) {
    if (card.key === "vibration" && markers.length > 0) {
      card.focus = {
        chartId: "chartSpectrum",
        min: Math.max(0, markers[0].hz - 30),
        max: markers[0].hz + 30
      };
    }

    if (card.key === "rotor" && labs.governor) {
      card.focus = {
        chartId: "chartGovernor",
        min: Math.max(0, labs.governor.droopTimeSeconds - 3),
        max: labs.governor.droopTimeSeconds + 3
      };
    }
  }

  return {
    pidScore: Number.isFinite(pidAnalysis?.score) ? pidAnalysis.score : null,
    batterySagPercent: labs.battery ? labs.battery.sagPercent : null,
    filterAdvice,
    sampleRateHz: sampleRate,
    columnPresence: {
      hasUnfilteredGyro: unfilteredColumns.length > 0,
      hasFilteredGyro: filteredColumns.length > 0,
      hasHeadspeed: Boolean(headspeed),
      hasGovernorTarget: Boolean(governorTarget),
      hasVbat: Boolean(vbat),
      hasAmperage: Boolean(amperage)
    },
    headerLine,
    timeSeconds,
    columnValues,
    findColumnsIn: (patterns) => findColumns(headerLine, patterns),
    headspeed,
    governorTarget,
    vbat,
    amperage,
    spectra,
    markers,
    labs,
    verdict
  };
}

function spectrumPeakValue(spectrum) {
  let peak = 0;

  for (const value of spectrum.magnitudes) {
    if (value > peak) {
      peak = value;
    }
  }

  return peak;
}

function buildSpectrumMarkers(spectra, headspeedRpm) {
  if (!spectra.length) {
    return [];
  }

  // Strongest axis carries the story.
  let strongest = spectra[0];

  for (const entry of spectra) {
    if (spectrumPeakValue(entry.spectrum) > spectrumPeakValue(strongest.spectrum)) {
      strongest = entry;
    }
  }

  const { frequencies, magnitudes } = strongest.spectrum;
  const peaks = [];

  for (let i = 2; i < frequencies.length - 2; i += 1) {
    if (
      frequencies[i] > 10 &&
      magnitudes[i] > magnitudes[i - 1] &&
      magnitudes[i] > magnitudes[i + 1]
    ) {
      peaks.push({ hz: frequencies[i], magnitude: magnitudes[i] });
    }
  }

  peaks.sort((a, b) => b.magnitude - a.magnitude);

  const chosen = [];

  for (const peak of peaks) {
    if (chosen.every((other) => Math.abs(other.hz - peak.hz) > 8)) {
      chosen.push(peak);
    }

    if (chosen.length === 3) {
      break;
    }
  }

  return chosen.map((peak) => {
    let name = `${peak.hz.toFixed(0)} Hz`;

    if (headspeedRpm && headspeedRpm > 300) {
      const ratio = peak.hz / (headspeedRpm / 60);

      if (Math.abs(ratio - 1) < 0.15) name = `main rotor 1/rev · ${name}`;
      else if (Math.abs(ratio - 2) < 0.2) name = `main rotor 2/rev · ${name}`;
      else if (ratio > 3.5 && ratio < 6.5) name = `tail region · ${name}`;
    }

    return { hz: peak.hz, label: name };
  });
}

// ======================================================
// 05. RENDERING
// ======================================================

const STATUS_WORDS = {
  good: "Looks good",
  watch: "Worth watching",
  attention: "Needs attention"
};

function renderVerdict(dataset) {
  const verdict = dataset?.verdict;

  if (!verdict || verdict.cards.length === 0) {
    verdictCard.hidden = true;
    return;
  }

  verdictCard.hidden = false;
  verdictSummary.textContent = verdict.summary;
  verdictCards.innerHTML = "";

  for (const card of verdict.cards) {
    const cardElement = document.createElement("div");
    cardElement.className = `verdict-item status-${card.status}`;

    cardElement.innerHTML = `
      <div class="verdict-item-top">
        <span class="status-dot"></span>
        <span class="verdict-item-title">${card.title}</span>
        <span class="verdict-item-status">${STATUS_WORDS[card.status]}</span>
      </div>
      <div class="verdict-item-headline">${card.headline}</div>
      <div class="verdict-item-detail">${card.detail}</div>
      ${card.action ? `<div class="verdict-item-action"><span>What to do:</span> ${card.action}</div>` : ""}
    `;

    const button = document.createElement("button");
    button.className = "verdict-jump";
    button.textContent = `Show me → ${card.evidence}`;
    button.addEventListener("click", () => {
      navigation.showScreen(card.screen);

      if (card.focus) {
        // Let the screen become visible, then zoom the
        // evidence chart to the exact moment.
        setTimeout(() => {
          const chart =
            el(card.focus.chartId)?.__blackboxLabChart;

          if (chart) {
            chart.setScale("x", {
              min: card.focus.min,
              max: card.focus.max
            });
          }
        }, 120);
      }
    });

    cardElement.appendChild(button);
    verdictCards.appendChild(cardElement);
  }
}

function renderMetricGrid(element, metrics) {
  element.innerHTML = "";

  for (const metric of metrics) {
    const tile = document.createElement("div");
    tile.className = "metric-tile";
    tile.innerHTML = `<span class="label">${metric.label}</span><strong>${metric.value}</strong>`;
    element.appendChild(tile);
  }
}

function renderLab(analysis, storyElement, metricsElement, emptyText) {
  if (!analysis) {
    storyElement.textContent = emptyText;
    metricsElement.innerHTML = "";
    return;
  }

  storyElement.textContent = analysis.story;
  storyElement.className = `lab-story status-text-${analysis.status}`;
  renderMetricGrid(metricsElement, analysis.metrics);
}

function renderSeriesChart(element, dataset, patterns, options = {}) {
  const columns = dataset.findColumnsIn(patterns).slice(0, 6);

  if (columns.length === 0) {
    element.innerHTML =
      '<p class="chart-empty">This log has no data for this chart.</p>';
    return;
  }

  const series = columns.map((name, index) => ({
    label: name,
    values: decimate(dataset.columnValues(name)),
    color: CHART_COLORS[index % CHART_COLORS.length]
  }));

  renderTimeSeriesChart(element, {
    timeSeconds: decimate(dataset.timeSeconds),
    series,
    yLabel: options.yLabel ?? ""
  });
}

// ---- unit conversion for display ----
// Logs store raw units: throttle 0-1000 (Rotorflight) or
// 1000-2000 (Betaflight-style), volts x100, amps x100.
function toThrottlePercent(values) {
  let max = 0;

  for (const value of values) {
    if (value > max) max = value;
  }

  if (max > 1100) {
    return values.map((value) => Math.max(0, (value - 1000) / 10));
  }

  if (max > 100) {
    return values.map((value) => value / 10);
  }

  return values;
}

function toVolts(values) {
  let sum = 0;

  for (const value of values) sum += value;
  const average = values.length ? sum / values.length : 0;
  const scale = average > 1000 ? 100 : average > 100 ? 10 : 1;
  return values.map((value) => value / scale);
}

function toAmps(values) {
  let max = 0;

  for (const value of values) {
    if (value > max) max = value;
  }

  const scale = max > 500 ? 100 : 1;
  return values.map((value) => value / scale);
}

function renderScaledChart(element, dataset, entries, yLabel) {
  const series = [];

  for (const entry of entries) {
    const column = dataset.findColumnsIn(entry.patterns)[0];

    if (column) {
      series.push({
        label: entry.label ?? column,
        values: decimate(entry.convert(dataset.columnValues(column))),
        color: CHART_COLORS[series.length % CHART_COLORS.length]
      });
    }
  }

  if (series.length === 0) {
    element.innerHTML =
      '<p class="chart-empty">This log has no data for this chart.</p>';
    return;
  }

  renderTimeSeriesChart(element, {
    timeSeconds: decimate(dataset.timeSeconds),
    series,
    yLabel
  });
}

function renderAllCharts(dataset) {
  if (!dataset) {
    for (const element of [
      chartGyro, chartTracking, chartHeadspeed, chartThrottle, chartPower,
      chartSpectrum, chartGovernor, chartEsc, chartBattery
    ]) {
      element.innerHTML =
        '<p class="chart-empty">No plottable telemetry found in this log.</p>';
    }

    return;
  }

  renderSeriesChart(chartGyro, dataset, [/^gyroADC/i, /^gyroUnfilt/i, /^gyroRAW/i], {
    yLabel: "deg/s"
  });

  renderSeriesChart(
    chartTracking,
    dataset,
    [/^setpoint\[0\]/i, /^gyroADC\[0\]/i],
    { yLabel: "roll axis" }
  );

  renderSeriesChart(
    chartHeadspeed,
    dataset,
    [/headspeed/i, /^rpm/i, /governor/i],
    { yLabel: "rpm" }
  );

  renderScaledChart(
    chartThrottle,
    dataset,
    [
      { patterns: [/^motor\[0\]/i], label: "main motor %", convert: toThrottlePercent },
      { patterns: [/^motor\[1\]/i], label: "motor 2 %", convert: toThrottlePercent }
    ],
    "throttle (%)"
  );

  renderScaledChart(
    chartPower,
    dataset,
    [
      { patterns: [/^vbat/i], label: "pack voltage (V)", convert: toVolts },
      { patterns: [/amperage/i, /^Ibat/i, /current/i], label: "current (A)", convert: toAmps }
    ],
    "volts · amps"
  );

  {
    const governorColumns = dataset.findColumnsIn([
      /headspeed/i,
      /governorTarget/i,
      /govTarget/i
    ]).slice(0, 6);

    if (governorColumns.length === 0) {
      chartGovernor.innerHTML =
        '<p class="chart-empty">This log has no data for this chart.</p>';
    } else {
      renderTimeSeriesChart(chartGovernor, {
        timeSeconds: decimate(dataset.timeSeconds),
        series: governorColumns.map((name, index) => ({
          label: name,
          values: decimate(dataset.columnValues(name)),
          color: CHART_COLORS[index % CHART_COLORS.length]
        })),
        yLabel: "rpm",
        markers: dataset.labs.governor
          ? [
              {
                x: dataset.labs.governor.droopTimeSeconds,
                label: "worst droop"
              }
            ]
          : []
      });
    }
  }

  renderScaledChart(
    chartEsc,
    dataset,
    [
      { patterns: [/^motor\[0\]/i], label: "main motor %", convert: toThrottlePercent },
      { patterns: [/^motor\[1\]/i], label: "motor 2 %", convert: toThrottlePercent }
    ],
    "throttle (%)"
  );

  renderScaledChart(
    chartBattery,
    dataset,
    [{ patterns: [/^vbat/i], label: "pack voltage (V)", convert: toVolts }],
    "pack voltage (V)"
  );

  if (dataset.spectra.length > 0) {
    renderSpectrumChart(chartSpectrum, dataset.spectra, {
      markers: dataset.markers
    });
  } else {
    chartSpectrum.innerHTML =
      '<p class="chart-empty">Not enough gyro data for a spectrum.</p>';
  }
}

function renderQuality(dataset, flightStats) {
  if (!dataset) {
    qualityCard.hidden = true;
    return;
  }

  const quality = assessLogQuality({
    sampleRateHz: dataset.sampleRateHz,
    durationSeconds:
      dataset.timeSeconds[dataset.timeSeconds.length - 1],
    corruptFrames: flightStats?.corruptFrames ?? 0,
    totalFrames: flightStats
      ? flightStats.intraFrames + flightStats.interFrames
      : 0,
    ...dataset.columnPresence
  });

  qualityCard.hidden = false;
  qualitySummary.textContent = quality.summary;
  qualityChips.innerHTML = "";

  for (const capability of quality.capabilities) {
    const chip = document.createElement("div");
    chip.className = `quality-chip quality-${capability.level}`;
    chip.innerHTML = `
      <strong><span class="status-dot"></span>${capability.name}</strong>
      ${capability.note}
    `;
    qualityChips.appendChild(chip);
  }

  qualityWarnings.innerHTML = "";

  for (const warning of quality.warnings) {
    const warningElement = document.createElement("div");
    warningElement.className = "quality-warning";
    warningElement.textContent = warning;
    qualityWarnings.appendChild(warningElement);
  }
}

function renderFilterAdvisor(dataset) {
  const advice = dataset?.filterAdvice;

  if (!advice) {
    filterAdvisorCard.hidden = true;
    return;
  }

  filterAdvisorCard.hidden = false;
  filterAdvisorStory.textContent = advice.story;

  if (advice.rows.length > 0) {
    filterAdvisorTable.innerHTML = `
      <tr>
        <th>Peak</th><th>Likely source</th><th>Raw</th>
        <th>After filters</th><th>Removed</th>
      </tr>
      ${advice.rows
        .map(
          (row) => `
        <tr>
          <td>${row.hz} Hz</td>
          <td>${row.source}</td>
          <td>${row.magnitude}</td>
          <td>${row.filteredMagnitude ?? "—"}</td>
          <td>${row.reductionPercent !== null ? row.reductionPercent + "%" : "—"}</td>
        </tr>`
        )
        .join("")}
    `;
  } else {
    filterAdvisorTable.innerHTML = "";
  }

  filterAdvisorRecommendations.innerHTML = "";

  advice.recommendations.forEach((recommendation, index) => {
    const item = document.createElement("div");
    item.className = `advisor-recommendation priority-${recommendation.priority}`;
    item.innerHTML = `<span>${
      recommendation.priority === "first"
        ? "Do this first:"
        : recommendation.priority === "filters"
          ? "Filters:"
          : "Worth knowing:"
    }</span> ${recommendation.text}`;
    filterAdvisorRecommendations.appendChild(item);
  });
}

// ======================================================
// 06. ANALYSIS + SCREEN UPDATE
// ======================================================

let currentDataset = null;
let currentFlightLines = null;

function analyzeFlight(flightIndex) {
  const flight = loadedLog.flights[flightIndex];
  const { file, sizeKb, fileType } = loadedLog;
  const lines = flight.lines;
  currentFlightLines = lines;

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

  currentDataset = buildDataset(lines, pidAnalysis);

  renderVerdict(currentDataset);
  renderQuality(currentDataset, flight.stats);
  renderFilterAdvisor(currentDataset);
  renderAllCharts(currentDataset);

  renderLab(
    currentDataset?.labs.governor,
    governorStory,
    governorMetrics,
    "This log has no headspeed/governor data to analyze."
  );
  renderLab(
    currentDataset?.labs.esc,
    escStory,
    escMetrics,
    "This log has no motor data to analyze."
  );
  renderLab(
    currentDataset?.labs.battery,
    batteryStory,
    batteryMetrics,
    "This log has no voltage data to analyze."
  );

  buildReportButton.disabled = !currentDataset;
  reportStatus.textContent = currentDataset
    ? "Ready — the report includes whatever the Labs found."
    : "Open a log first.";

  // ---- file this flight in the craft's health record ----
  if (currentDataset) {
    const craftName = getMetadataValue(currentFlightLines, "Craft name");

    const entry = buildHistoryEntry({
      fileName: file.name,
      flightDateMs: file.lastModified || 0,
      durationSeconds:
        currentDataset.timeSeconds[currentDataset.timeSeconds.length - 1],
      dataset: currentDataset
    });

    const craftKey = recordFlight(
      localStorage,
      craftName === "Not found" ? "Unknown craft" : craftName,
      entry
    );

    refreshHistoryScreen(craftKey);
  }

  refreshCompareButtons();
  compareResultCard.hidden = true;
  compareChartCard.hidden = true;

  // ---- community data sharing (opt-in, anonymized) ----
  if (flight.mainFrames) {
    maybeContributeFlight(flight, fileType, `${file.name}#${flightIndex}`);
  }

  // Land the pilot on the answers, not the data.
  navigation.showScreen("home");
  document.querySelector(".workspace").scrollTop = 0;
}

// ======================================================
// 07. REPORT BUILDER
// ======================================================

buildReportButton.addEventListener("click", () => {
  if (!currentDataset || !currentFlightLines) {
    return;
  }

  const craftName = getMetadataValue(currentFlightLines, "Craft name");
  const firmware = getMetadataValue(currentFlightLines, "firmware");
  const duration =
    currentDataset.timeSeconds[currentDataset.timeSeconds.length - 1];

  const html = buildReportHtml({
    fileName: summaryFileName.textContent,
    craftName: craftName === "Not found" ? null : craftName,
    firmware: firmware === "Not found" ? null : firmware,
    durationSeconds: duration,
    verdict: currentDataset.verdict,
    labs: [
      { title: "Governor Lab", analysis: currentDataset.labs.governor },
      { title: "ESC Lab", analysis: currentDataset.labs.esc },
      { title: "Battery Lab", analysis: currentDataset.labs.battery }
    ],
    chartElements: [
      { title: "Noise Spectrum", element: chartSpectrum },
      { title: "Gyro", element: chartGyro },
      { title: "Setpoint vs Gyro", element: chartTracking },
      { title: "Headspeed & Governor", element: chartGovernor },
      { title: "Throttle", element: chartThrottle },
      { title: "Battery & Current", element: chartPower }
    ]
  });

  const baseName = (summaryFileName.textContent || "flight")
    .replace(/\.[^.]+$/, "");

  downloadReport(html, `blackbox-lab-report-${baseName}.html`);
  reportStatus.textContent =
    "Report saved — check your downloads folder.";
});


// ======================================================
// 08. COMPARE FLIGHTS (before vs after)
// ======================================================

function strongestSpectrumOf(dataset) {
  if (!dataset || dataset.spectra.length === 0) {
    return null;
  }

  let strongest = dataset.spectra[0];

  for (const entry of dataset.spectra) {
    if (
      spectrumPeakValue(entry.spectrum) >
      spectrumPeakValue(strongest.spectrum)
    ) {
      strongest = entry;
    }
  }

  return strongest.spectrum;
}

async function datasetFromLogFile(file) {
  const logData = await readLogFile(file);

  if (!logData || logData.flights.length === 0) {
    return null;
  }

  const lines = logData.flights[0].lines;

  const { pidAnalysis } = buildLogAnalysis({
    fileType: logData.fileType,
    lines,
    aircraftProfiles
  });

  return { dataset: buildDataset(lines, pidAnalysis), name: file.name };
}

function refreshCompareButtons() {
  const ready = Boolean(currentDataset);
  compareOpenButton.disabled = !ready;
  compareSampleButton.disabled = !ready || !window.blackboxLab;

  compareBaselineInfo.textContent = ready
    ? `Before: ${summaryFileName.textContent}`
    : 'No baseline yet — open a log first (Home screen).';
}

function renderComparison(comparisonDataset, comparisonName) {
  if (!currentDataset || !comparisonDataset) {
    return;
  }

  const result = compareFlights(currentDataset, comparisonDataset);

  compareResultCard.hidden = false;
  compareSummary.textContent = result.summary;
  compareRows.innerHTML = "";

  for (const row of result.rows) {
    const rowElement = document.createElement("div");
    rowElement.className = `compare-row direction-${row.direction}`;
    rowElement.innerHTML = `
      <div class="compare-row-top">
        <span class="compare-row-title">${row.title}</span>
        <span class="compare-row-delta">${
          row.direction === "better"
            ? "improved"
            : row.direction === "worse"
              ? "got worse"
              : "unchanged"
        }</span>
      </div>
      <div class="compare-row-sentence">${row.sentence}</div>
      <div class="compare-row-values">before: ${row.before} · after: ${row.after}</div>
    `;
    compareRows.appendChild(rowElement);
  }

  const beforeSpectrum = strongestSpectrumOf(currentDataset);
  const afterSpectrum = strongestSpectrumOf(comparisonDataset);

  if (beforeSpectrum && afterSpectrum) {
    compareChartCard.hidden = false;
    renderSpectrumChart(chartCompareSpectrum, [
      {
        label: `Before (${summaryFileName.textContent})`,
        spectrum: beforeSpectrum,
        color: CHART_COLORS[1]
      },
      {
        label: `After (${comparisonName})`,
        spectrum: afterSpectrum,
        color: CHART_COLORS[0]
      }
    ]);
  }
}

compareOpenButton.addEventListener("click", () => {
  compareFileInput.click();
});

compareFileInput.addEventListener("change", async () => {
  const file = compareFileInput.files[0];

  if (!file) {
    return;
  }

  try {
    const result = await datasetFromLogFile(file);

    if (result && result.dataset) {
      renderComparison(result.dataset, result.name);
    } else {
      compareBaselineInfo.textContent =
        "Could not read flight data from the comparison log.";
    }
  } catch (error) {
    compareBaselineInfo.textContent =
      "Something went wrong: " + error.message;
  }

  compareFileInput.value = "";
});

compareSampleButton.addEventListener("click", async () => {
  const bytes = await window.blackboxLab.readSampleLog(
    "sample-clean-tuned.bbl"
  );

  if (!bytes) {
    return;
  }

  const file = new File(
    [new Uint8Array(bytes)],
    "sample-clean-tuned.bbl"
  );

  const result = await datasetFromLogFile(file);

  if (result && result.dataset) {
    renderComparison(result.dataset, result.name);
  }
});

// ======================================================
// 09. HEALTH RECORD (per-craft history)
// ======================================================

function refreshHistoryScreen(selectedCraft) {
  const history = loadHistory(localStorage);
  const craftNames = Object.keys(history).sort();

  historyCraftSelect.innerHTML = "";

  if (craftNames.length === 0) {
    historyNote.textContent =
      "No flights recorded yet — every log you open is filed here automatically.";
    historyFindings.innerHTML = "";
    historyTrendCard.hidden = true;
    historyTableCard.hidden = true;
    return;
  }

  for (const name of craftNames) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} (${history[name].length} flights)`;
    historyCraftSelect.appendChild(option);
  }

  const craft =
    selectedCraft && history[selectedCraft]
      ? selectedCraft
      : craftNames[0];
  historyCraftSelect.value = craft;

  const entries = history[craft];
  const trends = assessTrends(entries);

  historyNote.textContent = trends.note;
  historyFindings.innerHTML = "";

  for (const finding of trends.findings) {
    const findingElement = document.createElement("div");
    findingElement.className = "verdict-item status-attention";
    findingElement.innerHTML = `
      <div class="verdict-item-top">
        <span class="status-dot"></span>
        <span class="verdict-item-title">Trend</span>
        <span class="verdict-item-status">Needs attention</span>
      </div>
      <div class="verdict-item-detail">${finding.sentence}</div>
    `;
    historyFindings.appendChild(findingElement);
  }

  // ---- trend charts (x = flight number) ----
  const flightNumbers = entries.map((entry, index) => index + 1);

  const trendChart = (element, key, yLabel) => {
    const values = entries.map((entry) =>
      Number.isFinite(entry[key]) ? entry[key] : null
    );

    if (values.filter((value) => value !== null).length < 2) {
      element.innerHTML =
        '<p class="chart-empty">Not enough flights yet for a trend.</p>';
      return;
    }

    renderTimeSeriesChart(element, {
      timeSeconds: flightNumbers,
      series: [{ label: yLabel, values }],
      yLabel,
      xLabel: "Flight #",
      height: 200
    });
  };

  historyTrendCard.hidden = false;
  trendChart(chartTrendVibration, "vibrationPeak", "vibration peak");
  trendChart(chartTrendDroop, "droopRpm", "worst droop (rpm)");

  // ---- flights table ----
  historyTableCard.hidden = false;

  const cell = (value, suffix = "") =>
    value === null || value === undefined ? "—" : `${value}${suffix}`;

  historyTable.innerHTML = `
    <tr>
      <th>Date</th><th>Log</th><th>Length</th><th>Vibration</th>
      <th>Droop</th><th>Tracking</th><th>Sag</th><th>IR est.</th>
    </tr>
    ${entries
      .map(
        (entry) => `
      <tr>
        <td>${new Date(entry.flightDateMs).toLocaleDateString()}</td>
        <td>${entry.fileName}</td>
        <td>${cell(entry.durationSeconds, " s")}</td>
        <td>${cell(entry.vibrationPeak)}${entry.vibrationHz ? ` @ ${entry.vibrationHz} Hz` : ""}</td>
        <td>${cell(entry.droopRpm, " rpm")}</td>
        <td>${cell(entry.trackingScore, "/100")}</td>
        <td>${cell(entry.batterySagPercent, "%")}</td>
        <td>${cell(entry.internalResistance, " mΩ")}</td>
      </tr>`
      )
      .join("")}
  `;
}

historyCraftSelect.addEventListener("change", () => {
  refreshHistoryScreen(historyCraftSelect.value);
});

clearHistoryButton.addEventListener("click", () => {
  if (confirm("Delete the entire health record on this computer?")) {
    clearHistory(localStorage);
    refreshHistoryScreen();
  }
});

refreshHistoryScreen();
refreshCompareButtons();

// ======================================================
// Community data sharing — opt-in, anonymized.
// Dormant unless CONTRIBUTE_ENDPOINT is configured.
// ======================================================

const CONTRIBUTE_PREF_KEY = "blackboxLabContribute";
const CONTRIBUTE_CATS_KEY = "blackboxLabContributeCats";
const contributedThisSession = new Set();

const contributeCard = document.getElementById("contributeCard");
const contributeToggle = document.getElementById("contributeToggle");
const contributePower = document.getElementById("contributePower");
const contributeGps = document.getElementById("contributeGps");
const contributeSetup = document.getElementById("contributeSetup");
const contributeStatus = document.getElementById("contributeStatus");
const contributeAsk = document.getElementById("contributeAsk");

function contributionEnabled() {
  return (
    Boolean(CONTRIBUTE_ENDPOINT) &&
    localStorage.getItem(CONTRIBUTE_PREF_KEY) === "on"
  );
}

function loadContributeCats() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(CONTRIBUTE_CATS_KEY) ?? ""
    );
    return {
      power: stored.power === true,
      gps: stored.gps === true,
      setup: stored.setup === true
    };
  } catch {
    return { power: true, gps: false, setup: true };
  }
}

function saveContributeCats(cats) {
  localStorage.setItem(CONTRIBUTE_CATS_KEY, JSON.stringify(cats));
}

function refreshContributeCard() {
  if (!contributeCard) return;
  contributeCard.hidden = !CONTRIBUTE_ENDPOINT;
  if (!CONTRIBUTE_ENDPOINT) return;

  const cats = loadContributeCats();
  contributeToggle.checked =
    localStorage.getItem(CONTRIBUTE_PREF_KEY) === "on";
  contributePower.checked = cats.power;
  contributeGps.checked = cats.gps;
  contributeSetup.checked = cats.setup;

  const disabled = !contributeToggle.checked;
  [contributePower, contributeGps, contributeSetup].forEach((el) => {
    el.disabled = disabled;
  });
}

function maybeContributeFlight(flight, fileType, key) {
  if (!contributionEnabled()) return;
  if (contributedThisSession.has(key)) return;
  contributedThisSession.add(key);

  const payload = buildContribution(
    flight,
    fileType,
    loadContributeCats(),
    CONTRIBUTE_APP_VERSION
  );

  if (contributeStatus) {
    contributeStatus.textContent = `Sharing: ${describeContribution(payload)} …`;
  }

  uploadContribution(CONTRIBUTE_ENDPOINT, payload)
    .then((result) => {
      if (contributeStatus) {
        contributeStatus.textContent = result.ok
          ? "Last log shared anonymously — thank you for helping the tool learn. ✓"
          : `Sharing failed (server said ${result.status}) — the tool keeps working normally.`;
      }
    })
    .catch(() => {
      if (contributeStatus) {
        contributeStatus.textContent =
          "Sharing failed (no connection) — the tool keeps working normally.";
      }
    });
}

if (contributeToggle) {
  contributeToggle.addEventListener("change", () => {
    localStorage.setItem(
      CONTRIBUTE_PREF_KEY,
      contributeToggle.checked ? "on" : "off"
    );
    refreshContributeCard();
  });

  [contributePower, contributeGps, contributeSetup].forEach((el) => {
    el.addEventListener("change", () => {
      saveContributeCats({
        power: contributePower.checked,
        gps: contributeGps.checked,
        setup: contributeSetup.checked
      });
    });
  });
}

if (contributeAsk && CONTRIBUTE_ENDPOINT) {
  const answered = localStorage.getItem(CONTRIBUTE_PREF_KEY) !== null;

  if (!answered) {
    contributeAsk.hidden = false;

    document.getElementById("askYes").addEventListener("click", () => {
      localStorage.setItem(CONTRIBUTE_PREF_KEY, "on");
      saveContributeCats({
        power: document.getElementById("askPower").checked,
        gps: document.getElementById("askGps").checked,
        setup: document.getElementById("askSetup").checked
      });
      contributeAsk.hidden = true;
      refreshContributeCard();
    });

    document.getElementById("askNo").addEventListener("click", () => {
      localStorage.setItem(CONTRIBUTE_PREF_KEY, "off");
      contributeAsk.hidden = true;
      refreshContributeCard();
    });
  }
}

refreshContributeCard();

// ======================================================
// Welcome hero (empty state): extra open/sample buttons,
// window-wide drag & drop, and a status mirror so loading
// feedback is visible before the hero yields to the cards.
// ======================================================

const welcomeHero = el("welcomeHero");
const welcomeStatus = el("welcomeStatus");

el("welcomeOpenButton").addEventListener("click", openFilePicker);
el("welcomeSampleButton").addEventListener("click", () => {
  trySampleButton.click();
});

// Mirror every fileStatus message into the hero while it is
// visible — loading feedback happens before .log-loaded flips.
new MutationObserver(() => {
  if (welcomeStatus) {
    welcomeStatus.textContent = fileStatus.textContent;
  }
}).observe(fileStatus, { childList: true, characterData: true, subtree: true });

// Drag & drop a log anywhere onto the window.
window.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (welcomeHero) welcomeHero.classList.add("drop-armed");
});

window.addEventListener("dragleave", (event) => {
  if (event.relatedTarget === null && welcomeHero) {
    welcomeHero.classList.remove("drop-armed");
  }
});

window.addEventListener("drop", async (event) => {
  event.preventDefault();
  if (welcomeHero) welcomeHero.classList.remove("drop-armed");

  const file = event.dataTransfer?.files?.[0];
  if (!file) return;

  try {
    await loadFromFile(file);
  } catch (error) {
    fileStatus.textContent =
      "Something went wrong reading this log: " + error.message;
  }
});

// ======================================================
// Update check on startup (silent when offline/current).
// ======================================================

const updateBanner = el("updateBanner");
const UPDATE_DISMISS_KEY = "blackboxLabUpdateDismissed";

checkForUpdate(APP_VERSION).then((update) => {
  if (!update || !updateBanner) return;
  if (localStorage.getItem(UPDATE_DISMISS_KEY) === update.version) return;

  el("updateBannerText").textContent =
    `A new version of Blackbox Lab is out (${update.version} — you have v${APP_VERSION}).`;
  updateBanner.hidden = false;

  el("updateBannerButton").addEventListener("click", () => {
    window.blackboxLab?.openExternal?.(update.url);
  });

  el("updateBannerDismiss").addEventListener("click", () => {
    localStorage.setItem(UPDATE_DISMISS_KEY, update.version);
    updateBanner.hidden = true;
  });
});
