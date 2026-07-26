// ======================================================
// BLACKBOX LAB — PER-PROFILE BREAKDOWN TESTS
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { longestConsecutiveRun } from "../src/analysis/evidenceViews.js";
import { analyzeProfileResponse } from "../src/analysis/profilePidBreakdown.js";

test("longestConsecutiveRun finds the biggest unbroken stretch", () => {
  assert.deepEqual(
    longestConsecutiveRun([1, 2, 3, 10, 11, 12, 13, 14, 30]),
    { startIndex: 10, length: 5 }
  );
  assert.deepEqual(longestConsecutiveRun([7]), {
    startIndex: 7,
    length: 1
  });
  assert.equal(longestConsecutiveRun([]), null);
});

// A tiny synthetic CSV: header + rows. Bank A rows track
// cleanly; bank B rows overshoot the setpoint by 50%.
function syntheticLines() {
  const lines = ['time,setpoint[0],gyroADC[0]'];

  for (let i = 0; i < 60; i += 1) {
    lines.push(`${i},100,102`); // bank A: tight tracking
  }

  for (let i = 60; i < 120; i += 1) {
    lines.push(`${i},100,150`); // bank B: 50% overshoot
  }

  return lines;
}

test("analyzeProfileResponse measures overshoot per profile", () => {
  const lines = syntheticLines();

  const profiles = [
    {
      targetRpm: 1700,
      // row indexes are relative to the header line
      sampleIndexes: Array.from({ length: 60 }, (_, i) => i + 1)
    },
    {
      targetRpm: 1900,
      sampleIndexes: Array.from({ length: 60 }, (_, i) => i + 61)
    }
  ];

  const results = analyzeProfileResponse({
    lines,
    telemetryHeaderIndex: 0,
    headspeedProfiles: profiles,
    setpointColumns: ["setpoint[0]"],
    gyroColumns: ["gyroADC[0]"],
    axisNames: ["Roll"]
  });

  assert.equal(results.length, 2);

  const calm = results[0].axisResults[0];
  assert.equal(calm.axis, "Roll");
  assert.ok(calm.commandedSampleCount > 0);
  assert.equal(calm.exceedanceRatePercent, 0);
  assert.equal(calm.peakExceedancePercent, null);

  const hot = results[1].axisResults[0];
  assert.equal(hot.exceedanceRatePercent, 100);
  assert.ok(
    hot.peakExceedancePercent > 30 &&
      hot.peakExceedancePercent < 50,
    `peak exceedance should be ~40% (150 vs 100+10 deadband), got ${hot.peakExceedancePercent}`
  );
});

test("analyzeProfileResponse handles missing columns honestly", () => {
  const results = analyzeProfileResponse({
    lines: syntheticLines(),
    telemetryHeaderIndex: 0,
    headspeedProfiles: [
      { targetRpm: 1700, sampleIndexes: [1, 2, 3] }
    ],
    setpointColumns: [],
    gyroColumns: [],
    axisNames: ["Roll"]
  });

  assert.equal(
    results[0].axisResults[0].exceedanceRatePercent,
    null
  );
});
