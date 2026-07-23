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
  await window.waitForTimeout(3500);

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
