export function updateScreen({
  telemetryText,
  file,
  sizeKb,
  lines,
  extraSummary,
  telemetryColumns,
  fileStatus,
  summaryFileName,
  summaryFileSize,
  summaryStatus,
  rawPreview
}) {
  telemetryColumns.textContent = telemetryText;

  fileStatus.textContent = `Loaded: ${file.name}`;
  summaryFileName.textContent = file.name;
  summaryFileSize.textContent = `${sizeKb} KB`;

  summaryStatus.innerHTML = `
    Log selected<br>
    Rows: ${lines.length}<br>
    ${extraSummary}
  `;

  const previewLines = lines
    .slice(0, 12)
    .join("\n");

  rawPreview.textContent = previewLines;
}