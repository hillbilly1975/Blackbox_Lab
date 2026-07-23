const { _electron } = require("playwright-core");
(async () => {
  const app = await _electron.launch({ args: ["."], cwd: process.cwd() });
  const page = await app.firstWindow();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.waitForTimeout(2000);
  await page.locator("#logFileInput").setInputFiles(
    "/home/offenbeck1/egodrift/docs/reports/blackbox/bell_222ut_20260722_171454.bbl");
  await page.waitForTimeout(25000); // big log
  const counts = await page.evaluate(() => {
    const res = {};
    for (const id of ["chartGyro","chartSpectrum","chartGovernor","chartEsc","chartBattery","chartThrottle","chartTracking","chartHeadspeed","chartPower"]) {
      const elx = document.getElementById(id);
      const canv = elx ? elx.querySelector("canvas") : null;
      res[id] = canv ? `${canv.width}x${canv.height}` : (elx ? (elx.textContent||"").slice(0,40) : "MISSING");
    }
    return res;
  });
  console.log(JSON.stringify(counts, null, 1));
  console.log("pageerrors:", errs.length ? errs : "none");
  for (const nav of ["filter","governor"]) {
    await page.click(`.nav-button[data-target="${nav}"]`);
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: "smoke-shots/real-governor.png" });
  await app.close();
})();
