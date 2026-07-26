
function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
function calculateOverallFlightScore(
  escAnalysis,
  telemetryAnalysis,
  profileAnalysis,
  governorAnalysis
) {
  const scoredSystems = [];

  if (
    escAnalysis &&
    escAnalysis.status !== "Unavailable" &&
    Number.isFinite(escAnalysis.score)
  ) {
    scoredSystems.push({
      score: escAnalysis.score,
      weight: 0.5
    });
  }

  if (
    governorAnalysis &&
    governorAnalysis.status !== "Unavailable" &&
    governorAnalysis.status !== "No Active Flight Data" &&
    governorAnalysis.status !== "Target Unavailable" &&
    Number.isFinite(governorAnalysis.score)
  ) {
    scoredSystems.push({
      score: governorAnalysis.score,
      weight: 0.25
    });
  }

  if (scoredSystems.length === 0) {
    return null;
  }

  const totalWeight = scoredSystems.reduce(
    (sum, system) => sum + system.weight,
    0
  );

  const weightedScore = scoredSystems.reduce(
    (sum, system) =>
      sum + system.score * (system.weight / totalWeight),
    0
  );

  return clampScore(weightedScore);
}


function getScoreRating(score) {
  if (!Number.isFinite(score)) {
    return "Not Scored";
  }

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

  if (
  governorAnalysis &&
  governorAnalysis.status !== "Unavailable" &&
  governorAnalysis.status !== "No Active Flight Data" &&
  governorAnalysis.status !== "Target Unavailable" &&
  Number.isFinite(governorAnalysis.score)
) {
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