// ======================================================
// CONTRIBUTION WIRING — READER TO BUILDER
// ======================================================
//
// contribution.test.mjs covers what the payload may and
// may not contain, using a hand-built flight. These tests
// cover the seam either side of it: that the log reader
// hands out something the contribution builder can
// actually consume, for a real file, end to end.
//
// ======================================================

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readLogFile } from "../src/analysis/logFileReader.js";
import { buildContribution } from "../src/contribute/contributionBuilder.js";
import { CONTRIBUTE_APP_VERSION } from "../src/contribute/config.js";
import { APP_VERSION } from "../src/version.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_PATH = path.join(
  here,
  "..",
  "samples",
  "sample-clean-tuned.bbl"
);

const ALL_ON = { power: true, gps: true, setup: true };

async function readSample() {
  const bytes = fs.readFileSync(SAMPLE_PATH);

  return readLogFile(
    new File([bytes], path.basename(SAMPLE_PATH))
  );
}

test("the reader hands out the decoded flight, not only its rows", async () => {
  const logData = await readSample();

  assert.ok(logData.flights.length > 0, "expected at least one flight");

  const flight = logData.flights[0];

  assert.ok(
    flight.decoded,
    "each flight must carry its decoded form for sharing"
  );

  assert.ok(
    Array.isArray(flight.decoded.mainFrames) &&
      flight.decoded.mainFrames.length > 0,
    "the decoded flight must still hold its frames"
  );

  assert.ok(
    Array.isArray(flight.decoded.mainFieldNames) &&
      flight.decoded.mainFieldNames.length > 0,
    "the decoded flight must still hold its field names"
  );
});

test("what the reader hands out is what the builder consumes", async () => {
  const logData = await readSample();

  const payload = buildContribution(
    logData.flights[0].decoded,
    logData.fileType,
    ALL_ON,
    CONTRIBUTE_APP_VERSION
  );

  assert.ok(payload, "a payload was expected");

  assert.ok(
    Array.isArray(payload.fields) && payload.fields.length > 0,
    "payload should name the fields it carries"
  );

  assert.ok(
    Array.isArray(payload.frames) && payload.frames.length > 0,
    "payload should carry frames — an empty one would upload nothing useful"
  );

  assert.equal(
    payload.frames[0].length,
    payload.fields.length,
    "every frame should line up with the field list"
  );
});

test("contributions are labelled with the running app version", () => {
  assert.equal(CONTRIBUTE_APP_VERSION, APP_VERSION);
});
