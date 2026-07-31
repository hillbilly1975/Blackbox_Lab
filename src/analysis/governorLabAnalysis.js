// ======================================================
// BLACKBOX LAB — GOVERNOR LAB ANALYSIS
// ======================================================
//
// Charts may show the complete recording.
//
// Governor scoring uses only stable governed-flight
// samples detected by the shared flight-phase module.
// Spool-up, spool-down and headspeed transitions are
// excluded from the calculations.
//
// ======================================================

import {
  detectStableFlightPhase
} from "./flightPhase.js";

export function analyzeGovernorLab({
  timeSeconds,
  headspeed,
  governorTarget,
  activity = []
}) {
  if (
    !Array.isArray(timeSeconds) ||
    !Array.isArray(headspeed) ||
    !Array.isArray(governorTarget) ||
    headspeed.length < 100
  ) {
    return null;
  }
if (
  !Array.isArray(timeSeconds) ||
  !Array.isArray(headspeed) ||
  headspeed.length < 100
) {
  return null;
}

if (
  !Array.isArray(governorTarget) ||
  governorTarget.length < 100
) {
  return {
    score: null,
    status: "Target Unavailable",
    story:
      "Headspeed data is present, but governor-target telemetry is unavailable. Rotor-speed stability can be viewed, but governor tracking and droop cannot be scored.",
    droopRpm: null,
    droopPercent: null,
    droopTimeSeconds: null,
    averageHeadspeed: null,
    stableSampleCount: 0,
    stableSegments: [],
    metrics: []
  };
}
  const flightPhase = detectStableFlightPhase({
    timeSeconds,
    headspeed,
    governorTarget,
    activity
  });

  const stableIndexes = flightPhase.stableIndexes;

  if (
    !Array.isArray(stableIndexes) ||
    stableIndexes.length < 100
  ) {
    return {
      score: null,
      status: "insufficient",
      hasRotorSpeedData: flightPhase.hasRotorSpeedData !== false,
      movedDuringRecording:
        flightPhase.movedDuringRecording ?? null,
      story:
        flightPhase.movedDuringRecording === false
          ? "The airframe did not move during this recording, and no rotor speed was logged, so there is no flight to assess."
          : flightPhase.hasRotorSpeedData === false
            ? "This log contains no rotor-speed data, so governor behaviour cannot be assessed. Governor scoring needs an RPM sensor feeding headspeed."
            : "No stable governed-flight section was long enough for a reliable governor assessment.",
      droopRpm: null,
      droopPercent: null,
      droopTimeSeconds: null,
      averageHeadspeed: null,
      stableSampleCount:
        flightPhase.stableSampleCount ?? 0,
      stableSegments:
        flightPhase.segments ?? [],
      metrics: [
        {
          label: "Stable samples",
          value: String(
            flightPhase.stableSampleCount ?? 0
          )
        },
        {
          label: "Governor result",
          value: "Insufficient stable-flight data"
        }
      ]
    };
  }

  let targetSum = 0;
  let actualSum = 0;
  let maximumDroop = 0;
  let droopTime = null;
  let squaredErrorSum = 0;
  let validSampleCount = 0;

  for (const index of stableIndexes) {
    const actual = Number(headspeed[index]);
    const target = Number(governorTarget[index]);
    const time = Number(timeSeconds[index]);

    if (
      !Number.isFinite(actual) ||
      !Number.isFinite(target) ||
      target <= 0
    ) {
      continue;
    }

    targetSum += target;
    actualSum += actual;

    const trackingError = target - actual;
    squaredErrorSum += trackingError * trackingError;

    if (trackingError > maximumDroop) {
      maximumDroop = trackingError;
      droopTime =
        Number.isFinite(time) ? time : null;
    }

    validSampleCount += 1;
  }

  if (validSampleCount < 100) {
    return null;
  }

  const averageTarget =
    targetSum / validSampleCount;

  const averageActual =
    actualSum / validSampleCount;

  const rmsError = Math.sqrt(
    squaredErrorSum / validSampleCount
  );

  const droopPercent =
    averageTarget > 0
      ? (maximumDroop / averageTarget) * 100
      : 0;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          droopPercent * 12 -
          rmsError * 0.5
      )
    )
  );

  const status =
    droopPercent > 3
      ? "attention"
      : droopPercent > 1.2
        ? "watch"
        : "good";

  const droopTimeText =
    Number.isFinite(droopTime)
      ? ` at ${droopTime.toFixed(1)} s`
      : "";

  const story =
    status === "good"
      ? `Excellent stable-flight hold: average headspeed ${Math.round(
          averageActual
        )} rpm against a ${Math.round(
          averageTarget
        )} rpm target. Largest observed tracking dip was ${Math.round(
          maximumDroop
        )} rpm.`
      : status === "watch"
        ? `Stable-flight tracking showed a largest dip of ${Math.round(
            maximumDroop
          )} rpm (${droopPercent.toFixed(
            1
          )}%)${droopTimeText}. Review the chart before changing governor settings.`
        : `Stable-flight tracking showed a largest dip of ${Math.round(
            maximumDroop
          )} rpm (${droopPercent.toFixed(
            1
          )}%)${droopTimeText}. Confirm that this occurred during a real airborne load event before changing governor gain.`;

  return {
    score,
    status,
    story,

    droopRpm:
      Math.round(maximumDroop * 10) / 10,

    droopPercent:
      Math.round(droopPercent * 100) / 100,

    droopTimeSeconds:
      Number.isFinite(droopTime)
        ? Math.round(droopTime * 100) / 100
        : null,

    averageHeadspeed:
      Math.round(averageActual),

    stableSampleCount: validSampleCount,

    stableSegments:
      flightPhase.segments ?? [],

    metrics: [
      {
        label: "Average headspeed",
        value: `${Math.round(averageActual)} rpm`
      },
      {
        label: "Target",
        value: `${Math.round(averageTarget)} rpm`
      },
      {
        label: "Largest stable-flight dip",
        value: `${Math.round(
          maximumDroop
        )} rpm (${droopPercent.toFixed(1)}%)`
      },
      {
        label: "RMS tracking error",
        value: `${rmsError.toFixed(1)} rpm`
      },
      {
        label: "Stable samples used",
        value: validSampleCount.toLocaleString()
      }
    ]
  };
}