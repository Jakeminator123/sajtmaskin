import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { WINDOWS_SANDBOX_MODE, reviewerEnv, command, validateSandboxProbeEvidence } from "./bugpass.mjs";

// Exercise the OS sandbox directly: no model request, repository execution or provider secrets.
if (process.platform !== "win32") throw new Error("This probe verifies the Windows runtime only.");
const scratch = mkdtempSync(join(tmpdir(), "sajtmaskin-sandbox-probe-"));
const marker = join(scratch, "denied-write.txt");
const readable = join(scratch, "readable-canary.txt");
const nonce = randomUUID();
writeFileSync(readable, nonce);
const cli = command("codex", ["--version"], { env: reviewerEnv(process.env) });
let requests = 0;
const server = createServer((_req, res) => { requests++; res.end(nonce); });
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const url = `http://127.0.0.1:${server.address().port}/sandbox-probe`;

async function run(args) {
  return new Promise((done) => {
    const child = spawn("codex", ["sandbox", "-P", ":read-only", "-c",
      `windows.sandbox="${WINDOWS_SANDBOX_MODE}"`, "-C", scratch, ...args], {
      cwd: scratch, env: reviewerEnv(process.env), stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill(), 30000);
    child.on("error", (error) => { clearTimeout(timer); done({ error: error.message, stdout, stderr }); });
    child.on("close", (code, signal) => { clearTimeout(timer); done({ code, signal, stdout, stderr }); });
  });
}

try {
  const control = await (await fetch(url, { signal: AbortSignal.timeout(5000) })).text();
  requests = 0;
  const shell = process.env.PWSH || "pwsh.exe";
  const read = await run([shell, "-NoProfile", "-Command", `Get-Content -LiteralPath '${readable.replaceAll("'", "''")}'`]);
  const write = await run([shell, "-NoProfile", "-Command",
    `try { Set-Content -LiteralPath '${marker.replaceAll("'", "''")}' -Value 'canary' -ErrorAction Stop; exit 0 } catch { Write-Error -Message $_.CategoryInfo.Category; exit 17 }`]);
  const network = await run(["curl.exe", "--noproxy", "*", "--max-time", "5", url]);
  const evidence = { cli, sandbox: WINDOWS_SANDBOX_MODE, scratch, nonce, control,
    read, write, network, markerExists: existsSync(marker), requests };
  const receipt = join(scratch, "probe.json");
  writeFileSync(receipt, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ receipt, ...evidence }, null, 2));
  validateSandboxProbeEvidence(evidence);
  console.log("Sandbox verified: can read; cannot write or reach the local control endpoint. No model call.");
} catch (error) {
  console.error(`Sandbox probe failed/inconclusive: ${error.message}. Do not change the version pin.`);
  process.exitCode = 1;
} finally {
  await new Promise((done) => server.close(done));
}
