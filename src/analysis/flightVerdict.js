// ======================================================
// BLACKBOX LAB — FLIGHT VERDICT
// ======================================================
//
// The plain-language layer: turns numbers into the story
// a pilot needs first. Every verdict card carries:
//
//   status   "good" | "watch" | "attention"
//   headline one short sentence, no jargon
//   detail   one more sentence of why
//   screen   which Lab shows the evidence
//
// Simple first. Deeper when you want it.
//
// ======================================================

function averageOf(values) {
  if (!values || values.length === 0) {
    return null;
  }

  let sum = 0;

  for (const value of values) {
    sum += value;
  }

  return sum / values.length;
}

// ------------------------------------------------------
// Vibration verdict — from the noise spectrum peaks
// ------------------------------------------------------
function vibrationVerdict(spectra, headspeedRpm) {
  if (!spectra || spectra.length === 0) {
    return null;
  }

  // Strongest peak above 10 Hz across all gyro axes.
  let peakHz = 0;
  let peakMagnitude = 0;

  for (const { spectrum } of spectra) {
    for (let i = 0; i < spectrum.frequencies.length; i += 1) {
      if (
        spectrum.frequencies[i] > 10 &&
        spectrum.magnitudes[i] > peakMagnitude
      ) {
        peakMagnitude = spectrum.magnitudes[i];
        peakHz = spectrum.frequencies[i];
      }
    }
  }

  if (peakMagnitude === 0) {
    return null;
  }

  // Name the peak if it matches a rotor frequency.
  let source = "an unidentified source";

  if (headspeedRpm && headspeedRpm > 300) {
    const oneRev = headspeedRpm / 60;
    const ratio = peakHz / oneRev;

    if (Math.abs(ratio - 1) < 0.15) {
      source = "the MAIN ROTOR turning once per revolution — usually blade balance or head damping";
    } else if (Math.abs(ratio - 2) < 0.2) {
      source = "twice-per-revolution of the main rotor — often blade tracking or head play";
    } else if (ratio > 3.5 && ratio < 6.5) {
      source = "the TAIL rotor region — check tail blades, belt/shaft and bearings";
    } else if (ratio > 6.5) {
      source = "a high-frequency source — motor, pinion or bearing territory";
    }
  }

  const magnitudeLabel = peakMagnitude.toFixed(1);
  const hzLabel = peakHz.toFixed(0);

  if (peakMagnitude > 8) {
    return {
      key: "vibration",
      title: "Vibration",
      status: "attention",
      headline: `Strong vibration at ${hzLabel} Hz`,
      detail: `The biggest shake (amplitude ${magnitudeLabel}) comes from ${source}.`,
      action: "Fix the mechanics before touching filters: balance the blades, check head damping and bearings. Filters hide vibration — they don't cure it.",
      screen: "filter",
      evidence: "Noise Spectrum chart, Filter Lab"
    };
  }

  if (peakMagnitude > 3) {
    return {
      key: "vibration",
      title: "Vibration",
      status: "watch",
      headline: `Moderate vibration at ${hzLabel} Hz`,
      detail: `Noticeable but not alarming (amplitude ${magnitudeLabel}); it comes from ${source}.`,
      action: "Worth a look at blade balance next time you're at the bench; no urgency.",
      screen: "filter",
      evidence: "Noise Spectrum chart, Filter Lab"
    };
  }

  return {
    key: "vibration",
    title: "Vibration",
    status: "good",
    headline: "Vibration levels look healthy",
    detail: `Largest peak only ${magnitudeLabel} at ${hzLabel} Hz — a clean, well-balanced machine.`,
    action: "Nothing to do — keep it this way.",
    screen: "filter",
    evidence: "Noise Spectrum chart, Filter Lab"
  };
}

// ------------------------------------------------------
// Rotor speed verdict — how well headspeed held
// ------------------------------------------------------
function rotorSpeedVerdict(headspeed, governorTarget) {
  if (!headspeed || headspeed.length < 100) {
    return null;
  }

  // Judge only the governed part of the flight (target
  // reached), so spool-up doesn't count against it.
  const pairs = [];

  for (let i = 0; i < headspeed.length; i += 1) {
    const target = governorTarget ? governorTarget[i] : null;

    if (target && target > 300 && headspeed[i] > target * 0.85) {
      pairs.push([headspeed[i], target]);
    }
  }

  if (pairs.length < 100) {
    return null;
  }

  let maximumDroop = 0;
  let errorSum = 0;

  for (const [actual, target] of pairs) {
    const droop = target - actual;
    errorSum += Math.abs(droop);

    if (droop > maximumDroop) {
      maximumDroop = droop;
    }
  }

  const averageTarget = averageOf(pairs.map((pair) => pair[1]));
  const droopPercent = (maximumDroop / averageTarget) * 100;

  if (droopPercent > 3) {
    return {
      key: "rotor",
      title: "Rotor Speed",
      status: "attention",
      headline: `Headspeed sags up to ${Math.round(maximumDroop)} rpm under load`,
      detail: `That is ${droopPercent.toFixed(1)}% below target — the governor needs more gain or the power system more headroom.`,
      action: "In Rotorflight Configurator, raise governor gain in small steps — or check the ESC Lab for missing power headroom.",
      screen: "governor",
      evidence: "Headspeed vs Target chart, Governor Lab"
    };
  }

  if (droopPercent > 1.2) {
    return {
      key: "rotor",
      title: "Rotor Speed",
      status: "watch",
      headline: `Headspeed dips ${Math.round(maximumDroop)} rpm on collective`,
      detail: `${droopPercent.toFixed(1)}% droop is flyable; a touch more governor gain could tighten it.`,
      action: "Optional: a small governor gain increase next session.",
      screen: "governor",
      evidence: "Headspeed vs Target chart, Governor Lab"
    };
  }

  return {
    key: "rotor",
    title: "Rotor Speed",
    status: "good",
    headline: "Rock-solid headspeed",
    detail: `Worst droop only ${Math.round(maximumDroop)} rpm (${droopPercent.toFixed(1)}%) — the governor is doing its job.`,
    action: "Nothing to do — this is what good looks like.",
    screen: "governor",
    evidence: "Headspeed vs Target chart, Governor Lab"
  };
}

// ------------------------------------------------------
// Tuning verdict — from the PID Lab score
// ------------------------------------------------------
function tuningVerdict(pidAnalysis) {
  const score = pidAnalysis?.score;

  if (!Number.isFinite(score)) {
    return null;
  }

  if (score < 50) {
    return {
      key: "tuning",
      title: "Tuning",
      status: "attention",
      headline: `Tracking score ${score}/100 — room to improve`,
      detail: "The helicopter lags or overshoots what the sticks ask for. The PID Lab lists the events behind this number.",
      action: "Open the PID Lab and work through its recommendations one change at a time.",
      screen: "pid",
      evidence: "PID Lab findings"
    };
  }

  if (score < 75) {
    return {
      key: "tuning",
      title: "Tuning",
      status: "watch",
      headline: `Tracking score ${score}/100 — decent, not crisp`,
      detail: "Response mostly follows the sticks; the PID Lab shows where it loosens.",
      action: "If you want it sharper, the PID Lab shows where to look.",
      screen: "pid",
      evidence: "PID Lab findings"
    };
  }

  return {
    key: "tuning",
    title: "Tuning",
    status: "good",
    headline: `Tracking score ${score}/100 — crisp response`,
    detail: "The machine follows the sticks faithfully.",
    action: "Nothing to do — enjoy it.",
    screen: "pid",
    evidence: "PID Lab findings"
  };
}

// ------------------------------------------------------
// Battery verdict — voltage sag over the flight
// ------------------------------------------------------
function batteryVerdict(vbat) {
  if (!vbat || vbat.length < 100) {
    return null;
  }

  // vbatLatest is typically volts × 100.
  const start = averageOf(vbat.slice(0, 50)) / 100;
  const end = averageOf(vbat.slice(-50)) / 100;

  if (!start || start < 5) {
    return null;
  }

  const sagPercent = ((start - end) / start) * 100;

  if (sagPercent > 12) {
    return {
      key: "battery",
      title: "Battery",
      status: "attention",
      headline: `Voltage fell ${sagPercent.toFixed(0)}% during the flight`,
      detail: `${start.toFixed(1)} V → ${end.toFixed(1)} V — an aging pack or a flight flown long/hard.`,
      action: "Land earlier, or move this pack to gentler duty. The Battery Lab has the details.",
      screen: "viewer",
      evidence: "Motor & Power chart, Log Viewer"
    };
  }

  return {
    key: "battery",
    title: "Battery",
    status: "good",
    headline: "Battery held up well",
    detail: `${start.toFixed(1)} V → ${end.toFixed(1)} V over the flight.`,
    action: "Nothing to do.",
    screen: "viewer",
    evidence: "Motor & Power chart, Log Viewer"
  };
}

// ------------------------------------------------------
// buildFlightVerdict — the one call the renderer makes
// ------------------------------------------------------
export function buildFlightVerdict({
  spectra,
  headspeed,
  governorTarget,
  vbat,
  pidAnalysis
}) {
  const governedHeadspeed = headspeed
    ? averageOf(headspeed.slice(-Math.floor(headspeed.length / 3)))
    : null;

  const cards = [
    vibrationVerdict(spectra, governedHeadspeed),
    rotorSpeedVerdict(headspeed, governorTarget),
    tuningVerdict(pidAnalysis),
    batteryVerdict(vbat)
  ].filter(Boolean);

  const worst = cards.some((card) => card.status === "attention")
    ? "attention"
    : cards.some((card) => card.status === "watch")
      ? "watch"
      : "good";

  const summary =
    worst === "good"
      ? "This flight looks healthy. Explore the Labs to see the details."
      : worst === "watch"
        ? "Mostly healthy, with a few things worth keeping an eye on."
        : "This flight found something that deserves your attention.";

  return { cards, worst, summary };
}
