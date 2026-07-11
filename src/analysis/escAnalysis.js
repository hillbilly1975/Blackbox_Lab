function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
function parseTargetRange(targetText) {
  if (!targetText) {
    return null;
  }

  const matches = targetText.match(
    /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/
  );

  if (!matches) {
    return null;
  }

  return {
    minimum: Number(matches[1]),
    maximum: Number(matches[2])
  };
}


function analyzeEscOutput(averageEscOutputRaw, profile) {
  if (averageEscOutputRaw === null) {
    return {
      score: 0,
      status: "Unavailable",
      finding: "ESC output data was not found.",
      severity: "warning"
    };
  }

  const averagePercent = averageEscOutputRaw / 10;
  const targetRange = parseTargetRange(
    profile ? profile.targetEscOutput : null
  );

  if (!targetRange) {
    return {
      score: 70,
      status: "Detected",
      finding:
        `Average ESC output was ${averagePercent.toFixed(1)}%, ` +
        "but no aircraft target range is available.",
      severity: "info"
    };
  }

  const minimum = targetRange.minimum;
  const maximum = targetRange.maximum;

  if (
    averagePercent >= minimum &&
    averagePercent <= maximum
  ) {
    return {
      score: 100,
      status: "Excellent",
      finding:
        `Average ESC output was ${averagePercent.toFixed(1)}%, ` +
        `inside the aircraft target of ${minimum}-${maximum}%.`,
      severity: "good"
    };
  }

  const distanceBelow = minimum - averagePercent;
  const distanceAbove = averagePercent - maximum;
  const distance = Math.max(distanceBelow, distanceAbove);

  if (distance <= 3) {
    return {
      score: 90,
      status: "Very Good",
      finding:
        `Average ESC output was ${averagePercent.toFixed(1)}%, ` +
        `slightly outside the preferred ${minimum}-${maximum}% range.`,
      severity: "good"
    };
  }

  if (distance <= 7) {
    return {
      score: 75,
      status: "Acceptable",
      finding:
        `Average ESC output was ${averagePercent.toFixed(1)}%. ` +
        `The preferred range is ${minimum}-${maximum}%.`,
      severity: "caution"
    };
  }

  return {
    score: 50,
    status: "Needs Review",
    finding:
      `Average ESC output was ${averagePercent.toFixed(1)}%, ` +
      `well outside the preferred ${minimum}-${maximum}% range.`,
    severity: "warning"
  };
}export { analyzeEscOutput };