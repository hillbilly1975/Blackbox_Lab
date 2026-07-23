// ======================================================
// BLACKBOX LAB — CHARTS
// ======================================================
//
// Thin wrappers around uPlot (vendored, MIT) so every Lab
// can show a chart with one call. Charts are the teaching
// layer: show the pilot the story, then explain it.
//
//   renderTimeSeriesChart(element, {
//     timeSeconds, series: [{ label, values, color }]
//   });
//
//   renderSpectrumChart(element, spectrum, { label });
//
// ======================================================

import uPlot from "../vendor/uplot/uPlot.esm.js";

// Colorblind-safe series palette tuned for dark surfaces.
export const CHART_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // green-aqua
  "#c98500", // amber
  "#d55181", // magenta
  "#9085e9" // violet
];

const AXIS_STYLE = {
  stroke: "#8ea6cc",
  grid: { stroke: "rgba(127, 183, 255, 0.08)", width: 1 },
  ticks: { stroke: "rgba(127, 183, 255, 0.18)", width: 1 }
};

function destroyExistingChart(element) {
  if (element.__blackboxLabChart) {
    element.__blackboxLabChart.destroy();
    element.__blackboxLabChart = null;
  }

  element.innerHTML = "";
}

function watchResize(element, chart) {
  if (element.__blackboxLabResizeObserver) {
    element.__blackboxLabResizeObserver.disconnect();
  }

  const observer = new ResizeObserver(() => {
    // A hidden screen reports width 0 — resizing to that
    // would wipe the chart's pixels (and empty the images
    // embedded in HTML reports). Keep the last real size.
    if (element.clientWidth > 0) {
      chart.setSize({
        width: element.clientWidth,
        height: chart.height
      });
    }
  });

  observer.observe(element);
  element.__blackboxLabResizeObserver = observer;
}

// ------------------------------------------------------
// Time series (x axis in seconds of flight time)
// ------------------------------------------------------
export function renderTimeSeriesChart(element, options) {
  const {
    timeSeconds,
    series,
    height = 260,
    yLabel = "",
    xLabel = "Flight time (s)",
    markers = []
  } = options;

  destroyExistingChart(element);

  const data = [
    Float64Array.from(timeSeconds),
    ...series.map((entry) => Float64Array.from(entry.values))
  ];

  const chart = new uPlot(
    {
      width: element.clientWidth || 640,
      height,
      padding: [12, 8, 0, 0],
      cursor: {
        drag: { x: true, y: false },
        points: { size: 7 }
      },
      hooks: {
        draw: [
          (u) => {
            if (!markers.length) {
              return;
            }

            const ctx = u.ctx;
            ctx.save();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            ctx.fillStyle = "#dce8ff";
            ctx.setLineDash([4, 4]);
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";

            for (const marker of markers) {
              const x = u.valToPos(marker.x, "x", true);

              if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) {
                continue;
              }

              ctx.beginPath();
              ctx.moveTo(x, u.bbox.top);
              ctx.lineTo(x, u.bbox.top + u.bbox.height);
              ctx.stroke();
              ctx.fillText(marker.label, x, u.bbox.top + 14);
            }

            ctx.restore();
          }
        ]
      },
      scales: {
        x: { time: false }
      },
      axes: [
        {
          ...AXIS_STYLE,
          label: xLabel,
          labelSize: 22
        },
        {
          ...AXIS_STYLE,
          label: yLabel,
          labelSize: yLabel ? 22 : 8,
          size: 62
        }
      ],
      series: [
        {
          label: xLabel === "Flight time (s)" ? "t (s)" : xLabel,
          value: (self, value) =>
            value == null ? "--" : value.toFixed(2)
        },
        ...series.map((entry, index) => ({
          label: entry.label,
          stroke: entry.color ?? CHART_COLORS[index % CHART_COLORS.length],
          width: 1.4,
          points: { show: false },
          value: (self, value) =>
            value == null ? "--" : String(Math.round(value * 100) / 100)
        }))
      ]
    },
    data,
    element
  );

  element.__blackboxLabChart = chart;
  watchResize(element, chart);

  return chart;
}

// ------------------------------------------------------
// Noise spectrum (frequency domain)
// ------------------------------------------------------
export function renderSpectrumChart(element, spectra, options = {}) {
  const { height = 260, markers = [] } = options;

  destroyExistingChart(element);

  const first = spectra[0];

  const data = [
    Float64Array.from(first.spectrum.frequencies),
    ...spectra.map((entry) => Float64Array.from(entry.spectrum.magnitudes))
  ];

  const chart = new uPlot(
    {
      width: element.clientWidth || 640,
      height,
      padding: [12, 8, 0, 0],
      cursor: { drag: { x: true, y: false } },
      hooks: {
        draw: [
          (u) => {
            if (!markers.length) {
              return;
            }

            const ctx = u.ctx;
            ctx.save();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
            ctx.fillStyle = "#dce8ff";
            ctx.setLineDash([4, 4]);
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";

            for (const marker of markers) {
              const x = u.valToPos(marker.hz, "x", true);

              if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) {
                continue;
              }

              ctx.beginPath();
              ctx.moveTo(x, u.bbox.top);
              ctx.lineTo(x, u.bbox.top + u.bbox.height);
              ctx.stroke();
              ctx.fillText(marker.label, x, u.bbox.top + 14);
            }

            ctx.restore();
          }
        ]
      },
      scales: {
        x: { time: false }
      },
      axes: [
        {
          ...AXIS_STYLE,
          label: "Frequency (Hz)",
          labelSize: 22
        },
        {
          ...AXIS_STYLE,
          label: "Noise amplitude",
          labelSize: 22,
          size: 62
        }
      ],
      series: [
        {
          label: "Hz",
          value: (self, value) =>
            value == null ? "--" : value.toFixed(0)
        },
        ...spectra.map((entry, index) => ({
          label: entry.label,
          stroke: entry.color ?? CHART_COLORS[index % CHART_COLORS.length],
          width: 1.4,
          points: { show: false },
          value: (self, value) =>
            value == null ? "--" : value.toFixed(2)
        }))
      ]
    },
    data,
    element
  );

  element.__blackboxLabChart = chart;
  watchResize(element, chart);

  return chart;
}
