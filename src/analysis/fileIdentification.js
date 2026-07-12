export function identifyFile(lines) {
  const firstLine = lines[0] || "";
  const joinedStart = lines.slice(0, 30).join("\n").toLowerCase();

  if (joinedStart.includes("blackbox flight data recorder")) {
    return "Blackbox BBL Log";
  }

  if (
    firstLine.toLowerCase().includes("resource ") ||
    joinedStart.includes("# resource")
  ) {
    return "Rotorflight CLI Dump";
  }

  if (
    firstLine.toLowerCase().includes("time") &&
    firstLine.includes(",")
  ) {
    return "CSV Telemetry Export";
  }

  return "Unknown File Type";
}