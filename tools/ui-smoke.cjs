// ======================================================
// BLACKBOX LAB — UI SMOKE TEST (Playwright drives the
// real Electron app; screenshots land in smoke-shots/)
// Run:  node tools/ui-smoke.cjs
// ======================================================

const { _electron } = require("playwright-core");
const { mkdirSync } = require("node:fs");

(async () => {
  mkdirSync("smoke-shots", { recursive: true });

  const app = await _electron.launch({ args: ["."], cwd: process.cwd() });
  const window = await app.firstWindow();

  const errors = [];
  window.on("pageerror", (err) => errors.push("PAGEERROR: " + err.message));

  await window.waitForTimeout(1200);
  await window.setViewportSize?.({ width: 1280, height: 900 }).catch(() => {});

  // ---- load the sample flight ----
  // First launch shows the data-sharing consent ask now that the
  // ingest endpoint is configured — answer it before anything else.
  if (await window.isVisible("#contributeAsk")) {
    await window.click("#askNo");
    console.log("consent ask shown and dismissed");
  }

  await window.click("#welcomeSampleButton");
  // The sample is a real 134k-frame flight now — give the
  // decoder time before asserting.
  await window.waitForTimeout(15000);

  const verdictCount = await window.evaluate(
    () => document.querySelectorAll(".verdict-item").length
  );
  console.log("verdict cards:", verdictCount);
  await window.screenshot({ path: "smoke-shots/01-verdict.png" });

  // ---- evidence zoom: click the vibration card's jump ----
  
  // Regression guard: charts must actually have scaled data —
  // a null x-scale means uPlot never autoscaled (blank charts).
  const chartState = await window.evaluate(() => {
    const el = document.getElementById("chartGyro");
    const u = el && el.__blackboxLabChart;
    return u ? { xMin: u.scales.x.min, xMax: u.scales.x.max, len: u.data[0].length } : null;
  });
  if (!chartState || chartState.xMin == null || chartState.xMax <= chartState.xMin) {
    throw new Error("chart x-scale not computed: " + JSON.stringify(chartState));
  }
  console.log("chart scale ok:", JSON.stringify(chartState));

  // Same guard for the per-axis tuning preset grid — all nine
  // charts must exist with scaled data (they render even while
  // their advanced blocks are hidden in beginner mode).
  const presetState = await window.evaluate(() => {
    const ids = [
      "chartTracking", "chartTrackingPitch", "chartTrackingYaw",
      "chartFfRoll", "chartFfPitch", "chartFfYaw",
      "chartTermsRoll", "chartTermsPitch", "chartTermsYaw"
    ];
    return ids.map((id) => {
      const el = document.getElementById(id);
      const u = el && el.__blackboxLabChart;
      return {
        id,
        ok: Boolean(u && u.scales.x.min != null && u.scales.x.max > u.scales.x.min)
      };
    });
  });
  const badPresets = presetState.filter((entry) => !entry.ok);
  if (badPresets.length) {
    throw new Error("preset charts without scaled data: " +
      badPresets.map((entry) => entry.id).join(", "));
  }
  console.log("preset grid ok: 9/9 charts scaled");

  await window.click(".verdict-jump");
  await window.waitForTimeout(600);
  await window.screenshot({ path: "smoke-shots/02-filter-zoomed.png" });

  // ---- walk the labs ----
  for (const [target, name] of [
    ["viewer", "03-viewer"],
    ["governor", "04-governor"],
    ["esc", "05-esc"],
    ["battery", "06-battery"],
    ["guide", "07-guide"]
  ]) {
    await window.click(`.nav-button[data-target="${target}"]`);
    await window.waitForTimeout(450);
    await window.screenshot({ path: `smoke-shots/${name}.png` });
  }

  // ---- compare with the clean sample ----
  await window.click('.nav-button[data-target="compare"]');
  await window.waitForTimeout(300);
  await window.click("#compareSampleButton");
  await window.waitForTimeout(3500);

  const compareRowCount = await window.evaluate(
    () => document.querySelectorAll(".compare-row").length
  );
  const compareSummary = await window.textContent("#compareSummary");
  console.log("compare rows:", compareRowCount, "| summary:", compareSummary);
  await window.screenshot({ path: "smoke-shots/08-compare.png" });

  // ---- multi-flight "after" file: the flight picker ----
  // Two known samples concatenated = one file, two flights.
  const twoFlightPath = require("node:path").join(
    require("node:os").tmpdir(),
    "bbl-smoke-two-flights.bbl"
  );
  require("node:fs").writeFileSync(
    twoFlightPath,
    Buffer.concat([
      require("node:fs").readFileSync("samples/sample-clean-tuned.bbl"),
      require("node:fs").readFileSync("samples/sample-vibration-problem.bbl")
    ])
  );
  await window.setInputFiles("#compareFileInput", twoFlightPath);
  await window.waitForSelector("#compareFlightPicker:not([hidden])", {
    timeout: 15000
  });
  const pickerState = await window.evaluate(() => ({
    options: document.getElementById("compareFlightSelect").options.length,
    selected: document.getElementById("compareFlightSelect").value,
    summary: document.getElementById("compareSummary").textContent,
    rows: document.getElementById("compareRows").innerText
  }));
  if (pickerState.options !== 2 || !pickerState.summary) {
    throw new Error(
      "compare flight picker misbehaved: " + JSON.stringify(pickerState)
    );
  }
  // Flip to the other flight — the comparison must re-render
  // with THAT flight's numbers (clean vs vibration sample, so
  // the row values must actually change).
  const otherFlight = pickerState.selected === "0" ? "1" : "0";
  await window.selectOption("#compareFlightSelect", otherFlight);
  await window.waitForTimeout(2500);
  const flippedRows = await window.evaluate(
    () => document.getElementById("compareRows").innerText
  );
  if (!flippedRows || flippedRows === pickerState.rows) {
    throw new Error(
      "comparison did not re-render with the picked flight's data"
    );
  }
  console.log(
    "compare flight picker ok:",
    pickerState.options,
    "flights | flipped to",
    otherFlight,
    "| rows changed:",
    flippedRows !== pickerState.rows
  );
  await window.screenshot({ path: "smoke-shots/08b-compare-picker.png" });

  // ---- load-from-another-screen: progress dialog ----
  await window.click('.nav-button[data-target="viewer"]');
  await window.waitForTimeout(300);
  await window.setInputFiles("#logFileInput", "samples/sample-clean-tuned.bbl");
  await window.waitForSelector("#loadProgress:not([hidden])", { timeout: 5000 });
  await window.waitForSelector("#loadProgressActions:not([hidden])", { timeout: 30000 });
  const loadTitle = await window.textContent("#loadProgressTitle");
  await window.click("#loadStayHere");
  const overlayState = await window.evaluate(() => ({
    overlayHidden: document.getElementById("loadProgress").hidden,
    screen: document.querySelector("[data-screen].screen-active")?.dataset.screen
  }));
  if (!overlayState.overlayHidden || overlayState.screen !== "viewer") {
    throw new Error("load progress dialog misbehaved: " + JSON.stringify(overlayState));
  }
  console.log("load progress dialog ok:", loadTitle, "| stayed on:", overlayState.screen);

  // ---- health record ----
  await window.click('.nav-button[data-target="history"]');
  await window.waitForTimeout(450);
  const historyNote = await window.textContent("#historyNote");
  console.log("history note:", historyNote);
  await window.screenshot({ path: "smoke-shots/09-history.png" });

  if (errors.length) {
    console.log("\n==== ERRORS ====");
    for (const error of errors) console.log(error);
    process.exitCode = 1;
  } else {
    console.log("\nSMOKE TEST PASSED — no page errors");
  }

  await app.close();
})().catch((error) => {
  console.error("DRIVER FAILED:", error.message);
  process.exit(1);
});
