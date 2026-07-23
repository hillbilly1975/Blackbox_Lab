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
// Raw log columns are numbered, not named — translate the
// number into the axis a pilot thinks in. RF axis order:
// 0 = Roll, 1 = Pitch, 2 = Yaw, 3 = Collective.
const AXIS_NAMES = ["Roll", "Pitch", "Yaw", "Collective"];

export function friendlySeriesLabel(name) {
  const match = String(name).match(/^([A-Za-z]+)\[(\d)\]$/);
  if (!match) return name;

  const axis = AXIS_NAMES[Number(match[2])];
  if (!axis) return name;

  const base = match[1];
  if (/^gyroADC$/i.test(base)) return `${axis} gyro (filtered)`;
  if (/^(gyroRAW|gyroUnfilt)$/i.test(base)) return `${axis} gyro (raw)`;
  if (/^setpoint$/i.test(base)) return `${axis} target`;
  if (/^axis([PIDF])$/i.test(base)) {
    return `${axis} ${base.slice(-1).toUpperCase()}-term`;
  }
  if (/^rcCommand$/i.test(base)) return `${axis} stick`;
  return name;
}

const WHOLE_NAME_LABELS = {
  headspeed: "Headspeed",
  govTarget: "Governor target",
  vbatLatest: "Pack voltage",
  Vbat: "Pack voltage"
};

export function friendlyLabel(name) {
  return WHOLE_NAME_LABELS[name] ?? friendlySeriesLabel(name);
}

// Min/max of each visible series, recomputed on every zoom.
function computeVisibleStats(u, seriesMeta) {
  const xs = u.data[0];
  const xMin = u.scales.x.min;
  const xMax = u.scales.x.max;
  const stats = [];

  for (let s = 0; s < seriesMeta.length && s < 3; s += 1) {
    const ys = u.data[s + 1];
    let min = Infinity;
    let max = -Infinity;
    let minX = null;
    let maxX = null;

    for (let i = 0; i < xs.length; i += 1) {
      if (xs[i] < xMin || xs[i] > xMax) continue;
      const value = ys[i];
      if (value == null) continue;
      if (value < min) { min = value; minX = xs[i]; }
      if (value > max) { max = value; maxX = xs[i]; }
    }

    if (minX !== null) {
      stats.push({
        label: seriesMeta[s].label,
        color: seriesMeta[s].color,
        min, minX, max, maxX
      });
    }
  }

  return stats;
}

const fmt = (value) =>
  Math.abs(value) >= 100
    ? String(Math.round(value))
    : String(Math.round(value * 10) / 10);

function buildChartFooter(element, chart, seriesMeta, { withStats }) {
  const footer = document.createElement("div");
  footer.className = "chart-footer";

  const stats = document.createElement("div");
  stats.className = "chart-stats";
  footer.appendChild(stats);

  const hint = document.createElement("div");
  hint.className = "chart-footer-hint";
  hint.textContent = "drag to zoom · double-click to reset";
  footer.appendChild(hint);

  element.appendChild(footer);

  if (!withStats) return;

  const refresh = () => {
    const visible = computeVisibleStats(chart, seriesMeta);
    stats.innerHTML = visible
      .map(
        (entry) =>
          `<span class="chart-stat"><i style="background:${entry.color}"></i>` +
          `${entry.label}: ` +
          `<b>▾ ${fmt(entry.min)}</b> @ ${entry.minX.toFixed(1)}s · ` +
          `<b>▴ ${fmt(entry.max)}</b> @ ${entry.maxX.toFixed(1)}s</span>`
      )
      .join("");
  };

  // uPlot only creates hook arrays declared in its options —
  // make sure the slot exists before subscribing.
  chart.hooks.setScale = chart.hooks.setScale || [];
  chart.hooks.setScale.push((u, key) => {
    if (key === "x") refresh();
  });
  refresh();
}

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

  const seriesMeta = series.map((entry, index) => ({
    label: friendlyLabel(entry.label),
    color: entry.color ?? CHART_COLORS[index % CHART_COLORS.length]
  }));

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
          // Small dots on each visible series' min and max —
          // they move with the zoom window.
          (u) => {
            const ctx = u.ctx;
            ctx.save();
            for (const entry of computeVisibleStats(u, seriesMeta)) {
              for (const point of [
                [entry.minX, entry.min],
                [entry.maxX, entry.max]
              ]) {
                const x = u.valToPos(point[0], "x", true);
                const y = u.valToPos(point[1], "y", true);
                ctx.beginPath();
                ctx.arc(x, y, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = entry.color;
                ctx.fill();
                ctx.strokeStyle = "rgba(7, 11, 18, 0.9)";
                ctx.lineWidth = 1.5;
                ctx.stroke();
              }
            }
            ctx.restore();
          },
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
          label: friendlyLabel(entry.label),
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
  buildChartFooter(element, chart, seriesMeta, { withStats: true });

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

            let labelRow = 0;
            let lastLabelX = -Infinity;

            for (const marker of markers) {
              const x = u.valToPos(marker.hz, "x", true);

              if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) {
                continue;
              }

              ctx.beginPath();
              ctx.moveTo(x, u.bbox.top);
              ctx.lineTo(x, u.bbox.top + u.bbox.height);
              ctx.stroke();

              // Stagger labels vertically when peaks crowd
              // together, so they never overprint each other.
              if (x - lastLabelX < 150) {
                labelRow = (labelRow + 1) % 3;
              } else {
                labelRow = 0;
              }

              lastLabelX = x;
              ctx.fillText(marker.label, x, u.bbox.top + 14 + labelRow * 15);
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
          label: friendlyLabel(entry.label),
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
  buildChartFooter(element, chart, [], { withStats: false });

  return chart;
}
