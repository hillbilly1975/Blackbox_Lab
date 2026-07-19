export function getColumnValues(
  lines,
  headerIndex,
  columnName
) {
  if (
    !Array.isArray(lines) ||
    !columnName ||
    headerIndex < 0
  ) {
    return [];
  }

  const headers = lines[headerIndex]
    .split(",")
    .map((header) => header.trim());

  const columnIndex = headers.indexOf(columnName);

  if (columnIndex < 0) {
    return [];
  }

  return lines
    .slice(headerIndex + 1)
    .map((line) => line.split(",")[columnIndex])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

export function getColumnSamples(
  lines,
  headerIndex,
  columnName
) {
  if (
    !Array.isArray(lines) ||
    !columnName ||
    headerIndex < 0
  ) {
    return [];
  }

  const headers = lines[headerIndex]
    .split(",")
    .map((header) => header.trim());

  const columnIndex = headers.indexOf(columnName);

  if (columnIndex < 0) {
    return [];
  }

  const samples = [];

  for (
    let rowIndex = headerIndex + 1;
    rowIndex < lines.length;
    rowIndex += 1
  ) {
    const cells = lines[rowIndex].split(",");
    const value = Number(cells[columnIndex]);

    if (Number.isFinite(value)) {
      samples.push({
        rowIndex,
        value
      });
    }
  }

  return samples;
}
    


  

export function getColumnAverage(
  lines,
  headerIndex,
  columnName
) {
  const values = getColumnValues(
    lines,
    headerIndex,
    columnName
  );

  if (values.length === 0) {
    return null;
  }

  const total = values.reduce(
    (sum, value) => sum + value,
    0
  );

  return total / values.length;
}
export function getStandardDeviation(values) {
  if (!values || values.length === 0) {
    return null;
  }

  const average =
    values.reduce((sum, value) => sum + value, 0) /
    values.length;

  const variance =
    values.reduce((sum, value) => {
      const difference = value - average;
      return sum + difference * difference;
    }, 0) / values.length;

  return Math.sqrt(variance);
}
export function clampScore(score) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function calculateAverageAbsolute(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const total = values.reduce(
  (sum, value) => sum + Math.abs(value),
  0
);

return total / values.length;
}
export function getColumnValuesByRowIndexes(
  lines,
  headerIndex,
  columnName,
  rowIndexes
) {
  if (
    !Array.isArray(lines) ||
    !Array.isArray(rowIndexes) ||
    !columnName ||
    headerIndex < 0
  ) {
    return [];
  }

  const headers = lines[headerIndex]
    .split(",")
    .map((header) => header.trim());

  const columnIndex = headers.indexOf(columnName);

  if (columnIndex < 0) {
    return [];
  }

  return rowIndexes
    .map((rowIndex) => {
      const line = lines[rowIndex];

      if (!line) {
        return null;
      }

      const cells = line.split(",");
      const value = Number(cells[columnIndex]);

      return Number.isFinite(value)
        ? value
        : null;
    })
    .filter((value) => Number.isFinite(value));
}
  