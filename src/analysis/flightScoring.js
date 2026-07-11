
function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
function calculateOverallFlightScore(
  escAnalysis,
  telemetryAnalysis,
  profileAnalysis,
  governorAnalysis
) {
  const governorWeight =
    governorAnalysis.score > 0 ? 0.25 : 0;

  const baseWeight =
    1 - governorWeight;

  const weightedScore =
    escAnalysis.score * (0.50 * baseWeight) +
    telemetryAnalysis.score * (0.30 * baseWeight) +
    profileAnalysis.score * (0.20 * baseWeight) +
    governorAnalysis.score * governorWeight;

  return clampScore(weightedScore);
}


function getScoreRating(score) {
  if (score >= 95) {
    return "Excellent";
  }

  if (score >= 85) {
    return "Very Good";
  }

  if (score >= 70) {
    return "Good";
  }

  if (score >= 55) {
    return "Fair";
  }

  return "Needs Review";
}


function getAnalysisConfidence(
  profile,
  telemetryAnalysis,
  averageEscOutput,
  governorAnalysis
) {
  let confidencePoints = 0;

  if (profile) {
    confidencePoints += 30;
  }

  if (averageEscOutput !== null) {
    confidencePoints += 25;
  }

  if (governorAnalysis.score > 0) {
    confidencePoints += 15;
  }

  confidencePoints += telemetryAnalysis.score * 0.30;

  const confidenceScore = clampScore(confidencePoints);

  let confidenceLabel = "Low";

  if (confidenceScore >= 85) {
    confidenceLabel = "High";
  } else if (confidenceScore >= 60) {
    confidenceLabel = "Moderate";
  }

  return {
    score: confidenceScore,
    label: confidenceLabel
  };
}
export {
  calculateOverallFlightScore,
  getScoreRating,
  getAnalysisConfidence
};