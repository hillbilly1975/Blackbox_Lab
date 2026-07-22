// ======================================================
// BLACKBOX LAB — GENERATOR ↔ DECODER ↔ FFT LOOP TEST
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { generateFlight } from "../tools/generateSampleLog.mjs";
import { decodeBblFile } from "../src/analysis/bbl/bblDecoder.js";
import {
  computeNoiseSpectrum,
  estimateSampleRate
} from "../src/analysis/dsp/fft.js";

test("generated flight decodes and the FFT finds the planted vibration", () => {
  const { bytes, groundTruth } = generateFlight("vibration-problem", 12);
  const { flights } = decodeBblFile(bytes);

  assert.equal(flights.length, 1);

  const flight = flights[0];
  assert.equal(flight.stats.corruptFrames, 0);
  assert.ok(flight.mainFrames.length > 20000);

  const names = flight.mainFieldNames;
  const timeIndex = names.indexOf("time");
  const gyroIndex = names.indexOf("gyroUnfilt[0]");

  const time = flight.mainFrames.map((f) => f[timeIndex]);
  const gyro = flight.mainFrames.map((f) => f[gyroIndex]);

  const sampleRate = estimateSampleRate(time);
  assert.ok(Math.abs(sampleRate - groundTruth.sampleRateHz) < 20);

  // Skip spool-up, analyze governed flight only.
  const spectrum = computeNoiseSpectrum(gyro.slice(14000), sampleRate);
  assert.ok(spectrum);

  let peakHz = 0;
  let peakMagnitude = 0;

  for (let i = 0; i < spectrum.frequencies.length; i += 1) {
    if (
      spectrum.frequencies[i] > 10 &&
      spectrum.magnitudes[i] > peakMagnitude
    ) {
      peakMagnitude = spectrum.magnitudes[i];
      peakHz = spectrum.frequencies[i];
    }
  }

  // The dominant peak must be the planted 1/rev vibration.
  assert.ok(
    Math.abs(peakHz - groundTruth.expectedMainRotorPeakHz) < 2,
    `expected ~${groundTruth.expectedMainRotorPeakHz} Hz, found ${peakHz} Hz`
  );
});
