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
  pidAnalysis?.overallStatus
    ? `${pidAnalysis.status} — ${pidAnalysis.overallStatus}`
    : pidAnalysis?.status || "Unknown";

pidAnalysisScore.textContent =
  Number.isFinite(pidAnalysis?.score)
    ? `${pidAnalysis.score}/100`
    : "---";

pidAnalysisConfidence.textContent =
  pidAnalysis?.confidence
    ? `${pidAnalysis.confidence.level} (${pidAnalysis.confidence.score}/100)`
    : "---";

const pidSummaryHtml =
  Array.isArray(pidAnalysis?.summary) &&
  pidAnalysis.summary.length > 0
    ? pidAnalysis.summary
        .map(
          (summaryItem) =>
            `<div>• ${summaryItem}</div>`
        )
        .join("")
    : "<div>No PID summary available.</div>";
    const pidScoreExplanationHtml =
  Array.isArray(pidAnalysis?.scoreExplanation) &&
  pidAnalysis.scoreExplanation.length > 0
    ? pidAnalysis.scoreExplanation
        .map(
          (explanation) =>
            `<div>• ${explanation}</div>`
        )
        .join("")
    : "<div>No score explanation available.</div>";
const pidAxisOverviewHtml =
  Array.isArray(
    pidAnalysis?.technicalSummary?.axisStatus
  ) &&
  pidAnalysis.technicalSummary.axisStatus.length > 0
    ? pidAnalysis.technicalSummary.axisStatus
        .map((axisResult) => {
          const trackingErrorText =
            Number.isFinite(
              axisResult.trackingError
            )
              ? axisResult.trackingError.toFixed(2)
              : "Unavailable";

          return `
            <div>
              • ${axisResult.axis}: Tracking error ${trackingErrorText} —
              Command balance ${axisResult.commandBalanceStatus}
            </div>
          `;
        })
        .join("")
    : "<div>No axis overview available.</div>";
const pidTechnicalFindingsHtml =
  Array.isArray(pidAnalysis?.findings) &&
  pidAnalysis.findings.length > 0
    ? pidAnalysis.findings
        .map(
          (finding) =>
            `<div>• ${finding}</div>`
        )
        .join("")
    : "<div>No technical findings available.</div>";

pidAnalysisFindings.innerHTML = `
  <div>
    <strong>Summary</strong>
  </div>

  ${pidSummaryHtml}
<div style="margin-top: 14px;">
  <strong>Score Explanation</strong>
</div>

${pidScoreExplanationHtml}

<div style="margin-top: 14px;">
  <strong>Axis Overview</strong>
</div>

${pidAxisOverviewHtml}
  <details style="margin-top: 16px;">
    <summary>
      <strong>Technical Findings</strong>
    </summary>

    <div style="margin-top: 10px;">
      ${pidTechnicalFindingsHtml}
    </div>
  </details>
`;

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