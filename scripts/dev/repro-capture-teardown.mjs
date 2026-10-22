/**
 * Linux-only, offline native reproduction for SM-072. Uses the locked production
 * packages, NOT the development Playwright browser. Run with `ulimit -c 0` to
 * observe exit signals without leaving large core files. No customer URL/data.
 *
 * node scripts/dev/repro-capture-teardown.mjs [owned-contexts|browser-close-only|multi-process] [runs] [--webgl]
 */
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";

if (process.platform !== "linux") throw new Error("Use Linux with the production Chromium binary");
const mode = process.argv[2] ?? "owned-contexts";
if (!["owned-contexts", "browser-close-only", "multi-process"].includes(mode))
  throw new Error("Unknown mode");
const runs = Number(process.argv[3] ?? 3);
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error("Runs must be 1..10");
if (process.argv[4] && process.argv[4] !== "--webgl") throw new Error("Unknown probe option");
// Extract into a test-owned directory, never reuse/remove another capture's
// /tmp/chromium or profiles. Enable the package's bundled AL2023 libraries.
const probeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "sajtmaskin-teardown-"));
process.env.TMPDIR = probeTmp;
process.env.VERCEL = "1";

let phase = "setup";
let run = 0;
const report = (event, data = {}) =>
  console.log(JSON.stringify({ run, mode, phase, event, ...data }));
const originalSpawn = childProcess.spawn;
childProcess.spawn = function (command, ...args) {
  const child = originalSpawn.call(this, command, ...args);
  if (String(command).endsWith("/chromium")) {
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-8_000);
    });
    report("spawn", { pid: child.pid });
    child.once("exit", (code, signal) => {
      report("native-exit", { pid: child.pid, code, signal, ...(code !== 0 ? { stderr } : {}) });
      if (code !== 0) process.exitCode = 1;
    });
    // This watchdog targets only the process spawned by this offline test.
    const watchdog = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.once("exit", () => clearTimeout(watchdog));
  }
  return child;
};
syncBuiltinESMExports();

try {
  const [{ default: chromium }, { chromium: pw }] = await Promise.all([
    import("@sparticuz/chromium"),
    import("playwright-core"),
  ]);
  const args =
    mode === "multi-process"
      ? chromium.args.filter((arg) => arg !== "--single-process")
      : chromium.args;
  report("runtime", { node: process.version, singleProcess: args.includes("--single-process") });
  for (run = 1; run <= runs; run++) {
    let browser;
    try {
      phase = "launch";
      browser = await pw.launch({
        args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
      browser.on("disconnected", () => report("disconnected"));
      report("launched", { version: browser.version() });
      phase = "desktop";
      const desktop = await browser.newPage({ serviceWorkers: "block" });
      await desktop.setViewportSize({ width: 1280, height: 900 });
      await desktop.setContent("<h1>Offline teardown probe</h1>");
      if (process.argv[4] === "--webgl") {
        const rendered = await desktop.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 32;
          const gl = canvas.getContext("webgl2");
          if (!gl) return false;
          gl.clearColor(0.2, 0.5, 0.8, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          document.body.append(canvas);
          return gl.getError() === gl.NO_ERROR;
        });
        report("webgl2", { rendered });
        if (!rendered) throw new Error("WebGL2 probe did not render");
      }
      await desktop.screenshot({ type: "jpeg" });
      phase = "mobile";
      const mobile = await browser.newPage({ serviceWorkers: "block" });
      await mobile.setViewportSize({ width: 375, height: 667 });
      await mobile.setContent("<h1>Offline teardown probe</h1>");
      await mobile.screenshot({ type: "jpeg" });
      for (const [name, target] of mode === "browser-close-only"
        ? []
        : [
            ["mobile.close", mobile],
            ["desktop.close", desktop],
          ]) {
        phase = name;
        report("before-close", { connected: browser.isConnected() });
        try {
          await target.close();
          report("after-close", { connected: browser.isConnected() });
        } catch (error) {
          report("close-error", { message: error.message.slice(0, 500) });
        }
      }
    } catch (error) {
      report("error", { message: error.message.slice(-2000) });
      process.exitCode = 1;
    } finally {
      phase = "browser.close";
      if (browser) {
        report("before-close", { connected: browser.isConnected() });
        try {
          await browser.close();
          report("after-close", { connected: browser.isConnected() });
        } catch (error) {
          report("close-error", { message: error.message.slice(0, 500) });
          process.exitCode = 1;
        }
      }
    }
  }
} finally {
  childProcess.spawn = originalSpawn;
  syncBuiltinESMExports();
  fs.rmSync(probeTmp, { recursive: true, force: true });
}
