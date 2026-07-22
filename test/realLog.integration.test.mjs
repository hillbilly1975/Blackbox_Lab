// ======================================================
// BLACKBOX LAB — OPTIONAL REAL-LOG INTEGRATION TEST
// ======================================================
//
// Drop any real .bbl/.bfl into test/fixtures/ and this
// test validates the decoder against it. Skips cleanly
// when no fixture is present (e.g. fresh clones / CI).
//
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeBblFile } from "../src/analysis/bbl/bblDecoder.js";

const fixturesDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures"
);

const fixtures = existsSync(fixturesDirectory)
  ? readdirSync(fixturesDirectory).filter((name) =>
      /\.(bbl|bfl)$/i.test(name)
    )
  : [];

test("real log fixtures decode cleanly", { skip: fixtures.length === 0 }, () => {
  for (const name of fixtures) {
    const bytes = new Uint8Array(
      readFileSync(join(fixturesDirectory, name))
    );

    const { flightCount, flights } = decodeBblFile(bytes);
    assert.ok(flightCount >= 1, `${name}: no flights found`);

    for (const flight of flights) {
      if (flight.mainFrames.length === 0) {
        continue;
      }

      const timeIndex = flight.mainFieldNames.indexOf("time");
      assert.ok(timeIndex >= 0, `${name}: no time field`);

      for (let i = 1; i < flight.mainFrames.length; i += 1) {
        assert.ok(
          flight.mainFrames[i][timeIndex] >=
            flight.mainFrames[i - 1][timeIndex],
          `${name}: time went backwards at frame ${i}`
        );
      }
    }
  }
});
