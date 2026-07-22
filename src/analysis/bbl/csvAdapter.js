// ======================================================
// BLACKBOX LAB — BBL → CSV ADAPTER
// ======================================================
//
// Renders one decoded flight in the same shape as a
// classic Blackbox CSV export: quoted metadata lines,
// then a column header row, then one row per main frame
// (with the latest slow-frame values carried forward).
//
// This is the bridge that lets every existing Blackbox
// Lab analysis module work on raw .bbl files without
// changing a single line of analysis code.
//
// ======================================================

export function decodedFlightToCsvLines(flight) {
  const lines = [];

  // ---- metadata block (blackbox_decode style) ----
  // "Field X ..." definition lines are skipped: their values
  // contain the whole comma-separated field list, which the
  // telemetry-header detector would mistake for the actual
  // column header row (off-by-one column bug).
  for (const [key, value] of flight.headers.entries()) {
    if (key.startsWith("Field ")) {
      continue;
    }

    lines.push(`"${key}","${value}"`);
  }

  // The analysis pipeline reads a lowercase "firmware" key.
  if (flight.sysConfig.firmwareType) {
    const firmware = [
      flight.sysConfig.firmwareType,
      flight.sysConfig.firmwareRevision
    ]
      .filter(Boolean)
      .join(" ");

    lines.push(`"firmware","${firmware}"`);
  }

  // ---- column header row ----
  const slowNames = flight.slowFieldNames;
  const columnNames = [...flight.mainFieldNames, ...slowNames];
  lines.push(columnNames.join(","));

  // ---- data rows with slow values carried forward ----
  const slowCurrent = new Array(slowNames.length).fill(0);
  let slowCursor = 0;

  for (
    let frameIndex = 0;
    frameIndex < flight.mainFrames.length;
    frameIndex += 1
  ) {
    while (
      slowCursor < flight.slowFrames.length &&
      flight.slowFrames[slowCursor].afterMainFrame < frameIndex
    ) {
      const values = flight.slowFrames[slowCursor].values;

      for (let i = 0; i < slowNames.length; i += 1) {
        slowCurrent[i] = values[i];
      }

      slowCursor += 1;
    }

    const main = flight.mainFrames[frameIndex];
    const row = new Array(columnNames.length);

    for (let i = 0; i < main.length; i += 1) {
      row[i] = main[i];
    }

    for (let i = 0; i < slowCurrent.length; i += 1) {
      row[main.length + i] = slowCurrent[i];
    }

    lines.push(row.join(","));
  }

  return lines;
}
