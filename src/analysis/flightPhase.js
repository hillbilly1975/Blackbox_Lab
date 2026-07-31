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

export function detectStableFlightPhase({
  timeSeconds = [],
  headspeed = [],
  governorTarget = []
}) {
const hasGovernorTarget =
  governorTarget.length > 0;
console.log("FLIGHT PHASE DEBUG", {
  timeCount: timeSeconds.length,
  headspeedCount: headspeed.length,
  governorTargetCount: governorTarget?.length ?? 0,
  hasGovernorTarget
});
const sampleCount =
  hasGovernorTarget
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

  const candidateMask = buildCandidateMask({
  timeSeconds: alignedTime,
  headspeed: alignedHeadspeed,
  governorTarget: alignedTarget,
  sampleCount
});

  const transitionCleanedMask =
    removeTargetTransitions({
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
    reason:
      stableIndexes.length > 0
        ? "Stable governed-flight samples were detected."
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