// ======================================================
// BLACKBOX LAB — EVIDENCE VIEW HELPER TESTS
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sliceWindow,
  windowStats,
  findHighestLoadEvents,
  explainLoadEvent,
  groupByGovernorTarget
} from "../src/analysis/evidenceViews.js";

const secondsAxis = (count, rateHz) =>
  Array.from({ length: count }, (_, index) => index / rateHz);

test("sliceWindow clamps to the recording and centers on the moment", () => {
  const time = secondsAxis(1000, 100); // 10 s at 100 Hz

  const window = sliceWindow(time, 5, 1, 2);
  assert.ok(window);
  assert.ok(Math.abs(time[window.startIndex] - 4) < 0.02);
  assert.ok(Math.abs(time[window.endIndex] - 7) < 0.02);

  const clamped = sliceWindow(time, 0.2, 5, 1);
  assert.equal(clamped.startIndex, 0);

  assert.equal(sliceWindow(time, null, 1, 1), null);
});

test("windowStats ignores gaps and reports min/max/average", () => {
  const values = [1, null, 3, NaN, 5];
  const stats = windowStats(values, 0, 4);

  assert.equal(stats.min, 1);
  assert.equal(stats.max, 5);
  assert.equal(stats.average, 3);
  assert.equal(stats.sampleCount, 3);
});

test("findHighestLoadEvents returns non-overlapping top windows in time order", () => {
  const time = secondsAxis(3000, 100); // 30 s
  const load = time.map((t) => {
    if (t >= 5 && t < 7) return 80; // biggest event
    if (t >= 20 && t < 22) return 60; // second event
    return 10;
  });

  const events = findHighestLoadEvents(
    { timeSeconds: time, load },
    { windowSeconds: 2, count: 2 }
  );

  assert.equal(events.length, 2);
  assert.ok(events[0].startSeconds < events[1].startSeconds);
  assert.ok(events[0].averageLoad > 50);
  assert.ok(events[1].averageLoad > 40);
  assert.ok(
    events[0].endIndex < events[1].startIndex,
    "events must not overlap"
  );
});

test("explainLoadEvent tells limit from sag from normal load", () => {
  const limit = explainLoadEvent({
    outputPeakPercent: 100,
    outputSaturatedShare: 0.4,
    voltageSagPercent: 12
  });
  assert.equal(limit.cause, "headroom-limit");

  const sag = explainLoadEvent({
    outputPeakPercent: 88,
    outputSaturatedShare: 0,
    voltageSagPercent: 10
  });
  assert.equal(sag.cause, "battery-sag");

  const normal = explainLoadEvent({
    outputPeakPercent: 85,
    outputSaturatedShare: 0,
    voltageSagPercent: 3
  });
  assert.equal(normal.cause, "normal-load");
});

test("groupByGovernorTarget clusters banks and ignores tiny groups", () => {
  const governorTarget = [];
  const sampleIndexes = [];

  // Bank 1: 1700 rpm ±5 for 200 samples; Bank 2: 1900 rpm for
  // 150 samples; noise bank: 2100 rpm for only 20 samples.
  for (let i = 0; i < 200; i += 1) {
    governorTarget.push(1700 + (i % 2 === 0 ? 5 : -5));
    sampleIndexes.push(governorTarget.length - 1);
  }
  for (let i = 0; i < 150; i += 1) {
    governorTarget.push(1900);
    sampleIndexes.push(governorTarget.length - 1);
  }
  for (let i = 0; i < 20; i += 1) {
    governorTarget.push(2100);
    sampleIndexes.push(governorTarget.length - 1);
  }

  const banks = groupByGovernorTarget({ governorTarget, sampleIndexes });

  assert.equal(banks.length, 2);
  assert.equal(banks[0].targetRpm, 1700);
  assert.equal(banks[1].targetRpm, 1900);
  assert.equal(banks[0].indexes.length, 200);
});
