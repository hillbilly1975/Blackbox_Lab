export function getMetadataValue(lines, key) {
  const target = `"${key}"`;
  const foundLine = lines.find((line) => line.startsWith(target));

  if (!foundLine) {
    return "Not found";
  }

  const parts = foundLine.split(",");

  if (parts.length < 2) {
    return "Not found";
  }

  return parts
    .slice(1)
    .join(",")
    .replaceAll('"', "")
    .trim();
}