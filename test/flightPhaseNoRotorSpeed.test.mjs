// ======================================================
// FLIGHT PHASE — LOGS WITHOUT ROTOR SPEED
// ======================================================
//
// Nitro and turbine models, and electric models flown
// without the RPM sensor wired, log headspeed as a
// constant zero. These tests cover how the shared phase
// detector behaves for those logs.
//
// ======================================================

import test from "node:test";
import assert from "node:assert/strict";

import {
  detectStableFlightPhase,
  hasUsableRotorSpeed
} from "../src/analysis/flightPhase.js";

const SAMPLE_RATE = 1000;
const DURATION_SECONDS = 60;
const SAMPLE_COUNT = SAMPLE_RATE * DURATION_SECONDS;

function buildTimeSeconds() {
  return Array.from(
    { length: SAMPLE_COUNT },
    (_, index) => index / SAMPLE_RATE
  );
}

// Deterministic stand-in for sensor noise, so the tests
// never depend on a random seed.
function wobble(index, amplitude) {
  return (
    Math.sin(index * 0.37) * amplitude +
    Math.cos(index * 1.13) * amplitude * 0.5
  );
}

test("rotor speed is recognised when it is present", () => {
  assert.equal(hasUsableRotorSpeed([0, 0, 1800, 1805]), true);
  assert.equal(hasUsableRotorSpeed([0, 0, 0, 0]), false);
  assert.equal(hasUsableRotorSpeed([]), false);
  assert.equal(hasUsableRotorSpeed(null), false);
});

test("a governed log still uses rotor speed as the basis", () => {
  const timeSeconds = buildTimeSeconds();

  const headspeed = timeSeconds.map((_, index) =>
    1800 + wobble(index, 4)
  );

  const phase = detectStableFlightPhase({
    timeSeconds,
    headspeed,
    governorTarget: timeSeconds.map(() => 1800)
  });

  assert.equal(phase.basis, "headspeed");
  assert.equal(phase.hasRotorSpeedData, true);
  assert.ok(phase.stableSampleCount > 0);
});

test("a log with no rotor speed and no motion signal says so", () => {
  const timeSeconds = buildTimeSeconds();

  const phase = detectStableFlightPhase({
    timeSeconds,
    headspeed: timeSeconds.map(() => 0),
    governorTarget: []
  });

  assert.equal(phase.basis, "none");
  assert.equal(phase.hasRotorSpeedData, false);
  assert.equal(phase.stableSampleCount, 0);
  assert.match(phase.reason, /no rotor-speed data/i);
});

test("a flown log with no rotor speed falls back to airframe motion", () => {
  const timeSeconds = buildTimeSeconds();

  // On the ground until 8 s, flying until 52 s, then down.
  const activity = timeSeconds.map((time, index) => {
    const airborne = time > 8 && time < 52;

    return airborne
      ? 140 + wobble(index, 20)
      : 2 + Math.abs(wobble(index, 1));
  });

  const phase = detectStableFlightPhase({
    timeSeconds,
    headspeed: timeSeconds.map(() => 0),
    governorTarget: [],
    activity
  });

  assert.equal(phase.basis, "activity");
  assert.equal(phase.hasRotorSpeedData, false);
  assert.equal(phase.movedDuringRecording, true);
  assert.ok(phase.segments.length >= 1);

  const segment = phase.segments[0];

  // The window sits inside the flight, clear of spool-up
  // and spool-down.
  assert.ok(timeSeconds[segment.startIndex] >= 8);
  assert.ok(timeSeconds[segment.endIndex] <= 52);
});

test("a bench run with no rotor speed is not mistaken for flight", () => {
  const timeSeconds = buildTimeSeconds();

  // Servos and throttle move, the airframe does not: gyro
  // noise only, with a quieter and a busier half so that
  // contrast alone would form a ratio.
  const activity = timeSeconds.map((time, index) => {
    const busier = time > 25;

    return (
      (busier ? 1.4 : 0.4) + Math.abs(wobble(index, busier ? 0.6 : 0.2))
    );
  });

  const phase = detectStableFlightPhase({
    timeSeconds,
    headspeed: timeSeconds.map(() => 0),
    governorTarget: [],
    activity
  });

  assert.equal(phase.basis, "none");
  assert.equal(phase.movedDuringRecording, false);
  assert.equal(phase.stableSampleCount, 0);
  assert.match(phase.reason, /did not move/i);
});
