// ======================================================
// BLACKBOX LAB — FEEDFORWARD DOCTRINE TESTS
//
// Rotorflight expects feedforward to carry the work during
// commanded motion. Sustained near-peak feedforward must be
// reported as expected behavior, never as a saturation fault
// that lowers the tuning score.
// ======================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { applyFeedforwardDoctrine } from "../src/analysis/pidAnalysis.js";

test("sustained feedforward drive is remapped from Review to Expected", () => {
  const reviewAssessment = {
    status: "Review",
    confidence: "High",
    recommendation:
      "Repeated near-maximum PID-term activity was detected.",
    sustainedRunDetected: true,
    elevatedNearPeakActivity: true,
    moderateNearPeakActivity: true
  };

  const result = applyFeedforwardDoctrine(reviewAssessment);

  assert.equal(result.status, "Expected");
  assert.equal(result.confidence, "High");
  assert.match(
    result.recommendation,
    /command-balance/,
    "the doctrine text must point at the command-balance result"
  );
  assert.match(
    result.recommendation,
    /does not reduce the score/
  );
});

test("Clear feedforward assessments pass through untouched", () => {
  const clearAssessment = {
    status: "Clear",
    confidence: "Medium",
    recommendation:
      "No repeated sustained PID-term saturation pattern was identified."
  };

  assert.deepEqual(
    applyFeedforwardDoctrine(clearAssessment),
    clearAssessment
  );
});

test("Insufficient Data feedforward assessments pass through untouched", () => {
  const insufficientAssessment = {
    status: "Insufficient Data",
    confidence: "Low",
    recommendation:
      "More valid PID-term samples are required before evaluating saturation."
  };

  assert.deepEqual(
    applyFeedforwardDoctrine(insufficientAssessment),
    insufficientAssessment
  );
});
