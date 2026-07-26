// ======================================================
// BLACKBOX LAB — BATTERY LAB ANALYSIS
// ======================================================
//
// Charts may show the complete recording.
//
// Battery conclusions use only stable governed-flight
// samples. Spool-up, spool-down, ground operation and
// headspeed-profile transitions are excluded.
//
// Electrical values remain estimates because telemetry
// scaling and calibration vary between installations.
//
// ======================================================

import {
  detectStableFlightPhase
} from "./flightPhase.js";

function averageOf(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  let sum = 0;

  for (const value of values) {
    sum += value;
  }

  return sum / values.length;
}

function minimumOf(values) {
  let minimum = Infinity;

  for (const value of values) {
    if (Number.isFinite(value) && value < minimum) {
      minimum = value;
    }
  }

  return Number.isFinite(minimum) ? minimum : null;
}

export function analyzeBatteryLab({
  timeSeconds,
  vbat,
  amperage,
  headspeed,
  governorTarget
}) {
  if (
    !Array.isArray(vbat) ||
    vbat.length < 200
  ) {
    return null;
  }

  const sampleCount = Math.min(
    timeSeconds?.length ?? 0,
    vbat.length,
    headspeed?.length ?? 0,
    governorTarget?.length ?? 0
  );

  if (sampleCount < 200) {
    return null;
  }

  const alignedTime =
    timeSeconds.slice(0, sampleCount);

  const alignedVbat =
    vbat.slice(0, sampleCount);

  const alignedAmperage =
    Array.isArray(amperage)
      ? amperage.slice(0, sampleCount)
      : null;

  const alignedHeadspeed =
    headspeed.slice(0, sampleCount);

  const alignedTarget =
    governorTarget.slice(0, sampleCount);

  const rawAverage = averageOf(alignedVbat);

  const voltsScale =
    rawAverage > 1000
      ? 100
      : rawAverage > 100
        ? 10
        : 1;

  const volts = alignedVbat.map(
    (value) => Number(value) / voltsScale
  );

  let maxRawAmperage = 0;

  if (alignedAmperage) {
    for (const value of alignedAmperage) {
      const numericValue = Number(value);

      if (
        Number.isFinite(numericValue) &&
        numericValue > maxRawAmperage
      ) {
        maxRawAmperage = numericValue;
      }
    }
  }

  const ampsScale =
    maxRawAmperage > 500 ? 100 : 1;

  const amps = alignedAmperage
    ? alignedAmperage.map(
        (value) => Number(value) / ampsScale
      )
    : null;

  const flightPhase = detectStableFlightPhase({
    timeSeconds: alignedTime,
    headspeed: alignedHeadspeed,
    governorTarget: alignedTarget
  });

  const stableIndexes =
    flightPhase.stableIndexes ?? [];

  if (stableIndexes.length < 100) {
    return {
      status: "insufficient",
      story:
        "No stable governed-flight section was long enough for a reliable battery assessment.",
      metrics: [
        {
          label: "Stable samples",
          value: String(stableIndexes.length)
        },
        {
          label: "Battery result",
          value: "Insufficient stable-flight data"
        }
      ],
      sagPercent: null,
      internalResistance: null,
      endVoltsPerCell: null,
      stableSampleCount: stableIndexes.length
    };
  }

  const stableVolts = stableIndexes
    .map((index) => volts[index])
    .filter(Number.isFinite);

  const firstStableIndexes =
    stableIndexes.slice(
      0,
      Math.min(1000, stableIndexes.length)
    );

  const lastStableIndexes =
    stableIndexes.slice(
      Math.max(0, stableIndexes.length - 1000)
    );

  const startVolts = averageOf(
    firstStableIndexes
      .map((index) => volts[index])
      .filter(Number.isFinite)
  );

  const endVolts = averageOf(
    lastStableIndexes
      .map((index) => volts[index])
      .filter(Number.isFinite)
  );

  const minVolts = minimumOf(stableVolts);

  if (
    !Number.isFinite(startVolts) ||
    !Number.isFinite(endVolts) ||
    !Number.isFinite(minVolts)
  ) {
    return null;
  }

  // Cell count estimate based on the beginning of the
  // valid governed-flight window.
  const cellCount = Math.max(
    1,
    Math.round(startVolts / 4.1)
  );

  const endPerCell =
    endVolts / cellCount;

  const minimumPerCell =
    minVolts / cellCount;

  const flightVoltageDropPercent =
    ((startVolts - endVolts) / startVolts) * 100;

  // ---- consumed capacity during stable flight only ----
  let consumedMah = null;

  if (
    amps &&
    amps.length === alignedTime.length
  ) {
    let ampSeconds = 0;

    for (
      let stablePosition = 1;
      stablePosition < stableIndexes.length;
      stablePosition += 1
    ) {
      const previousIndex =
        stableIndexes[stablePosition - 1];

      const currentIndex =
        stableIndexes[stablePosition];

      // Do not integrate across gaps between separate
      // stable-flight segments.
      if (currentIndex !== previousIndex + 1) {
        continue;
      }

      const dt =
        alignedTime[currentIndex] -
        alignedTime[previousIndex];

      const currentAmps =
        Number(amps[currentIndex]);

      const previousAmps =
        Number(amps[previousIndex]);

      if (
        Number.isFinite(dt) &&
        dt > 0 &&
        dt < 1 &&
        Number.isFinite(currentAmps) &&
        Number.isFinite(previousAmps)
      ) {
        const averageAmps =
          (currentAmps + previousAmps) / 2;

        ampSeconds += averageAmps * dt;
      }
    }

    consumedMah = Math.round(
      (ampSeconds / 3600) * 1000
    );
  }

  // ---- estimated internal resistance ----
  //
  // Only evaluate current steps that occur fully inside
  // stable flight. This avoids startup and transition sag.
  let internalResistancePerCell = null;

  if (
    amps &&
    amps.length === volts.length
  ) {
    const stableSet =
      new Set(stableIndexes);

    let best = null;

    for (
      let index = 50;
      index < amps.length;
      index += 1
    ) {
      if (
        !stableSet.has(index) ||
        !stableSet.has(index - 50)
      ) {
        continue;
      }

      const deltaAmps =
        amps[index] - amps[index - 50];

      if (deltaAmps > 15) {
        const deltaVolts =
          volts[index - 50] - volts[index];

        if (deltaVolts > 0) {
          const packResistance =
            deltaVolts / deltaAmps;

          if (
            best === null ||
            packResistance < best
          ) {
            best = packResistance;
          }
        }
      }
    }

    if (best !== null) {
      internalResistancePerCell =
        (best / cellCount) * 1000;
    }
  }

  // Do not diagnose pack age or condition from ordinary
  // discharge alone. A brief loaded dip is evidence to
  // review, not proof that a pack is tired.
  const status =
    minimumPerCell < 3.45
      ? "attention"
      : minimumPerCell < 3.6
        ? "watch"
        : "good";

  const story =
    status === "good"
      ? `Pack voltage remained within the normal reviewed range during stable flight. It began the analyzed window near ${startVolts.toFixed(
          1
        )} V and ended near ${endVolts.toFixed(
          1
        )} V. Lowest stable-flight voltage was ${minVolts.toFixed(
          1
        )} V (${minimumPerCell.toFixed(
          2
        )} V per cell). No clear evidence of a weak or tired pack.`
      : status === "watch"
        ? `The lowest stable-flight voltage was ${minVolts.toFixed(
            1
          )} V (${minimumPerCell.toFixed(
            2
          )} V per cell). Review the matching current and throttle event, but this dip alone does not prove the pack is tired.`
        : `Stable-flight voltage reached ${minVolts.toFixed(
            1
          )} V (${minimumPerCell.toFixed(
            2
          )} V per cell). Review pack condition, connectors and load before another hard flight.`;

  const metrics = [
    {
      label: "Pack (detected)",
      value: `${cellCount}S (est.)`
    },
    {
      label: "Stable-flight start → end",
      value: `${startVolts.toFixed(
        1
      )} → ${endVolts.toFixed(1)} V (est.)`
    },
    {
      label: "Lowest stable-flight voltage",
      value: `${minVolts.toFixed(
        1
      )} V (${minimumPerCell.toFixed(
        2
      )} V/cell)`
    },
    {
      label: "Stable samples used",
      value: stableIndexes.length.toLocaleString()
    }
  ];

  if (
    Number.isFinite(consumedMah) &&
    consumedMah > 0
  ) {
    metrics.push({
      label: "Stable-flight consumption",
      value: `~${consumedMah} mAh (est.)`
    });
  }

  if (
    Number.isFinite(internalResistancePerCell)
  ) {
    metrics.push({
      label: "Internal resistance",
      value: `~${internalResistancePerCell.toFixed(
        1
      )} mΩ/cell (est.)`
    });
  }

  return {
    status,
    story,
    metrics,

    sagPercent:
      Math.round(
        flightVoltageDropPercent * 100
      ) / 100,

    internalResistance:
      Number.isFinite(
        internalResistancePerCell
      )
        ? Math.round(
            internalResistancePerCell * 10
          ) / 10
        : null,

    endVoltsPerCell:
      Math.round(endPerCell * 100) / 100,

    minimumVoltsPerCell:
      Math.round(
        minimumPerCell * 100
      ) / 100,

    stableSampleCount:
      stableIndexes.length
  };
}