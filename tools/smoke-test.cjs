const { _electron } = require("playwright-core");

(async () => {
  const app = await _electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: { ...process.env }
  });

  const window = await app.firstWindow();

  const errors = [];
  window.on("console", (msg) => {
    if (msg.type() === "error") errors.push("CONSOLE: " + msg.text());
  });
  window.on("pageerror", (err) => errors.push("PAGEERROR: " + err.message));

  await window.waitForTimeout(1500);

  console.log("title:", await window.title());
  console.log("has blackboxLab bridge:", await window.evaluate(() => !!window.blackboxLab));

  // Click "Try a Sample Flight"
  await window.click("#trySampleButton");
  await window.waitForTimeout(4000);

  console.log("fileStatus:", await window.textContent("#fileStatus"));
  console.log("verdict hidden:", await window.evaluate(() => document.getElementById("verdictCard").hidden));
  console.log("verdict cards:", await window.evaluate(() => document.querySelectorAll(".verdict-item").length));
  console.log("summaryFileName:", await window.textContent("#summaryFileName"));

  if (errors.length) {
    console.log("\n==== ERRORS ====");
    for (const e of errors) console.log(e);
  } else {
    console.log("\nno console/page errors");
  }

  await app.close();
})().catch((e) => { console.error("DRIVER FAILED:", e.message); process.exit(1); });
