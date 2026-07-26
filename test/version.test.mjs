// ======================================================
// BLACKBOX LAB — VERSION COMPARISON TESTS
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  APP_VERSION,
  isNewerVersion
} from "../src/version.js";

test("APP_VERSION stays in lockstep with package.json", () => {
  const packageJson = JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../package.json", import.meta.url)
      ),
      "utf8"
    )
  );

  assert.equal(
    APP_VERSION,
    packageJson.version,
    "src/version.js APP_VERSION and package.json version must be bumped together — a mismatch shows every user a permanent update banner"
  );
});

test("newer versions are detected across all segments", () => {
  assert.equal(isNewerVersion("v0.4.0", "0.3.0"), true);
  assert.equal(isNewerVersion("0.3.1", "0.3.0"), true);
  assert.equal(isNewerVersion("v1.0.0", "0.9.9"), true);
});

test("same or older versions never trigger", () => {
  assert.equal(isNewerVersion("v0.3.0", "0.3.0"), false);
  assert.equal(isNewerVersion("0.2.9", "0.3.0"), false);
  assert.equal(isNewerVersion("v0.3.0-beta", "0.3.0"), false);
});

test("garbage tags never trigger", () => {
  assert.equal(isNewerVersion("latest", "0.3.0"), false);
  assert.equal(isNewerVersion("", "0.3.0"), false);
  assert.equal(isNewerVersion(null, "0.3.0"), false);
});
