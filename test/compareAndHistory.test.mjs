// ======================================================
// BLACKBOX LAB — COMPARE & HEALTH RECORD TESTS
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { compareFlights } from "../src/analysis/compareFlights.js";
import {
  recordFlight,
  loadHistory,
  buildHistoryEntry,
  assessTrends
} from "../src/analysis/craftHistory.js";

function fakeSpectrum(peakHz, magnitude) {
  const frequencies = [];
  const magnitudes = [];

  for (let hz = 0; hz < 200; hz += 1) {
    frequencies.push(hz);
    magnitudes.push(hz === peakHz ? magnitude : 0.2);
  }

  return { frequencies, magnitudes };
}

function fakeDataset({ peakHz, peakMagnitude, droopRpm, pidScore, sag }) {
  return {
    spectra: [{ label: "gyro", spectrum: fakeSpectrum(peakHz, peakMagnitude) }],
    labs: {
      governor: droopRpm !== undefined ? { droopRpm } : null,
      battery: sag !== undefined ? { sagPercent: sag } : null
    },
    pidScore: pidScore ?? null,
    batterySagPercent: sag ?? null
  };
}

test("compareFlights reports improvements in plain language", () => {
  const before = fakeDataset({ peakHz: 30, peakMagnitude: 28, droopRpm: 60, pidScore: 40, sag: 9 });
  const after = fakeDataset({ peakHz: 30, peakMagnitude: 4, droopRpm: 12, pidScore: 70, sag: 8.8 });

  const result = compareFlights(before, after);

  assert.equal(result.rows.length, 4);
  assert.equal(result.rows[0].direction, "better"); // vibration
  assert.equal(result.rows[1].direction, "better"); // droop
  assert.equal(result.rows[2].direction, "better"); // tracking
  assert.equal(result.rows[3].direction, "same"); // sag ~2%
  assert.match(result.summary, /helped/i);
});

test("compareFlights flags regressions", () => {
  const before = fakeDataset({ peakHz: 30, peakMagnitude: 4, droopRpm: 10 });
  const after = fakeDataset({ peakHz: 30, peakMagnitude: 22, droopRpm: 11 });

  const result = compareFlights(before, after);
  const vibration = result.rows.find((row) => row.title === "Vibration");

  assert.equal(vibration.direction, "worse");
  assert.match(result.summary, /wrong way|Mixed/i);
});

function memoryStorage() {
  const map = new Map();

  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

test("craft history records, dedupes, and sorts flights", () => {
  const storage = memoryStorage();

  const entry = (name, dateMs, vib) =>
    buildHistoryEntry({
      fileName: name,
      flightDateMs: dateMs,
      durationSeconds: 100,
      dataset: fakeDataset({ peakHz: 30, peakMagnitude: vib, droopRpm: 10 })
    });

  recordFlight(storage, "Test Heli", entry("b.bbl", 2000, 5));
  recordFlight(storage, "Test Heli", entry("a.bbl", 1000, 4));
  recordFlight(storage, "Test Heli", entry("b.bbl", 2000, 5)); // duplicate

  const history = loadHistory(storage);
  assert.equal(history["Test Heli"].length, 2);
  assert.equal(history["Test Heli"][0].fileName, "a.bbl");
  assert.equal(history["Test Heli"][1].vibrationPeak, 5);
});

test("assessTrends warns when vibration rises across flights", () => {
  const entries = [3, 3.2, 3.1, 6.5, 7.2, 7.8].map((vib, index) => ({
    vibrationPeak: vib,
    droopRpm: 10,
    trackingScore: 80,
    internalResistance: 2,
    flightDateMs: index
  }));

  const { findings } = assessTrends(entries);
  assert.equal(findings.length, 1);
  assert.match(findings[0].sentence, /Vibration has risen/);
});

test("assessTrends stays quiet on a stable machine", () => {
  const entries = Array.from({ length: 6 }, (_, index) => ({
    vibrationPeak: 3 + (index % 2) * 0.2,
    droopRpm: 10,
    trackingScore: 80,
    internalResistance: 2,
    flightDateMs: index
  }));

  const { findings, note } = assessTrends(entries);
  assert.equal(findings.length, 0);
  assert.match(note, /stable/);
});

// ------------------------------------------------------
// Log quality gate + filter advisor
// ------------------------------------------------------

const { assessLogQuality } = await import("../src/analysis/logQuality.js");
const { adviseFilters } = await import("../src/analysis/filterAdvisor.js");

test("quality gate flags slow logging and missing telemetry", () => {
  const quality = assessLogQuality({
    sampleRateHz: 500,
    durationSeconds: 12,
    corruptFrames: 30,
    totalFrames: 600,
    hasUnfilteredGyro: true,
    hasFilteredGyro: true,
    hasHeadspeed: false,
    hasGovernorTarget: false,
    hasVbat: true,
    hasAmperage: false
  });

  const vibration = quality.capabilities.find((c) => c.name.includes("Vibration"));
  assert.equal(vibration.level, "partial");
  const governor = quality.capabilities.find((c) => c.name === "Governor");
  assert.equal(governor.level, "missing");
  assert.equal(quality.warnings.length, 2); // short + corrupt
});

test("quality gate praises a complete fast log", () => {
  const quality = assessLogQuality({
    sampleRateHz: 2000,
    durationSeconds: 300,
    corruptFrames: 0,
    totalFrames: 60000,
    hasUnfilteredGyro: true,
    hasFilteredGyro: true,
    hasHeadspeed: true,
    hasGovernorTarget: true,
    hasVbat: true,
    hasAmperage: true
  });

  assert.ok(quality.capabilities.every((c) => c.level === "full"));
  assert.match(quality.summary, /excellent/);
});

test("filter advisor classifies rotor-linked peaks and measures attenuation", () => {
  const spectrum = (peaks) => {
    const frequencies = [];
    const magnitudes = [];

    for (let hz = 0; hz < 300; hz += 1) {
      frequencies.push(hz);
      magnitudes.push(peaks[hz] ?? 0.3);
    }

    return { frequencies, magnitudes };
  };

  // 1800 rpm → 30 Hz 1/rev; 138 Hz tail (4.6×)
  const advice = adviseFilters({
    unfilteredSpectrum: spectrum({ 30: 25, 138: 12 }),
    filteredSpectrum: spectrum({ 30: 2, 138: 8 }),
    headspeedRpm: 1800
  });

  assert.equal(advice.rows.length, 2);
  assert.match(advice.rows[0].source, /main rotor 1\/rev/);
  assert.match(advice.rows[1].source, /tail region/);
  assert.ok(advice.rows[0].reductionPercent > 85);
  assert.ok(advice.rows[1].reductionPercent < 70);

  const doFirst = advice.recommendations.find((r) => r.priority === "first");
  assert.ok(doFirst, "strong peak must trigger mechanics-first advice");

  const filters = advice.recommendations.filter((r) => r.priority === "filters");
  assert.ok(filters.some((r) => /RPM filter/.test(r.text)));
  assert.ok(filters.some((r) => /138 Hz/.test(r.text)));
});
