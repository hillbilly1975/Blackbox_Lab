// ======================================================
// BLACKBOX LAB — BATTERY LAB ANALYSIS
// ======================================================
//
// Pack health from the flight itself: sag, estimated
// internal resistance (voltage dip vs current step),
// consumed capacity and per-cell numbers.
//
// All electrical units are ESTIMATES — logs store raw
// values whose scaling differs between setups. The Lab
// says so honestly.
//
// ======================================================

function averageOf(values) {
  let sum = 0;

  for (const value of values) {
    sum += value;
  }

  return values.length ? sum / values.length : null;
}

export function analyzeBatteryLab({ timeSeconds, vbat, amperage }) {
  if (!vbat || vbat.length < 200) {
    return null;
  }

  const rawAverage = averageOf(vbat);
  const voltsScale = rawAverage > 1000 ? 100 : rawAverage > 100 ? 10 : 1;
  const volts = vbat.map((value) => value / voltsScale);

  const startVolts = averageOf(volts.slice(0, 100));
  const endVolts = averageOf(volts.slice(-100));

  let minVolts = Infinity;

  for (const value of volts) {
    if (value < minVolts) {
      minVolts = value;
    }
  }

  // Cell count: assume a full cell is ≤ 4.35 V.
  const cellCount = Math.max(1, Math.round(startVolts / 4.1));
  const sagPercent = ((startVolts - endVolts) / startVolts) * 100;

  let maxAmperage = 0;

  if (amperage) {
    for (const value of amperage) {
      if (value > maxAmperage) {
        maxAmperage = value;
      }
    }
  }

  const ampsScale = maxAmperage > 500 ? 100 : 1;
  const amps = amperage
    ? amperage.map((value) => value / ampsScale)
    : null;

  // ---- consumed capacity: integrate current over time ----
  let consumedMah = null;

  if (amps && timeSeconds && timeSeconds.length === amps.length) {
    let ampSeconds = 0;

    for (let i = 1; i < amps.length; i += 1) {
      const dt = timeSeconds[i] - timeSeconds[i - 1];

      if (dt > 0 && dt < 1) {
        ampSeconds += amps[i] * dt;
      }
    }

    consumedMah = Math.round((ampSeconds / 3600) * 1000);
  }

  // ---- internal resistance: correlate ΔV with ΔI ----
  let internalResistancePerCell = null;

  if (amps && amps.length === volts.length) {
    let best = null;

    for (let i = 50; i < amps.length; i += 1) {
      const deltaAmps = amps[i] - amps[i - 50];

      if (deltaAmps > 15) {
        const deltaVolts = volts[i - 50] - volts[i];

        if (deltaVolts > 0) {
          const resistance = deltaVolts / deltaAmps; // ohms, whole pack
          if (best === null || resistance < best) {
            best = resistance;
          }
        }
      }
    }

    if (best !== null) {
      internalResistancePerCell = (best / cellCount) * 1000; // mΩ
    }
  }

  const endPerCell = endVolts / cellCount;

  const status =
    endPerCell < 3.5 || sagPercent > 12
      ? "attention"
      : endPerCell < 3.7 || sagPercent > 8
        ? "watch"
        : "good";

  const story =
    status === "good"
      ? `The pack held up well: ${startVolts.toFixed(1)} V → ${endVolts.toFixed(1)} V (${(endPerCell).toFixed(2)} V per cell at landing).`
      : status === "watch"
        ? `Worked but tired: landed at ${endPerCell.toFixed(2)} V per cell. Shorter flights or a fresher pack would be kinder.`
        : `This pack is struggling: ${sagPercent.toFixed(0)}% sag and ${endPerCell.toFixed(2)} V per cell at landing. Retire it from hard flights.`;

  const metrics = [
    { label: "Pack (detected)", value: `${cellCount}S (est.)` },
    { label: "Start → end", value: `${startVolts.toFixed(1)} → ${endVolts.toFixed(1)} V (est.)` },
    { label: "Lowest voltage", value: `${minVolts.toFixed(1)} V (${(minVolts / cellCount).toFixed(2)} V/cell)` }
  ];

  if (consumedMah) {
    metrics.push({ label: "Consumed", value: `~${consumedMah} mAh (est.)` });
  }

  if (internalResistancePerCell) {
    metrics.push({
      label: "Internal resistance",
      value: `~${internalResistancePerCell.toFixed(1)} mΩ/cell (est.)`
    });
  }

  return {
    status,
    story,
    metrics,
    sagPercent: Math.round(sagPercent * 100) / 100,
    internalResistance: internalResistancePerCell
      ? Math.round(internalResistancePerCell * 10) / 10
      : null,
    endVoltsPerCell: Math.round(endPerCell * 100) / 100
  };
}
