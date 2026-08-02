// ======================================================
// BLACKBOX LAB — FLIGHT SELECTION TESTS
// ======================================================
//
// Run with:  npm test   (node --test)
//
// The comparison flight picker preselects the longest
// flight of a multi-flight file — the same choice Compare
// Flights used to make silently. These tests pin that
// behavior down.
//
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  frameCountOf,
  longestFlightIndex
} from "../src/analysis/flightSelection.js";

const flight = (intra, inter) => ({
  stats: { intraFrames: intra, interFrames: inter }
});

test("frame count is intra plus inter frames", () => {
  assert.equal(frameCountOf(flight(100, 900)), 1000);
  assert.equal(frameCountOf({}), 0);
  assert.equal(frameCountOf(null), 0);
  assert.equal(frameCountOf({ stats: null }), 0);
});

test("the longest flight wins, not the first or last", () => {
  const flights = [
    flight(10, 90), // 100
    flight(100, 4900), // 5000 — the real flight
    flight(1, 9) // 10 — a half-written tail session
  ];

  assert.equal(longestFlightIndex(flights), 1);
});

test("ties keep the earlier flight; degenerate inputs pick 0", () => {
  assert.equal(
    longestFlightIndex([flight(50, 50), flight(60, 40)]),
    0,
    "equal totals should keep the first flight"
  );
  assert.equal(longestFlightIndex([]), 0);
  assert.equal(longestFlightIndex(null), 0);
  assert.equal(longestFlightIndex([flight(1, 1)]), 0);
});

test("flights without stats (text exports) never outrank decoded ones", () => {
  const flights = [
    { stats: null },
    flight(100, 900)
  ];

  assert.equal(longestFlightIndex(flights), 1);
});
