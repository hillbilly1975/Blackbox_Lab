// ======================================================
// BLACKBOX LAB — SHARED FLIGHT-PHASE DETECTION
// ======================================================
//
// Charts may show the complete recording.
//
// Scoring and recommendations should use only stable,
// governed flight. This removes spool-up, spool-down,
// ground operation and headspeed-profile transitions.
//
// ======================================================

function getMedian(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function estimateSampleRate(timeSeconds) {
  if (!Array.isArray(timeSeconds) || timeSeconds.length < 3) {
    return null;
  }

  const intervals = [];

  const limit = Math.min(timeSeconds.length, 5000);

  for (let index = 1; index < limit; index += 1) {
    const previousTime = Number(timeSeconds[index - 1]);
    const currentTime = Number(timeSeconds[index]);
    const interval = currentTime - previousTime;

    if (
      Number.isFinite(interval) &&
      interval > 0 &&
      interval < 1
    ) {
      intervals.push(interval);
    }
  }

  const medianInterval = getMedian(intervals);

  if (
    !Number.isFinite(medianInterval) ||
    medianInterval <= 0
  ) {
    return null;
  }

  return 1 / medianInterval;
}

function buildCandidateMask({
  timeSeconds,
  headspeed,
  governorTarget,
  sampleCount
}) {
  const mask =
    new Array(sampleCount).fill(false);

  const hasUsableGovernorTarget =
    governorTarget.some((value) => {
      if (
        value === null ||
        value === undefined ||
        value === ""
      ) {
        return false;
      }

      const numericValue = Number(value);

      return (
        Number.isFinite(numericValue) &&
        numericValue >= 500
      );
    });

  let earlierIndex = 0;
  let laterIndex = 0;

  for (
    let index = 0;
    index < sampleCount;
    index += 1
  ) {
    const time =
      Number(timeSeconds[index]);

    const actual =
      Number(headspeed[index]);

    if (
      !Number.isFinite(time) ||
      !Number.isFinite(actual) ||
      actual < 500
    ) {
      continue;
    }

    const earlierTime = time - 2;
    const laterTime = time + 2;

    while (
      earlierIndex < index &&
      Number(
        timeSeconds[earlierIndex]
      ) < earlierTime
    ) {
      earlierIndex += 1;
    }

    if (laterIndex < index) {
      laterIndex = index;
    }

    while (
      laterIndex + 1 < sampleCount &&
      Number(
        timeSeconds[laterIndex + 1]
      ) <= laterTime
    ) {
      laterIndex += 1;
    }

    if (hasUsableGovernorTarget) {
      const target =
        Number(governorTarget[index]);

      const earlierTarget =
        Number(
          governorTarget[earlierIndex]
        );

      const laterTarget =
        Number(
          governorTarget[laterIndex]
        );

      if (
        !Number.isFinite(target) ||
        !Number.isFinite(
          earlierTarget
        ) ||
        !Number.isFinite(
          laterTarget
        ) ||
        target < 500
      ) {
        continue;
      }

      const targetMovement =
        Math.abs(
          laterTarget -
            earlierTarget
        );

      if (targetMovement > 20) {
        continue;
      }

      const trackingErrorPercent =
        Math.abs(actual - target) /
        target;

      if (
        trackingErrorPercent <= 0.08
      ) {
        mask[index] = true;
      }

      continue;
    }

    const earlierActual =
      Number(
        headspeed[earlierIndex]
      );

    const laterActual =
      Number(
        headspeed[laterIndex]
      );

    if (
      !Number.isFinite(
        earlierActual
      ) ||
      !Number.isFinite(
        laterActual
      )
    ) {
      continue;
    }

    const headspeedMovement =
      Math.abs(
        laterActual -
          earlierActual
      );

    const plateauMovementLimit =
      Math.max(
        40,
        actual * 0.03
      );

    if (
      headspeedMovement <=
      plateauMovementLimit
    ) {
      mask[index] = true;
    }
  }

  return mask;
}
 

function removeTargetTransitions({
  mask,
  governorTarget,
  transitionWindowSamples
}) {
  const cleanedMask = [...mask];
const hasUsableGovernorTarget =
  governorTarget.some((value) => {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return false;
    }

    const numericValue = Number(value);

    return (
      Number.isFinite(numericValue) &&
      numericValue >= 500
    );
  });

if (!hasUsableGovernorTarget) {
  return cleanedMask;
}
  for (
    let index = 1;
    index < governorTarget.length;
    index += 1
  ) {
    const previousTarget = Number(governorTarget[index - 1]);
    const currentTarget = Number(governorTarget[index]);

    if (
      !Number.isFinite(previousTarget) ||
      !Number.isFinite(currentTarget)
    ) {
      continue;
    }

    const targetChange =
      Math.abs(currentTarget - previousTarget);

    if (targetChange < 20) {
      continue;
    }

    const firstIndex = Math.max(
      0,
      index - transitionWindowSamples
    );

    const lastIndex = Math.min(
      cleanedMask.length - 1,
      index + transitionWindowSamples
    );

    for (
      let maskIndex = firstIndex;
      maskIndex <= lastIndex;
      maskIndex += 1
    ) {
      cleanedMask[maskIndex] = false;
    }
  }

  return cleanedMask;
}

function keepStableSegments({
  mask,
  minimumSegmentSamples,
  trimSamples
}) {
  const stableMask = new Array(mask.length).fill(false);
  const segments = [];

  let segmentStart = null;

  for (let index = 0; index <= mask.length; index += 1) {
    const isCandidate =
      index < mask.length && mask[index] === true;

    if (isCandidate && segmentStart === null) {
      segmentStart = index;
    }

    if (!isCandidate && segmentStart !== null) {
      const segmentEnd = index - 1;
      const segmentLength =
        segmentEnd - segmentStart + 1;

      if (segmentLength >= minimumSegmentSamples) {
        const trimmedStart =
          segmentStart + trimSamples;

        const trimmedEnd =
          segmentEnd - trimSamples;

        if (trimmedEnd >= trimmedStart) {
          for (
            let stableIndex = trimmedStart;
            stableIndex <= trimmedEnd;
            stableIndex += 1
          ) {
            stableMask[stableIndex] = true;
          }

          segments.push({
            startIndex: trimmedStart,
            endIndex: trimmedEnd,
            sampleCount:
              trimmedEnd - trimmedStart + 1
          });
        }
      }

      segmentStart = null;
    }
  }

  return {
    stableMask,
    segments
  };
}

// Rotor speed is the preferred way to find steady flight.
// Aircraft without an RPM sensor (nitro and turbine models,
// or electric models flown without the sensor wired) log
// headspeed as a constant zero, so the check below decides
// which detection basis this log can support.
export function hasUsableRotorSpeed(values) {
  if (!Array.isArray(values)) {
    return false;
  }

  return values.some((value) => {
    const numericValue = Number(value);

    return (
      Number.isFinite(numericValue) &&
      numericValue >= 500
    );
  });
}

function buildRollingMean(values, windowSamples) {
  const smoothed = new Array(values.length).fill(null);

  const half = Math.max(1, Math.round(windowSamples / 2));

  let runningTotal = 0;
  let runningCount = 0;

  for (
    let index = 0;
    index < values.length + half;
    index += 1
  ) {
    if (index < values.length) {
      const entering = Number(values[index]);

      if (Number.isFinite(entering)) {
        runningTotal += entering;
        runningCount += 1;
      }
    }

    const leavingIndex = index - 2 * half;

    if (leavingIndex >= 0) {
      const leaving = Number(values[leavingIndex]);

      if (Number.isFinite(leaving)) {
        runningTotal -= leaving;
        runningCount -= 1;
      }
    }

    const centre = index - half;

    if (centre >= 0 && centre < values.length) {
      smoothed[centre] =
        runningCount > 0
          ? runningTotal / runningCount
          : null;
    }
  }

  return smoothed;
}

function getPercentile(values, fraction) {
  const usable = values
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number)
    .sort((a, b) => a - b);

  if (usable.length === 0) {
    return null;
  }

  const position = Math.min(
    usable.length - 1,
    Math.max(0, Math.round((usable.length - 1) * fraction))
  );

  return usable[position];
}

// Without rotor speed, sustained airframe motion is what
// separates flight from sitting on the ground. The quiet
// and busy ends of the recording set the threshold, so the
// result does not depend on any absolute gyro magnitude.
function buildActivityMask({
  activity,
  sampleCount,
  sampleRateHz
}) {
  const windowSamples = Math.max(
    3,
    Math.round(sampleRateHz)
  );

  const smoothed = buildRollingMean(
    activity.slice(0, sampleCount),
    windowSamples
  );

  const quietLevel = getPercentile(smoothed, 0.1);
  const busyLevel = getPercentile(smoothed, 0.9);

  if (
    !Number.isFinite(quietLevel) ||
    !Number.isFinite(busyLevel) ||
    busyLevel <= 0
  ) {
    return null;
  }

  // A model sitting on the ground still logs a little gyro
  // noise, so contrast alone is not enough to call something
  // flight — noise against quieter noise still forms a ratio.
  // The busy end must also clear a floor of real rotation.
  // The floor is deliberately far below any flying model, so
  // gentle hovering still qualifies.
  const MINIMUM_FLIGHT_ROTATION = 15;

  if (
    busyLevel < MINIMUM_FLIGHT_ROTATION ||
    busyLevel < quietLevel * 1.5
  ) {
    return null;
  }

  const threshold =
    quietLevel + (busyLevel - quietLevel) * 0.25;

  const mask = new Array(sampleCount).fill(false);

  for (let index = 0; index < sampleCount; index += 1) {
    const value = smoothed[index];

    if (Number.isFinite(value) && value >= threshold) {
      mask[index] = true;
    }
  }

  return mask;
}

export function detectStableFlightPhase({
  timeSeconds = [],
  headspeed = [],
  governorTarget = [],
  activity = []
}) {
const hasGovernorTarget =
  governorTarget.length > 0;
const hasRotorSpeedData = hasUsableRotorSpeed(headspeed);
const hasActivitySignal =
  Array.isArray(activity) && activity.length > 0;
const sampleCount =
  !hasRotorSpeedData && hasActivitySignal
    ? Math.min(
        timeSeconds.length,
        activity.length
      )
    : hasGovernorTarget
      ? Math.min(
          timeSeconds.length,
          headspeed.length,
          governorTarget.length
        )
      : Math.min(
          timeSeconds.length,
          headspeed.length
        );

  if (sampleCount < 100) {
    return {
      sampleRateHz: null,
      stableMask: new Array(sampleCount).fill(false),
      stableIndexes: [],
      segments: [],
      stableSampleCount: 0,
      hasRotorSpeedData,
      basis: "none",
      reason: "Not enough aligned samples were available."
    };
  }

  const alignedTime = timeSeconds.slice(0, sampleCount);
  const alignedHeadspeed = headspeed.slice(0, sampleCount);
  const alignedTarget =
  hasGovernorTarget
    ? governorTarget.slice(
        0,
        sampleCount
      )
    : new Array(sampleCount).fill(null);

  const sampleRateHz =
    estimateSampleRate(alignedTime) ?? 100;

  const transitionWindowSamples = Math.max(
    1,
    Math.round(sampleRateHz * 2)
  );

  const minimumSegmentSamples = Math.max(
    100,
    Math.round(sampleRateHz * 3)
  );

  const trimSamples = Math.max(
    1,
    Math.round(sampleRateHz * 3)
  );

  const activityMask =
    !hasRotorSpeedData && hasActivitySignal
      ? buildActivityMask({
          activity,
          sampleCount,
          sampleRateHz
        })
      : null;

  const basis = hasRotorSpeedData
    ? "headspeed"
    : activityMask
      ? "activity"
      : "none";

  if (basis === "none") {
    return {
      sampleRateHz,
      stableMask: new Array(sampleCount).fill(false),
      stableIndexes: [],
      segments: [],
      stableSampleCount: 0,
      hasRotorSpeedData,
      basis,
      movedDuringRecording: hasActivitySignal ? false : null,
      reason: hasActivitySignal
        ? "This log contains no rotor-speed data, and the airframe did not move during the recording, so no flight section could be identified."
        : "This log contains no rotor-speed data, so a governed-flight section could not be identified."
    };
  }

  const candidateMask =
    basis === "activity"
      ? activityMask
      : buildCandidateMask({
          timeSeconds: alignedTime,
          headspeed: alignedHeadspeed,
          governorTarget: alignedTarget,
          sampleCount
        });

  const transitionCleanedMask =
    basis === "activity"
      ? candidateMask
      : removeTargetTransitions({
          mask: candidateMask,
          governorTarget: alignedTarget,
          transitionWindowSamples
        });

  const {
    stableMask,
    segments
  } = keepStableSegments({
    mask: transitionCleanedMask,
    minimumSegmentSamples,
    trimSamples
  });

  const stableIndexes = [];

  for (
    let index = 0;
    index < stableMask.length;
    index += 1
  ) {
    if (stableMask[index]) {
      stableIndexes.push(index);
    }
  }

  return {
    sampleRateHz,
    stableMask,
    stableIndexes,
    segments,
    stableSampleCount: stableIndexes.length,
    hasRotorSpeedData,
    basis,
    movedDuringRecording: basis === "activity" ? true : null,
    reason:
      stableIndexes.length > 0
        ? basis === "activity"
          ? "Steady flight was detected from airframe motion, because this log contains no rotor-speed data."
          : "Stable governed-flight samples were detected."
        : basis === "activity"
          ? "The airframe moved, but no single section was steady for long enough to measure."
          : "No stable governed-flight segment passed the phase checks."
  };
}

export function selectStableValues(
  values,
  stableIndexes
) {
  if (
    !Array.isArray(values) ||
    !Array.isArray(stableIndexes)
  ) {
    return [];
  }

  const selectedValues = [];

  for (const index of stableIndexes) {
    const value = values[index];

    if (Number.isFinite(Number(value))) {
      selectedValues.push(Number(value));
    }
  }

  return selectedValues;
}