// ======================================================
// BLACKBOX LAB — PER-PROFILE RESPONSE BREAKDOWN
// ======================================================
//
// Helicopters behave differently at different headspeeds.
// This module measures, per headspeed profile and axis, how
// often the response overshot what was asked: the share of
// commanded samples where the filtered gyro exceeded the
// setpoint beyond a deadband, and the largest such
// exceedance. It samples rows exactly the way the PID
// analysis does, so profiles and values line up. Evidence
// only — no score reads this.
//
// ======================================================

import { getColumnValuesByRowIndexes } from "./mathHelpers.js";

const COMMAND_THRESHOLD = 30; // deg/s — below this it's noise
const EXCEEDANCE_DEADBAND = 10; // deg/s beyond the setpoint

export function analyzeProfileResponse({
  lines,
  telemetryHeaderIndex,
  headspeedProfiles,
  setpointColumns,
  gyroColumns,
  axisNames = ["Roll", "Pitch", "Yaw"]
}) {
  if (
    !Array.isArray(lines) ||
    !Number.isInteger(telemetryHeaderIndex) ||
    telemetryHeaderIndex < 0 ||
    !Array.isArray(headspeedProfiles) ||
    !Array.isArray(setpointColumns) ||
    !Array.isArray(gyroColumns)
  ) {
    return [];
  }

  return headspeedProfiles.map((profile) => {
    const rowIndexes = Array.isArray(profile.sampleIndexes)
      ? profile.sampleIndexes
      : [];

    const axisResults = axisNames.map((axis, axisIndex) => {
      const setpointColumn = setpointColumns[axisIndex];
      const gyroColumn = gyroColumns[axisIndex];

      if (!setpointColumn || !gyroColumn) {
        return {
          axis,
          commandedSampleCount: 0,
          exceedanceRatePercent: null,
          peakExceedancePercent: null
        };
      }

      const setpointValues = getColumnValuesByRowIndexes(
        lines,
        telemetryHeaderIndex,
        setpointColumn,
        rowIndexes
      );

      const gyroValues = getColumnValuesByRowIndexes(
        lines,
        telemetryHeaderIndex,
        gyroColumn,
        rowIndexes
      );

      const sampleCount = Math.min(
        setpointValues.length,
        gyroValues.length
      );

      let commandedSampleCount = 0;
      let exceededSampleCount = 0;
      let peakExceedancePercent = null;

      for (let i = 0; i < sampleCount; i += 1) {
        const setpoint = setpointValues[i];
        const gyro = gyroValues[i];

        if (
          !Number.isFinite(setpoint) ||
          !Number.isFinite(gyro) ||
          Math.abs(setpoint) < COMMAND_THRESHOLD
        ) {
          continue;
        }

        commandedSampleCount += 1;

        const exceedance =
          Math.abs(gyro) -
          (Math.abs(setpoint) + EXCEEDANCE_DEADBAND);

        if (exceedance > 0) {
          exceededSampleCount += 1;

          const exceedancePercent =
            (exceedance / Math.abs(setpoint)) * 100;

          if (
            peakExceedancePercent === null ||
            exceedancePercent > peakExceedancePercent
          ) {
            peakExceedancePercent = exceedancePercent;
          }
        }
      }

      return {
        axis,
        commandedSampleCount,
        exceedanceRatePercent:
          commandedSampleCount > 0
            ? (exceededSampleCount / commandedSampleCount) * 100
            : null,
        peakExceedancePercent
      };
    });

    return {
      targetRpm: profile.targetRpm,
      axisResults
    };
  });
}
