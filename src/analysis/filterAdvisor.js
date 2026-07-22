// ======================================================
// BLACKBOX LAB — FILTER ADVISOR
// ======================================================
//
// Rotorflight's superpower is rotor-speed-linked filtering
// (harmonic notches that follow headspeed). This advisor
// closes the loop the spectrum opens:
//
//   1. find the vibration peaks (unfiltered gyro)
//   2. name their mechanical source via rotor harmonics
//   3. MEASURE how much of each peak the current filters
//      remove (unfiltered vs filtered gyro)
//   4. recommend, in plain language, what to change
//
// It never touches settings — it explains and points.
//
// ======================================================

function findPeaks(spectrum, minimumHz = 10, count = 5) {
  const { frequencies, magnitudes } = spectrum;
  const peaks = [];

  for (let i = 2; i < frequencies.length - 2; i += 1) {
    if (
      frequencies[i] >= minimumHz &&
      magnitudes[i] > magnitudes[i - 1] &&
      magnitudes[i] > magnitudes[i + 1] &&
      magnitudes[i] > 1
    ) {
      peaks.push({ hz: frequencies[i], magnitude: magnitudes[i], bin: i });
    }
  }

  peaks.sort((a, b) => b.magnitude - a.magnitude);

  const distinct = [];

  for (const peak of peaks) {
    if (distinct.every((other) => Math.abs(other.hz - peak.hz) > 6)) {
      distinct.push(peak);
    }

    if (distinct.length === count) {
      break;
    }
  }

  return distinct;
}

function classifySource(peakHz, headspeedRpm) {
  if (!headspeedRpm || headspeedRpm < 300) {
    return { source: "unknown (no headspeed logged)", rpmLinked: false };
  }

  const oneRev = headspeedRpm / 60;
  const ratio = peakHz / oneRev;

  if (Math.abs(ratio - 1) < 0.15) {
    return { source: "main rotor 1/rev", rpmLinked: true };
  }

  if (Math.abs(ratio - 2) < 0.2) {
    return { source: "main rotor 2/rev", rpmLinked: true };
  }

  if (Math.abs(ratio - 3) < 0.25) {
    return { source: "main rotor 3/rev", rpmLinked: true };
  }

  if (ratio > 3.5 && ratio < 6.5) {
    return {
      source: `tail region (~${ratio.toFixed(1)}× rotor speed)`,
      rpmLinked: true
    };
  }

  if (ratio >= 6.5) {
    return {
      source: `high frequency (~${ratio.toFixed(1)}× rotor speed) — motor/bearing territory`,
      rpmLinked: ratio < 15
    };
  }

  return { source: "not rotor-linked (electrical or frame resonance)", rpmLinked: false };
}

function magnitudeNear(spectrum, hz) {
  const { frequencies, magnitudes } = spectrum;
  let best = 0;

  for (let i = 0; i < frequencies.length; i += 1) {
    if (Math.abs(frequencies[i] - hz) <= 3 && magnitudes[i] > best) {
      best = magnitudes[i];
    }
  }

  return best;
}

export function adviseFilters({
  unfilteredSpectrum,
  filteredSpectrum,
  headspeedRpm
}) {
  if (!unfilteredSpectrum) {
    return null;
  }

  const peaks = findPeaks(unfilteredSpectrum);

  if (peaks.length === 0) {
    return {
      story:
        "No significant vibration peaks found — this gyro signal is about as clean as they come. Whatever your filters are set to, they are not being challenged.",
      rows: [],
      recommendations: []
    };
  }

  const rows = peaks.map((peak) => {
    const classified = classifySource(peak.hz, headspeedRpm);
    const filteredMagnitude = filteredSpectrum
      ? magnitudeNear(filteredSpectrum, peak.hz)
      : null;

    const reductionPercent =
      filteredMagnitude !== null && peak.magnitude > 0
        ? Math.max(
            0,
            Math.min(100, (1 - filteredMagnitude / peak.magnitude) * 100)
          )
        : null;

    return {
      hz: Math.round(peak.hz * 10) / 10,
      magnitude: Math.round(peak.magnitude * 10) / 10,
      source: classified.source,
      rpmLinked: classified.rpmLinked,
      filteredMagnitude:
        filteredMagnitude !== null
          ? Math.round(filteredMagnitude * 10) / 10
          : null,
      reductionPercent:
        reductionPercent !== null ? Math.round(reductionPercent) : null
    };
  });

  const recommendations = [];
  const biggest = rows[0];

  // ---- mechanics before filters ----
  if (biggest.magnitude > 8) {
    recommendations.push({
      priority: "first",
      text: `Your biggest peak (${biggest.magnitude} at ${biggest.hz} Hz, ${biggest.source}) is strong enough that filtering is the wrong first move — fix the mechanics (balance, damping, bearings), then re-log. Filters hide vibration from the gyro; the airframe still shakes.`
    });
  }

  // ---- rpm-linked peaks → Rotorflight's rpm filter ----
  const rpmLinkedRows = rows.filter(
    (row) => row.rpmLinked && row.magnitude > 2
  );

  if (rpmLinkedRows.length > 0 && headspeedRpm) {
    const list = rpmLinkedRows
      .map((row) => `${row.hz} Hz (${row.source})`)
      .join(", ");

    recommendations.push({
      priority: "filters",
      text: `These peaks follow rotor speed: ${list}. That is exactly what Rotorflight's RPM filter (harmonic notches keyed to headspeed) is for — it tracks the peaks as headspeed changes, where a static notch would need to be wide (and slow) to keep covering them. Check that the RPM filter is enabled and covers these harmonics in the Configurator's filter page.`
    });
  }

  // ---- poorly-attenuated peaks ----
  const leakyRows = rows.filter(
    (row) =>
      row.reductionPercent !== null &&
      row.reductionPercent < 70 &&
      row.magnitude > 3
  );

  if (leakyRows.length > 0) {
    const list = leakyRows
      .map(
        (row) =>
          `${row.hz} Hz (only ${row.reductionPercent}% removed, ${row.magnitude} → ${row.filteredMagnitude})`
      )
      .join("; ");

    recommendations.push({
      priority: "filters",
      text: `Your current filters let a meaningful share of these peaks through to the flight controller: ${list}. If the mechanics are already as good as they get, this is where a targeted notch earns its keep.`
    });
  }

  // ---- possible over-filtering ----
  const allWellAttenuated =
    rows.every(
      (row) =>
        row.reductionPercent === null || row.reductionPercent > 95
    ) && biggest.magnitude < 5;

  if (allWellAttenuated && filteredSpectrum) {
    recommendations.push({
      priority: "gentle",
      text: "Everything is filtered to near-zero and the raw signal is already quiet — you may be paying latency for filtering you don't need. Cautiously raising the gyro lowpass cutoff could sharpen response. One step at a time, and compare flights afterwards."
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      priority: "gentle",
      text: "Peaks are modest and the filters handle them — no changes suggested. Keep this log as your baseline for future comparisons."
    });
  }

  const story = filteredSpectrum
    ? `Found ${rows.length} vibration peak(s). The table shows each one's likely source and how much of it your current filters actually remove — measured from this very flight.`
    : `Found ${rows.length} vibration peak(s) in the unfiltered gyro. This log doesn't include the filtered gyro trace, so filter effectiveness can't be measured — the sources and sizes below still tell the mechanical story.`;

  return { story, rows, recommendations };
}
