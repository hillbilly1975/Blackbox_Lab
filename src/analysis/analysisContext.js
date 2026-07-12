export function buildAnalysisContext({
  fileType,
  lines,
  aircraftProfile = null,
  firmware = null,
  firmwareRevision = null,
  board = null,
  craftName = null,
  logStart = null,
  telemetryHeaderIndex = null,
  detectedTelemetry = {},
  evidenceSources = {}
}) {
  const availableTelemetry = Object.entries(detectedTelemetry)
    .filter(([, columnName]) => Boolean(columnName))
    .map(([key, columnName]) => ({
      key,
      columnName
    }));

  const missingTelemetry = Object.entries(detectedTelemetry)
    .filter(([, columnName]) => !columnName)
    .map(([key]) => key);

  const availableEvidence = Object.entries(evidenceSources)
    .filter(([, available]) => Boolean(available))
    .map(([source]) => source);

  const missingEvidence = Object.entries(evidenceSources)
    .filter(([, available]) => !available)
    .map(([source]) => source);

  return {
    file: {
      type: fileType,
      rowCount: Array.isArray(lines) ? lines.length : 0
    },

    aircraft: {
      profile: aircraftProfile,
      craftName,
      matched: Boolean(aircraftProfile)
    },

    firmware: {
      version: firmware,
      revision: firmwareRevision,
      board
    },

    flight: {
      logStart,
      telemetryHeaderIndex
    },

    telemetry: {
      detected: detectedTelemetry,
      available: availableTelemetry,
      missing: missingTelemetry,
      availableCount: availableTelemetry.length,
      missingCount: missingTelemetry.length
    },

    evidence: {
      sources: evidenceSources,
      available: availableEvidence,
      missing: missingEvidence,
      availableCount: availableEvidence.length,
      missingCount: missingEvidence.length
    }
  };
}