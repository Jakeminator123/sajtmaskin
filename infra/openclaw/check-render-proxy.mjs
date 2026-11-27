import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, request } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

test("Render ingress uses the TCP peer and preserves HTTP streaming and upgrades", { timeout: 20_000 }, async (t) => {
  let finishEvent;
  const upstream = createServer((req, res) => {
    if (req.url === "/events") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      finishEvent = () => res.end("data: done\n\n");
      res.write("data: first\n\n");
      return;
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(req.headers));
  });
  upstream.on("upgrade", (req, socket) => {
    if (req.headers.upgrade !== "websocket") return socket.destroy();
    socket.write("HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n");
    socket.on("error", () => socket.destroy());
    socket.on("end", () => socket.end());
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });

  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const scratch = mkdtempSync(path.join(tmpdir(), "sajtagenten-ingress-"));
  const caddy = spawn(process.env.CADDY_BIN || "caddy", ["run", "--config", process.env.CADDYFILE || "/etc/sajtagenten/Caddyfile"], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      HOME: scratch,
      APPDATA: scratch,
      XDG_DATA_HOME: scratch,
      XDG_CONFIG_HOME: scratch,
      SAJTAGENT_LISTEN_PORT: String(port),
      SAJTAGENT_INTERNAL_PORT: String(upstream.address().port),
    },
    cwd: scratch,
    windowsHide: true,
    stdio: "ignore",
  });
  await once(caddy, "spawn");
  t.after(async () => {
    if (caddy.exitCode === null && caddy.signalCode === null) {
      const stopped = once(caddy, "close");
      caddy.kill("SIGTERM");
      await stopped;
    }
    rmSync(scratch, { recursive: true, force: true });
  });
  const origin = "http://127.0.0.1:" + port;
  const deadline = Date.now() + 9_000;
  while (true) {
    try { await (await fetch(origin)).text(); break; }
    catch (error) {
      if (Date.now() >= deadline || caddy.exitCode !== null) throw error;
      await delay(50);
    }
  }

  const result = await fetch(origin, { headers: {
    authorization: "Bearer synthetic-token",
    origin: "https://fixture.example",
    "x-openclaw-session-key": "synthetic-session",
    "x-forwarded-for": "198.51.100.7, 192.0.2.1",
    "x-forwarded-client-cert": "unverified",
    forwarded: "for=198.51.100.7",
    "x-real-ip": "198.51.100.7",
    "cf-connecting-ip": "198.51.100.7",
    "true-client-ip": "198.51.100.7",
    "tailscale-user-login": "unverified",
  } });
  const headers = await result.json();
  assert.equal(headers["x-forwarded-for"], "127.0.0.1");
  assert.equal(headers.authorization, "Bearer synthetic-token");
  assert.equal(headers.origin, "https://fixture.example");
  assert.equal(headers["x-openclaw-session-key"], "synthetic-session");
  for (const name of ["forwarded", "x-real-ip", "x-forwarded-client-cert", "cf-connecting-ip", "true-client-ip", "tailscale-user-login"]) {
    assert.equal(headers[name], undefined, name);
  }

  const response = await fetch(origin + "/events", { signal: AbortSignal.timeout(3_000) });
  const reader = response.body.getReader();
  try {
    const first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), "data: first\n\n");
  } finally { finishEvent(); }
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: done\n\n");

  const upgrade = request(origin, { headers: { connection: "Upgrade", upgrade: "websocket" } });
  const upgraded = once(upgrade, "upgrade");
  upgrade.end();
  const [switching, socket] = await upgraded;
  assert.equal(switching.statusCode, 101);
  socket.destroy();
});
