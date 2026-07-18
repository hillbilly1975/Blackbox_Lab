export function updateScreen({
  telemetryText,
  file,
  sizeKb,
  lines,
  extraSummary,
  telemetryColumns,
  filterAnalysis,
  pidAnalysis,
  fileStatus,
  summaryFileName,
  summaryFileSize,
  summaryStatus,
  filterAnalysisStatus,
  filterAnalysisScore,
  filterAnalysisConfidence,
  filterAnalysisFindings,
  filterAnalysisRecommendations,
  pidAnalysisStatus,
pidAnalysisScore,
pidAnalysisConfidence,
pidAnalysisFindings,
pidAnalysisRecommendations,
  rawPreview,
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

if (filterAnalysis) {
  filterAnalysisStatus.textContent =
    filterAnalysis.status || "Unknown";

  filterAnalysisScore.textContent =
    Number.isFinite(filterAnalysis.score)
      ? `${filterAnalysis.score}/100`
      : "---";

  filterAnalysisConfidence.textContent =
    filterAnalysis.confidence
      ? `${filterAnalysis.confidence.label} (${filterAnalysis.confidence.score}/100)`
      : "---";
const gyroReductionFindings = Array.isArray(
  filterAnalysis.gyroReductionByAxis
)
  ? filterAnalysis.gyroReductionByAxis.map((axis) => {
      const rawAverage = Number.isFinite(axis.rawAverage)
        ? axis.rawAverage.toFixed(2)
        : "---";

      const filteredAverage = Number.isFinite(axis.filteredAverage)
        ? axis.filteredAverage.toFixed(2)
        : "---";

      const reductionPercent = Number.isFinite(axis.reductionPercent)
        ? axis.reductionPercent.toFixed(1)
        : "---";

      return `${axis.axis}: Raw ${rawAverage}, Filtered ${filteredAverage}, Reduction ${reductionPercent}%`;
    })
  : [];
  const summaryFindings = Array.isArray(filterAnalysis.summaryFindings)
  ? filterAnalysis.summaryFindings
  : [];

const technicalFindings = [
  ...(Array.isArray(filterAnalysis.findings)
    ? filterAnalysis.findings
    : []),
  ...gyroReductionFindings
];

const combinedFindings = [
  ...summaryFindings,
  ...technicalFindings
];

filterAnalysisFindings.innerHTML =
  summaryFindings.length > 0 || technicalFindings.length > 0
    ? `
        ${
          summaryFindings.length > 0
            ? `
              <h4>Summary</h4>
              ${summaryFindings
                .map((finding) => `<div>• ${finding}</div>`)
                .join("")}
            `
            : ""
        }

        ${
          technicalFindings.length > 0
  ? `
      <details>
        <summary><strong>Technical Findings</strong></summary>
        <div>
          ${technicalFindings
            .map((finding) => `<div>• ${finding}</div>`)
            .join("")}
        </div>
      </details>
    `
  : ""
        }
      `
    : "No findings available.";

  filterAnalysisRecommendations.innerHTML =
    Array.isArray(filterAnalysis.recommendations) &&
    filterAnalysis.recommendations.length > 0
      ? filterAnalysis.recommendations
          .map((recommendation) => `<div>• ${recommendation}</div>`)
          .join("")
      : "No recommendations available.";
      
  filterAnalysisStatus.textContent =
    filterAnalysis.status || "Unknown";

  filterAnalysisScore.textContent =
    Number.isFinite(filterAnalysis.score)
      ? `${filterAnalysis.score}/100`
      : "---";

  filterAnalysisConfidence.textContent =
    filterAnalysis.confidence
      ? `${filterAnalysis.confidence.label} (${filterAnalysis.confidence.score}/100)`
      : "---";

  

  filterAnalysisRecommendations.innerHTML =
    Array.isArray(filterAnalysis.recommendations) &&
    filterAnalysis.recommendations.length > 0
      ? filterAnalysis.recommendations
          .map((recommendation) => `<div>• ${recommendation}</div>`)
          .join("")
      : "No recommendations available.";
      pidAnalysisStatus.textContent =
  pidAnalysis?.status || "Unknown";

pidAnalysisScore.textContent =
  Number.isFinite(pidAnalysis?.score)
    ? `${pidAnalysis.score}/100`
    : "---";

pidAnalysisConfidence.textContent =
  pidAnalysis?.confidence
    ? `${pidAnalysis.confidence.level} (${pidAnalysis.confidence.score}/100)`
    : "---";

pidAnalysisFindings.innerHTML =
  Array.isArray(pidAnalysis?.findings) &&
  pidAnalysis.findings.length > 0
    ? pidAnalysis.findings
        .map((finding) => `<div>• ${finding}</div>`)
        .join("")
    : "No findings available.";

pidAnalysisRecommendations.innerHTML =
  Array.isArray(pidAnalysis?.recommendations) &&
  pidAnalysis.recommendations.length > 0
    ? pidAnalysis.recommendations
        .map(
          (recommendation) =>
            `<div>• ${recommendation}</div>`
        )
        .join("")
    : "No recommendations available.";
}
}