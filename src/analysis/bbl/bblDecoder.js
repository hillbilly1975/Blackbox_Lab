// ======================================================
// BLACKBOX LAB — BBL DECODER (top level)
// ======================================================
//
// Turns a raw .bbl file (ArrayBuffer / Uint8Array) into
// fully decoded flights. One file may contain several
// flights; each is decoded independently so one corrupt
// session never hides the others.
//
//   const { flights } = decodeBblFile(bytes);
//   flights[0].mainFieldNames  → ["loopIteration", ...]
//   flights[0].mainFrames      → [Int32Array, ...]
//
// ======================================================

import { parseHeader, findLogBoundaries } from "./headerParser.js";
import { FrameDecoder } from "./frameDecoder.js";

export function looksLikeBinaryBbl(bytes) {
  const probeLength = Math.min(bytes.length, 512 * 1024);

  // Binary frame data contains plenty of bytes that never
  // appear in text logs (CSV / CLI dumps are pure ASCII).
  for (let i = 0; i < probeLength; i += 1) {
    const byte = bytes[i];

    if (byte === 0 || (byte > 0x0d && byte < 0x20) || byte > 0x7e) {
      return true;
    }
  }

  return false;
}

export function decodeBblFile(input) {
  const bytes =
    input instanceof Uint8Array ? input : new Uint8Array(input);

  const boundaries = findLogBoundaries(bytes);

  const flights = boundaries.map((boundary, index) => {
    const parsedHeader = parseHeader(bytes, boundary.start, boundary.end);

    const decoder = new FrameDecoder(
      bytes,
      parsedHeader.frameDataStart,
      boundary.end,
      parsedHeader
    );

    const decoded = decoder.decodeAll();

    const timeIndex = parsedHeader.fields.main
      ? parsedHeader.fields.main.names.indexOf("time")
      : -1;

    let durationSeconds = 0;

    if (timeIndex >= 0 && decoded.mainFrames.length > 1) {
      const first = decoded.mainFrames[0][timeIndex];
      const last =
        decoded.mainFrames[decoded.mainFrames.length - 1][timeIndex];
      durationSeconds = (last - first) / 1_000_000;
    }

    return {
      index,
      headers: parsedHeader.headers,
      sysConfig: parsedHeader.sysConfig,
      mainFieldNames: parsedHeader.fields.main
        ? parsedHeader.fields.main.names
        : [],
      slowFieldNames: parsedHeader.fields.slow
        ? parsedHeader.fields.slow.names
        : [],
      mainFrames: decoded.mainFrames,
      slowFrames: decoded.slowFrames,
      gpsFrames: decoded.gpsFrames,
      events: decoded.events,
      stats: decoded.stats,
      durationSeconds
    };
  });

  return {
    flightCount: flights.length,
    flights
  };
}
