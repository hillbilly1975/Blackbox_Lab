// ======================================================
// BLACKBOX LAB — GOVERNOR LAB ANALYSIS
// ======================================================
//
// How well did the governor hold rotor speed? Judged only
// on the governed part of the flight (spool-up excluded).
//
// ======================================================

export function analyzeGovernorLab({ timeSeconds, headspeed, governorTarget }) {
  if (!headspeed || headspeed.length < 100) {
    return null;
  }

  const governed = [];

  for (let i = 0; i < headspeed.length; i += 1) {
    const target = governorTarget ? governorTarget[i] : null;

    if (target && target > 300 && headspeed[i] > target * 0.85) {
      governed.push({
        time: timeSeconds[i],
        actual: headspeed[i],
        target
      });
    }
  }

  if (governed.length < 100) {
    return null;
  }

  let averageTarget = 0;
  let averageActual = 0;
  let maximumDroop = 0;
  let droopTime = 0;
  let squaredErrorSum = 0;

  for (const sample of governed) {
    averageTarget += sample.target;
    averageActual += sample.actual;

    const droop = sample.target - sample.actual;
    squaredErrorSum += droop * droop;

    if (droop > maximumDroop) {
      maximumDroop = droop;
      droopTime = sample.time;
    }
  }

  averageTarget /= governed.length;
  averageActual /= governed.length;

  const rmsError = Math.sqrt(squaredErrorSum / governed.length);
  const droopPercent = (maximumDroop / averageTarget) * 100;

  const score = Math.max(
    0,
    Math.min(100, Math.round(100 - droopPercent * 12 - rmsError * 0.5))
  );

  const status =
    droopPercent > 3 ? "attention" : droopPercent > 1.2 ? "watch" : "good";

  const story =
    status === "good"
      ? `Excellent hold: average headspeed ${Math.round(averageActual)} rpm against a ${Math.round(averageTarget)} rpm target, worst droop only ${Math.round(maximumDroop)} rpm.`
      : status === "watch"
        ? `Decent hold with visible dips: worst droop ${Math.round(maximumDroop)} rpm (${droopPercent.toFixed(1)}%) at ${droopTime.toFixed(1)} s — zoom the chart there to see it.`
        : `The governor loses ${Math.round(maximumDroop)} rpm (${droopPercent.toFixed(1)}%) under load at ${droopTime.toFixed(1)} s. More governor gain — or more power-system headroom — would tighten this.`;

  return {
    score,
    status,
    story,
    droopRpm: Math.round(maximumDroop * 10) / 10,
    droopPercent: Math.round(droopPercent * 100) / 100,
    droopTimeSeconds: Math.round(droopTime * 100) / 100,
    averageHeadspeed: Math.round(averageActual),
    metrics: [
      { label: "Average headspeed", value: `${Math.round(averageActual)} rpm` },
      { label: "Target", value: `${Math.round(averageTarget)} rpm` },
      { label: "Worst droop", value: `${Math.round(maximumDroop)} rpm (${droopPercent.toFixed(1)}%)` },
      { label: "RMS tracking error", value: `${rmsError.toFixed(1)} rpm` }
    ]
  };
}
