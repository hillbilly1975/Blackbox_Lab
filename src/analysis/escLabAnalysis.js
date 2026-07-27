// ======================================================
// BLACKBOX LAB — ESC LAB ANALYSIS
// ======================================================
//
// Charts may show the complete recording.
//
// ESC conclusions use only stable governed-flight
// samples. Spool-up, spool-down, ground operation and
// headspeed-profile transitions are excluded.
//
// ======================================================

import {
  detectStableFlightPhase
} from "./flightPhase.js";

function statsOf(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  let minimum = Infinity;
  let maximum = -Infinity;
  let sum = 0;
  let count = 0;

  for (const value of values) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      continue;
    }

    if (numericValue < minimum) {
      minimum = numericValue;
    }

    if (numericValue > maximum) {
      maximum = numericValue;
    }

    sum += numericValue;
    count += 1;
  }

  if (count === 0) {
    return null;
  }

  return {
    min: minimum,
    max: maximum,
    average: sum / count,
    count
  };
}
function hasUsablePositiveData(values) {
  if (!Array.isArray(values) || values.length < 200) {
    return false;
  }

  let usableCount = 0;

  for (const value of values) {
    const numericValue = Number(value);

    if (Number.isFinite(numericValue) && numericValue > 0) {
      usableCount += 1;

      if (usableCount >= 20) {
        return true;
      }
    }
  }

  return false;
}
export function analyzeEscLab({
  timeSeconds,
  motor,
  escThrottle,
  amperage,
  escCurrent,
  vbat,
  escVoltage,
  headspeed,
  governorTarget
}) {
    const selectedAmperage =
    hasUsablePositiveData(escCurrent)
      ? escCurrent
      : amperage;

  const selectedVoltage =
    hasUsablePositiveData(escVoltage)
      ? escVoltage
      : vbat;

  const selectedOutput =
    hasUsablePositiveData(escThrottle)
      ? escThrottle
      : motor;

  const sampleCount = Math.min(
    timeSeconds?.length ?? 0,
    selectedOutput?.length ?? 0,
    headspeed?.length ?? 0,
    governorTarget?.length ?? 0
  );

  if (sampleCount < 200) {
    return null;
  }

  const alignedTime =
    timeSeconds.slice(0, sampleCount);

  const alignedMotor =
  selectedOutput.slice(0, sampleCount);
  const alignedHeadspeed =
    headspeed.slice(0, sampleCount);

  const alignedTarget =
    governorTarget.slice(0, sampleCount);

  const alignedAmperage =
    Array.isArray(selectedAmperage)
       ? selectedAmperage.slice(0, sampleCount)
      : null;

  const alignedVbat =
    Array.isArray(selectedVoltage)
       ? selectedVoltage.slice(0, sampleCount)
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
        "No stable governed-flight section was long enough for a reliable ESC assessment.",
      metrics: [
        {
          label: "Stable samples",
          value: String(stableIndexes.length)
        },
        {
          label: "ESC result",
          value: "Insufficient stable-flight data"
        }
      ],
      stableSampleCount: stableIndexes.length
    };
  }

  const stableMotor = stableIndexes
    .map((index) => alignedMotor[index])
    .filter((value) =>
      Number.isFinite(Number(value))
    )
    .map(Number);

  const motorStats = statsOf(stableMotor);

  if (!motorStats) {
    return null;
  }

  // Rotorflight motor output is normally 0–1000.
  // Some imported logs may already be normalized to 0–100.
  // Classic 1000–2000 output is also supported.
  const fullScale =
    motorStats.max > 1100
      ? 2000
      : motorStats.max > 100
        ? 1000
        : 100;

  const averagePercent =
    (motorStats.average / fullScale) * 100;

  const headroomPercent = Math.max(
    0,
    100 - averagePercent
  );

  let saturatedSamples = 0;

  for (const value of stableMotor) {
    if (value >= fullScale * 0.97) {
      saturatedSamples += 1;
    }
  }

  const saturationPercent =
    (saturatedSamples / stableMotor.length) * 100;

  let ampsStats = null;

  if (alignedAmperage) {
    const stableRawAmps = stableIndexes
      .map((index) => alignedAmperage[index])
      .filter((value) =>
        Number.isFinite(Number(value))
      )
      .map(Number);

    const rawAmpsStats =
      statsOf(stableRawAmps);

    const ampsScale =
      rawAmpsStats && rawAmpsStats.max > 500
        ? 100
        : 1;

    ampsStats = rawAmpsStats
      ? statsOf(
          stableRawAmps.map(
            (value) => value / ampsScale
          )
        )
      : null;
  }

  let voltsStats = null;

  if (alignedVbat) {
    const stableRawVolts = stableIndexes
      .map((index) => alignedVbat[index])
      .filter((value) =>
        Number.isFinite(Number(value))
      )
      .map(Number);

    const rawVoltsStats =
      statsOf(stableRawVolts);

    const voltsScale =
      rawVoltsStats &&
      rawVoltsStats.average > 1000
        ? 100
        : rawVoltsStats &&
            rawVoltsStats.average > 100
          ? 10
          : 1;

    voltsStats = rawVoltsStats
      ? statsOf(
          stableRawVolts.map(
            (value) => value / voltsScale
          )
        )
      : null;
  }

  let peakPower = null;

  if (alignedAmperage && alignedVbat) {
    const rawAmpsStats = statsOf(
      alignedAmperage
        .filter((value) =>
          Number.isFinite(Number(value))
        )
        .map(Number)
    );

    const rawVoltsStats = statsOf(
      alignedVbat
        .filter((value) =>
          Number.isFinite(Number(value))
        )
        .map(Number)
    );

    const ampsScale =
      rawAmpsStats && rawAmpsStats.max > 500
        ? 100
        : 1;

    const voltsScale =
      rawVoltsStats &&
      rawVoltsStats.average > 1000
        ? 100
        : rawVoltsStats &&
            rawVoltsStats.average > 100
          ? 10
          : 1;

    let maximumPower = 0;

    for (const index of stableIndexes) {
      const amps =
        Number(alignedAmperage[index]) /
        ampsScale;

      const volts =
        Number(alignedVbat[index]) /
        voltsScale;

      if (
        Number.isFinite(amps) &&
        Number.isFinite(volts)
      ) {
        const power = amps * volts;

        if (power > maximumPower) {
          maximumPower = power;
        }
      }
    }

    if (maximumPower > 0) {
      peakPower = Math.round(maximumPower);
    }
  }

  const status =
    saturationPercent > 2
      ? "attention"
      : headroomPercent < 12
        ? "watch"
        : "good";

  const story =
    status === "good"
      ? `Healthy stable-flight headroom: motor output averages ${averagePercent.toFixed(
          1
        )}% with ${headroomPercent.toFixed(
          1
        )}% average reserve.`
      : status === "watch"
        ? `Stable-flight motor output averages ${averagePercent.toFixed(
            1
          )}%, leaving ${headroomPercent.toFixed(
            1
          )}% average reserve. Review the highest-load events before changing gearing or headspeed.`
        : `ESC-reported throttle remained at or above 97% for ${saturationPercent.toFixed(
            1
          )}% of stable flight. The governor had little remaining output authority during those periods.`;

  const metrics = [
    {
      label: "ESC-reported stable-flight throttle",
      value: `${averagePercent.toFixed(1)}%`
    },
    {
      label: "Average output reserve",
      value: `${headroomPercent.toFixed(1)}%`
    },
    {
      label: "Stable time near ceiling",
      value: `${saturationPercent.toFixed(1)}%`
    },
    {
      label: "Stable samples used",
      value:
        stableIndexes.length.toLocaleString()
    }
  ];

  if (ampsStats) {
    metrics.push({
      label: "Stable current avg / peak",
      value: `${ampsStats.average.toFixed(
        1
      )} / ${ampsStats.max.toFixed(
        1
      )} A (est.)`
    });
  }

  if (Number.isFinite(peakPower)) {
    metrics.push({
      label: "Stable-flight peak power",
      value: `~${peakPower} W (est.)`
    });
  }

  return {
    status,
    story,
    metrics,

    averageOutputPercent:
      Math.round(averagePercent * 10) / 10,

    reservePercent:
      Math.round(headroomPercent * 10) / 10,

    saturationPercent:
      Math.round(saturationPercent * 100) / 100,

    stableSampleCount:
      stableIndexes.length
  };
}