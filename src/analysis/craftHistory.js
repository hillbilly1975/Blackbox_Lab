// ======================================================
// BLACKBOX LAB — CRAFT HEALTH RECORD
// ======================================================
//
// Every analyzed flight is filed under its craft (the
// name lives in the log header). Across flights, trends
// appear that no single log can show — a bearing wearing
// out, a pack aging, a tune drifting. The storage backend
// is injected so tests can use a plain Map and the app
// can use localStorage. Everything stays on the pilot's
// computer; nothing is ever uploaded.
//
// ======================================================

const STORAGE_KEY = "blackboxLabCraftHistory";
const MAXIMUM_FLIGHTS_PER_CRAFT = 200;

export function loadHistory(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHistory(storage, history) {
  storage.setItem(STORAGE_KEY, JSON.stringify(history));
}

export function buildHistoryEntry({
  fileName,
  flightDateMs,
  durationSeconds,
  dataset
}) {
  const peak = (() => {
    if (!dataset.spectra || dataset.spectra.length === 0) {
      return null;
    }

    let hz = 0;
    let magnitude = 0;

    for (const { spectrum } of dataset.spectra) {
      for (let i = 0; i < spectrum.frequencies.length; i += 1) {
        if (
          spectrum.frequencies[i] > 10 &&
          spectrum.magnitudes[i] > magnitude
        ) {
          magnitude = spectrum.magnitudes[i];
          hz = spectrum.frequencies[i];
        }
      }
    }

    return magnitude > 0 ? { hz, magnitude } : null;
  })();

  return {
    fileName,
    flightDateMs,
    durationSeconds:
      Math.round((durationSeconds ?? 0) * 10) / 10,
    vibrationPeak: peak ? Math.round(peak.magnitude * 10) / 10 : null,
    vibrationHz: peak ? Math.round(peak.hz * 10) / 10 : null,
    droopRpm: dataset.labs?.governor?.droopRpm ?? null,
    trackingScore: dataset.pidScore ?? null,
    batterySagPercent: dataset.batterySagPercent ?? null,
    internalResistance: dataset.labs?.battery?.internalResistance ?? null
  };
}

export function recordFlight(storage, craftName, entry) {
  const history = loadHistory(storage);
  const craftKey = (craftName || "Unknown craft").trim() || "Unknown craft";

  if (!history[craftKey]) {
    history[craftKey] = [];
  }

  // The same log analyzed twice stays one entry.
  const duplicate = history[craftKey].find(
    (existing) =>
      existing.fileName === entry.fileName &&
      existing.durationSeconds === entry.durationSeconds
  );

  if (duplicate) {
    Object.assign(duplicate, entry);
  } else {
    history[craftKey].push(entry);
    history[craftKey].sort((a, b) => a.flightDateMs - b.flightDateMs);

    if (history[craftKey].length > MAXIMUM_FLIGHTS_PER_CRAFT) {
      history[craftKey] = history[craftKey].slice(
        -MAXIMUM_FLIGHTS_PER_CRAFT
      );
    }
  }

  saveHistory(storage, history);
  return craftKey;
}

export function clearHistory(storage) {
  storage.removeItem(STORAGE_KEY);
}

// ------------------------------------------------------
// Trend assessment — the sentences that make this a
// health record instead of a diary.
// ------------------------------------------------------

function averageOf(values) {
  const usable = values.filter((value) => Number.isFinite(value));

  if (usable.length === 0) {
    return null;
  }

  let sum = 0;

  for (const value of usable) {
    sum += value;
  }

  return sum / usable.length;
}

function assessMetric(entries, key, { label, lowerIsBetter, unit, adviceUp }) {
  const values = entries.map((entry) => entry[key]);
  const usable = values.filter((value) => Number.isFinite(value));

  if (usable.length < 4) {
    return null;
  }

  const half = Math.floor(usable.length / 2);
  const earlier = averageOf(usable.slice(0, half));
  const recent = averageOf(usable.slice(-Math.min(3, half)));

  if (earlier === null || recent === null || earlier === 0) {
    return null;
  }

  const ratio = recent / earlier;
  const gettingWorse = lowerIsBetter ? ratio > 1.4 : ratio < 0.7;
  const changePercent = Math.abs((ratio - 1) * 100).toFixed(0);

  if (!gettingWorse) {
    return null;
  }

  return {
    status: "attention",
    sentence: `${label} has ${lowerIsBetter ? "risen" : "fallen"} ~${changePercent}% across your last flights (${earlier.toFixed(1)} → ${recent.toFixed(1)}${unit}). ${adviceUp}`
  };
}

export function assessTrends(entries) {
  if (!entries || entries.length < 4) {
    return {
      findings: [],
      note:
        entries && entries.length > 0
          ? `Keep flying — trends appear after 4 logged flights (${entries.length} so far).`
          : "No flights recorded for this craft yet."
    };
  }

  const findings = [
    assessMetric(entries, "vibrationPeak", {
      label: "Vibration",
      lowerIsBetter: true,
      unit: "",
      adviceUp:
        "Something mechanical is changing — check bearings, blade balance and links before it grows."
    }),
    assessMetric(entries, "droopRpm", {
      label: "Governor droop",
      lowerIsBetter: true,
      unit: " rpm",
      adviceUp:
        "The power system is losing headroom — aging pack, dirty pinion or slipping gear are the usual suspects."
    }),
    assessMetric(entries, "internalResistance", {
      label: "Pack internal resistance",
      lowerIsBetter: true,
      unit: " mΩ",
      adviceUp: "The battery is aging — expect softer punch and more sag."
    }),
    assessMetric(entries, "trackingScore", {
      label: "Tracking score",
      lowerIsBetter: false,
      unit: "",
      adviceUp:
        "The tune is drifting — mechanics wearing in, or settings changed along the way."
    })
  ].filter(Boolean);

  return {
    findings,
    note:
      findings.length === 0
        ? `All trends stable across ${entries.length} flights. That's a healthy machine.`
        : `${findings.length} trend(s) deserve a look.`
  };
}
