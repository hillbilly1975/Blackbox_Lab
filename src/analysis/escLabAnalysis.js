// ======================================================
// BLACKBOX LAB — ESC LAB ANALYSIS
// ======================================================
//
// Throttle headroom and electrical load: is the power
// system cruising or living at its limit?
//
// ======================================================

function statsOf(values) {
  if (!values || values.length === 0) {
    return null;
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }

  return { min, max, average: sum / values.length };
}

export function analyzeEscLab({ motor, amperage, vbat }) {
  const motorStats = statsOf(motor);

  if (!motorStats) {
    return null;
  }

  // Motor output is typically 1000–2000 style throttle units.
  const fullScale = motorStats.max > 1100 ? 2000 : motorStats.max || 1;
  const headroomPercent = Math.max(
    0,
    ((fullScale - motorStats.average) / fullScale) * 100
  );

  let saturatedSamples = 0;

  for (const value of motor) {
    if (value > fullScale * 0.97) {
      saturatedSamples += 1;
    }
  }

  const saturationPercent = (saturatedSamples / motor.length) * 100;

  // Current is usually logged as amps × 100.
  const ampsScale = amperage && statsOf(amperage).max > 500 ? 100 : 1;
  const ampsStats = amperage
    ? statsOf(amperage.map((value) => value / ampsScale))
    : null;

  const voltsScale = vbat && statsOf(vbat).average > 1000 ? 100 : vbat && statsOf(vbat).average > 100 ? 10 : 1;
  const voltsStats = vbat
    ? statsOf(vbat.map((value) => value / voltsScale))
    : null;

  const peakPower =
    ampsStats && voltsStats
      ? Math.round(ampsStats.max * voltsStats.min)
      : null;

  const status =
    saturationPercent > 2 ? "attention" : headroomPercent < 12 ? "watch" : "good";

  const story =
    status === "good"
      ? `Healthy headroom: throttle averages ${Math.round(motorStats.average)} with ${headroomPercent.toFixed(0)}% in reserve.`
      : status === "watch"
        ? `Working hard: only ${headroomPercent.toFixed(0)}% average throttle reserve. Fine for sport flying, tight for aggressive 3D.`
        : `The ESC hits its ceiling ${saturationPercent.toFixed(1)}% of the time — when it saturates, the governor has nothing left to give. Consider more cells, lower headspeed or different gearing.`;

  const metrics = [
    { label: "Average throttle", value: `${Math.round(motorStats.average)}` },
    { label: "Throttle reserve", value: `${headroomPercent.toFixed(0)}%` },
    { label: "Time at ceiling", value: `${saturationPercent.toFixed(1)}%` }
  ];

  if (ampsStats) {
    metrics.push({
      label: "Current avg / peak",
      value: `${ampsStats.average.toFixed(0)} / ${ampsStats.max.toFixed(0)} A (est.)`
    });
  }

  if (peakPower) {
    metrics.push({ label: "Peak power", value: `~${peakPower} W (est.)` });
  }

  return { status, story, metrics };
}
