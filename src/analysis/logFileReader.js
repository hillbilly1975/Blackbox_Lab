// ======================================================
// BLACKBOX LAB — LOG FILE READER
// ======================================================
//
// Reads any supported log file and always returns the
// same shape, whether the source was a raw binary .bbl
// (decoded natively) or a text export:
//
//   {
//     file, sizeKb, fileType, isBinary,
//     flights: [{ label, lines, decodeInfo }]
//   }
//
// Each flight's `lines` look exactly like a classic CSV
// export, so every analysis module downstream works the
// same for both worlds.
//
// ======================================================

import { identifyFile } from "./fileIdentification.js";
import {
  looksLikeBinaryBbl,
  decodeBblFile
} from "./bbl/bblDecoder.js";
import { decodedFlightToCsvLines } from "./bbl/csvAdapter.js";

function describeDecode(flight) {
  const { stats } = flight;
  const frames = stats.intraFrames + stats.interFrames;
  const duration = flight.durationSeconds
    ? `${flight.durationSeconds.toFixed(1)} s`
    : "unknown length";

  const corrupt =
    stats.corruptFrames > 0
      ? `, ${stats.corruptFrames} corrupt frames skipped`
      : "";

  return `${frames} frames decoded (${duration})${corrupt}`;
}

export async function readLogFile(file) {
  if (!file) {
    return null;
  }

  const sizeKb = (file.size / 1024).toFixed(1);
  const buffer = new Uint8Array(await file.arrayBuffer());

  // ---- binary .bbl: decode natively ----
  if (looksLikeBinaryBbl(buffer)) {
    const { flights } = decodeBblFile(buffer);

    const usable = flights
      .filter((flight) => flight.mainFrames.length > 0)
      .map((flight) => ({
        label:
          flights.length > 1
            ? `Flight ${flight.index + 1} (${flight.durationSeconds.toFixed(1)} s)`
            : "Flight 1",
        lines: decodedFlightToCsvLines(flight),
        decodeInfo: describeDecode(flight)
      }));

    return {
      file,
      sizeKb,
      // Exactly this label: it selects the full-analysis
      // branch in logAnalysisBuilder.js.
      fileType: "Blackbox BBL Log",
      isBinary: true,
      flights: usable
    };
  }

  // ---- text files: CSV export, CLI dump, headers ----
  const text = new TextDecoder().decode(buffer);

  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  return {
    file,
    sizeKb,
    fileType: identifyFile(lines),
    isBinary: false,
    flights: [
      {
        label: "Flight 1",
        lines,
        decodeInfo: null
      }
    ]
  };
}
