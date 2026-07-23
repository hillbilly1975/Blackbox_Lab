// ======================================================
// BLACKBOX LAB — CHART LABEL TRANSLATION TESTS
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { friendlyLabel, friendlySeriesLabel } from "../src/ui/charts.js";

test("numbered channels become axis names", () => {
  assert.equal(friendlySeriesLabel("gyroADC[0]"), "Roll gyro (filtered)");
  assert.equal(friendlySeriesLabel("gyroRAW[2]"), "Yaw gyro (raw)");
  assert.equal(friendlySeriesLabel("setpoint[1]"), "Pitch target");
  assert.equal(friendlySeriesLabel("setpoint[3]"), "Collective target");
  assert.equal(friendlySeriesLabel("axisD[2]"), "Yaw D-term");
});

test("whole-name channels translate too", () => {
  assert.equal(friendlyLabel("headspeed"), "Headspeed");
  assert.equal(friendlyLabel("govTarget"), "Governor target");
});

test("unknown names pass through untouched", () => {
  assert.equal(friendlyLabel("debug[7]"), "debug[7]");
  assert.equal(friendlyLabel("someFutureField"), "someFutureField");
});
