function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
function analyzeTelemetry(keyHeaders) {
  const foundCount = keyHeaders.filter(
    ([label, header]) => Boolean(header)
  ).length;

  const totalCount = keyHeaders.length;

  const score = totalCount > 0
    ? clampScore((foundCount / totalCount) * 100)
    : 0;

  let status = "Limited";
  let finding =
    `${foundCount} of ${totalCount} key telemetry channels were detected.`;

  if (score >= 90) {
    status = "Excellent";
    finding += " The log contains a strong analysis dataset.";
  } else if (score >= 70) {
    status = "Good";
    finding += " Most important telemetry is available.";
  } else if (score >= 45) {
    status = "Partial";
    finding += " Some advanced analysis will be limited.";
  } else {
    status = "Poor";
    finding +=
      " The log does not contain enough telemetry for reliable analysis.";
  }

  return {
    score,
    status,
    finding,
    foundCount,
    totalCount
  };
}
export { analyzeTelemetry };