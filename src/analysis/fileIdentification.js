export function identifyFile(lines, fileName = "") {
  const firstLine = lines[0] || "";
  const firstLineLower = firstLine.toLowerCase();
  const joinedStart = lines.slice(0, 30).join("\n").toLowerCase();
  const nameLower = String(fileName).toLowerCase();

  // Check the final file extension first.
  // Explorer exports can be named *.bbl.csv but are still CSV files.
  if (nameLower.endsWith(".csv")) {
    return "CSV Telemetry Export";
  }

  if (nameLower.endsWith(".bbl")) {
    return "Blackbox BBL Log";
  }

  if (
    firstLineLower.includes("resource ") ||
    joinedStart.includes("# resource")
  ) {
    return "Rotorflight CLI Dump";
  }

  if (
    firstLineLower.includes("time") &&
    firstLine.includes(",")
  ) {
    return "CSV Telemetry Export";
  }

  if (joinedStart.includes("blackbox flight data recorder")) {
    return "Blackbox BBL Log";
  }

  return "Unknown File Type";
}