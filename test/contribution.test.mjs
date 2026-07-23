// ======================================================
// BLACKBOX LAB — CONTRIBUTION (ANONYMIZATION) TESTS
// ======================================================
//
// Run with:  npm test   (node --test)
//
// These tests are the privacy contract of the "share
// anonymized logs" feature. If one of them fails, the
// payload is leaking something it promised not to.
//
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildContribution,
  describeContribution
} from "../src/contribute/contributionBuilder.js";

// Synthetic decoded flight in the bblDecoder shape.
// Home position: Vienna city center — must NEVER appear
// in any payload.
const LAT0 = 481_982_000; // 48.1982° in 1e-7 deg
const LON0 = 163_738_000; // 16.3738°

function makeFlight() {
  return {
    headers: new Map([
      ["Field G name", "time,GPS_numSat,GPS_coord[0],GPS_coord[1],GPS_altitude,GPS_speed,GPS_ground_course"],
      ["Log start datetime", "2026-07-23T18:41:02.123+00:00"],
      ["gyro_lpf1_dyn_min_hz", "25"],
      ["gov_headspeed", "1780"],
      ["some_unknown_header", "whatever"]
    ]),
    sysConfig: {
      firmwareType: "Rotorflight",
      firmwareRevision: "4.6.0",
      craftName: "Vince's Goosky RS7",
      boardInformation: "SERIAL-XYZ-123",
      logStartDatetime: "2026-07-23T18:41:02.123+00:00"
    },
    mainFieldNames: [
      "time",
      "gyroADC[0]",
      "setpoint[0]",
      "motor[0]",
      "headspeed",
      "Vbat",
      "secretExperimentalField"
    ],
    mainFrames: [
      [1000, 5, 0, 120, 0, 2333, 42],
      [2000, 7, 1, 130, 500, 2331, 43]
    ],
    slowFieldNames: ["flightModeFlags", "failsafePhase", "privateThing"],
    slowFrames: [{ afterMainFrame: 0, values: [3, 0, 99] }],
    gpsFrames: [
      { afterMainFrame: 0, values: [1000, 12, LAT0, LON0, 500, 0, 0] },
      {
        afterMainFrame: 1,
        values: [2000, 12, LAT0 + 9000, LON0 + 4500, 520, 35, 90]
      }
    ],
    durationSeconds: 133.5
  };
}

const ALL_ON = { power: true, gps: true, setup: true };
const ALL_OFF = { power: false, gps: false, setup: false };

function payloadText(payload) {
  return JSON.stringify(payload);
}

test("core payload never contains dates, board info, or unknown fields", () => {
  const payload = buildContribution(makeFlight(), "Blackbox BBL Log", ALL_ON, "0.3.0");
  const text = payloadText(payload);

  assert.ok(!text.includes("2026-07-23"), "log date leaked");
  assert.ok(!text.includes("SERIAL-XYZ-123"), "board info leaked");
  assert.ok(!text.includes("secretExperimentalField"), "unlisted main field leaked");
  assert.ok(!text.includes("privateThing"), "unlisted slow field leaked");
  assert.ok(!text.includes("some_unknown_header"), "unlisted header leaked");
});

test("absolute GPS coordinates never appear, even with GPS enabled", () => {
  const payload = buildContribution(makeFlight(), "Blackbox BBL Log", ALL_ON, "0.3.0");
  const text = payloadText(payload);

  assert.ok(!text.includes(String(LAT0)), "absolute latitude leaked");
  assert.ok(!text.includes(String(LON0)), "absolute longitude leaked");
  assert.ok(payload.gps, "gps section expected when enabled");

  // First fix is the origin; second is ~100m north, ~50m east.
  const [first, second] = payload.gps.frames;
  const north = payload.gps.fields.indexOf("rel_north_m");
  const east = payload.gps.fields.indexOf("rel_east_m");
  assert.equal(first[north], 0);
  assert.equal(first[east], 0);
  assert.ok(Math.abs(second[north] - 100.2) < 1, `north offset ${second[north]}`);
  assert.ok(Math.abs(second[east] - 33.4) < 5, `east offset ${second[east]}`);

  // Altitude is relative to the first fix.
  const alt = payload.gps.fields.indexOf("rel_altitude");
  assert.equal(first[alt], 0);
  assert.equal(second[alt], 20);
});

test("GPS off means no gps section at all", () => {
  const payload = buildContribution(
    makeFlight(),
    "Blackbox BBL Log",
    { power: true, gps: false, setup: true },
    "0.3.0"
  );
  assert.equal(payload.gps, undefined);
});

test("craft name and tuning ship only with Setup enabled", () => {
  const withSetup = buildContribution(makeFlight(), "Blackbox BBL Log", ALL_ON, "0.3.0");
  assert.equal(withSetup.setup.craftName, "Vince's Goosky RS7");
  assert.equal(withSetup.setup.tuning.gov_headspeed, "1780");

  const withoutSetup = buildContribution(makeFlight(), "Blackbox BBL Log", ALL_OFF, "0.3.0");
  const text = payloadText(withoutSetup);
  assert.ok(!text.includes("Goosky"), "craft name leaked with setup off");
  assert.ok(!text.includes("gov_headspeed"), "tuning leaked with setup off");
  // firmware info is always fine — it identifies software, not people
  assert.equal(withoutSetup.setup.firmwareType, "Rotorflight");
});

test("power fields ship only with Power enabled", () => {
  const withPower = buildContribution(makeFlight(), "Blackbox BBL Log", ALL_ON, "0.3.0");
  assert.ok(withPower.fields.includes("Vbat"));

  const withoutPower = buildContribution(makeFlight(), "Blackbox BBL Log", ALL_OFF, "0.3.0");
  assert.ok(!withoutPower.fields.includes("Vbat"));
  // core channels survive regardless
  assert.ok(withoutPower.fields.includes("gyroADC[0]"));
  assert.ok(withoutPower.fields.includes("headspeed"));
});

test("frame projection keeps values aligned with kept fields", () => {
  const payload = buildContribution(makeFlight(), "Blackbox BBL Log", ALL_ON, "0.3.0");
  const vbat = payload.fields.indexOf("Vbat");
  assert.equal(payload.frames[0][vbat], 2333);
  assert.equal(payload.frames[1][vbat], 2331);
  assert.equal(payload.frames[0].length, payload.fields.length);
});

test("summary text mentions gps privacy when gps is shared", () => {
  const payload = buildContribution(makeFlight(), "Blackbox BBL Log", ALL_ON, "0.3.0");
  const summary = describeContribution(payload);
  assert.ok(summary.includes("never your location"));
});
