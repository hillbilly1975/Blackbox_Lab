export function findTelemetryHeaderIndex(lines) {
  return lines.findIndex((line) => {
    const lower = line.toLowerCase();

    return (
      lower.includes("time") &&
      lower.includes(",") &&
      (
        lower.includes("vbat") ||
        lower.includes("voltage") ||
        lower.includes("rpm") ||
        lower.includes("motor")
      )
    );
  });
}