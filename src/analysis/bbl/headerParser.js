// ======================================================
// BLACKBOX LAB — BBL HEADER PARSER
// ======================================================
//
// The binary log opens with plain ASCII header lines:
//
//   H Product:Blackbox flight data recorder by Nicholas Sherlock
//   H Data version:2
//   H Field I name:loopIteration,time,...
//   H Field I predictor:0,0,...
//   H Field I encoding:1,1,...
//   H Field P predictor:6,2,...
//   ...
//
// The header ends at the first line that does not start
// with "H ". Everything after that is binary frame data.
//
// ======================================================

export const LOG_START_MARKER =
  "H Product:Blackbox flight data recorder by Nicholas Sherlock";

const FRAME_MARKER_BYTES = new Set(
  ["I", "P", "G", "H", "S", "E"].map((c) => c.charCodeAt(0))
);

function parseNumberList(value) {
  return value.split(",").map((entry) => Number(entry.trim()));
}

function parseNameList(value) {
  return value.split(",").map((entry) => entry.trim());
}

export function buildFieldDefinitions(headers, frameLetter) {
  const names =
    headers.get(`Field ${frameLetter} name`) ??
    (frameLetter === "P" ? headers.get("Field I name") : undefined);

  if (!names) {
    return null;
  }

  const fieldNames = parseNameList(names);
  const count = fieldNames.length;

  const readList = (key, fallback) => {
    const raw = headers.get(key);

    if (!raw) {
      return new Array(count).fill(fallback);
    }

    const list = parseNumberList(raw);

    while (list.length < count) {
      list.push(fallback);
    }

    return list;
  };

  return {
    count,
    names: fieldNames,
    signed: readList(`Field ${frameLetter} signed`, 0),
    predictors: readList(`Field ${frameLetter} predictor`, 0),
    encodings: readList(`Field ${frameLetter} encoding`, 1)
  };
}

export function parseHeader(bytes, start, end) {
  const headers = new Map();
  const decoder = new TextDecoder("ascii");

  let position = start;

  while (position < end) {
    // A header line must start with "H ".
    if (
      bytes[position] !== 0x48 /* 'H' */ ||
      bytes[position + 1] !== 0x20 /* ' ' */
    ) {
      break;
    }

    let lineEnd = position;

    while (lineEnd < end && bytes[lineEnd] !== 0x0a /* '\n' */) {
      lineEnd += 1;
    }

    const line = decoder.decode(bytes.subarray(position + 2, lineEnd));
    const separator = line.indexOf(":");

    if (separator > 0) {
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      headers.set(key, value);
    }

    position = lineEnd + 1;
  }

  // Defensive: if the byte right after the header is not a
  // known frame marker, scan forward to the first one so a
  // stray byte cannot derail the whole log.
  let frameStart = position;

  while (
    frameStart < end &&
    !FRAME_MARKER_BYTES.has(bytes[frameStart])
  ) {
    frameStart += 1;
  }

  const parseFraction = (value, fallback) => {
    if (!value) {
      return fallback;
    }

    if (value.includes("/")) {
      const [num, denom] = value.split("/").map(Number);
      return { num: num || 1, denom: denom || 1 };
    }

    const single = Number(value);
    return Number.isFinite(single)
      ? { num: 1, denom: single || 1 }
      : fallback;
  };

  return {
    headers,
    frameDataStart: frameStart,

    sysConfig: {
      firmwareType: headers.get("Firmware type") ?? null,
      firmwareRevision: headers.get("Firmware revision") ?? null,
      firmwareDate: headers.get("Firmware date") ?? null,
      boardInformation: headers.get("Board information") ?? null,
      craftName: headers.get("Craft name") ?? null,
      logStartDatetime: headers.get("Log start datetime") ?? null,
      dataVersion: Number(headers.get("Data version") ?? 2),
      minthrottle: Number(headers.get("minthrottle") ?? 1150),
      vbatref: Number(headers.get("vbatref") ?? 4095),
      iInterval: Number(headers.get("I interval") ?? 32),
      pInterval: parseFraction(headers.get("P interval"), {
        num: 1,
        denom: 1
      })
    },

    fields: {
      main: buildFieldDefinitions(headers, "I"),
      inter: buildFieldDefinitions(headers, "P"),
      slow: buildFieldDefinitions(headers, "S"),
      gps: buildFieldDefinitions(headers, "G"),
      gpsHome: buildFieldDefinitions(headers, "H")
    }
  };
}

// Locate every log inside a file. A single .bbl can hold
// several flights, each opening with the same marker.
export function findLogBoundaries(bytes) {
  const marker = new TextEncoder().encode(LOG_START_MARKER);
  const boundaries = [];

  outer: for (let i = 0; i <= bytes.length - marker.length; i += 1) {
    if (bytes[i] !== marker[0]) {
      continue;
    }

    for (let j = 1; j < marker.length; j += 1) {
      if (bytes[i + j] !== marker[j]) {
        continue outer;
      }
    }

    boundaries.push(i);
    i += marker.length - 1;
  }

  return boundaries.map((start, index) => ({
    start,
    end:
      index + 1 < boundaries.length
        ? boundaries[index + 1]
        : bytes.length
  }));
}
