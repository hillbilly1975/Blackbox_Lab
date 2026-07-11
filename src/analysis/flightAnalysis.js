import { analyzeGovernor } from "./governorAnalysis.js";
import { analyzeTelemetry } from "./telemetryAnalysis.js";
import { analyzeAircraftProfile } from "./aircraftProfileAnalysis.js";
import { analyzeEscOutput } from "./escAnalysis.js";

import {
  calculateOverallFlightScore,
  getScoreRating,
  getAnalysisConfidence
} from "./flightScoring.js";

export function buildFlightAnalysis(
  averageEscOutput,
  profile,
  keyHeaders,
  headspeedValues,
  governorTargetValues
) {
  const escAnalysis = analyzeEscOutput(
    averageEscOutput,
    profile
  );

  const telemetryAnalysis = analyzeTelemetry(
    keyHeaders
  );

  const profileAnalysis = analyzeAircraftProfile(
    profile
  );

  const governorAnalysis = analyzeGovernor(
    headspeedValues,
    governorTargetValues
  );

  const overallScore = calculateOverallFlightScore(
    escAnalysis,
    telemetryAnalysis,
    profileAnalysis,
    governorAnalysis
  );

  const confidence = getAnalysisConfidence(
    profile,
    telemetryAnalysis,
    averageEscOutput,
    governorAnalysis
  );

  return {
    overallScore,
    rating: getScoreRating(overallScore),
    confidence,
    esc: escAnalysis,
    telemetry: telemetryAnalysis,
    profile: profileAnalysis,
    governor: governorAnalysis
  };
}