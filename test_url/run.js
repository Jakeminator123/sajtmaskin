#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { URL } = require("url");

const DEFAULT_PORT = Number(process.env.TEST_URL_PORT || 4173);
const DEFAULT_PROBE_TIMEOUT_MS = 8000;
const MAIN_APP_ORIGIN = process.env.MAIN_APP_ORIGIN || "http://localhost:3000";
const LOG_DIR = path.join(__dirname, "logs");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function logToFile(entry) {
  ensureLogDir();
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const filePath = path.join(LOG_DIR, `${dateStr}.log`);
  const ts = now.toISOString();
  const line = `[${ts}] ${typeof entry === "string" ? entry : JSON.stringify(entry)}\n`;
  fs.appendFileSync(filePath, line, "utf8");
}

function printHelp() {
  console.log(`
test_url iframe lab

Usage:
  node run.js [options]
  npm run dev

Options:
  --port <number>      Port (default: ${DEFAULT_PORT})
  --url <url>          Preload URL
  --app <origin>       Main app origin (default: ${MAIN_APP_ORIGIN})
  --no-open            Do not auto-open browser
  --help               Show this help
`);
}

function parseArgs(argv) {
  const options = { port: DEFAULT_PORT, open: true, url: "", appOrigin: MAIN_APP_ORIGIN };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { printHelp(); process.exit(0); }
    if (arg === "--no-open") { options.open = false; continue; }
    if (arg === "--port" && argv[i + 1]) { options.port = Number(argv[++i]) || DEFAULT_PORT; continue; }
    if (arg === "--url" && argv[i + 1]) { options.url = argv[++i]; continue; }
    if (arg === "--app" && argv[i + 1]) { options.appOrigin = argv[++i]; continue; }
  }
  return options;
}

function normalizeTargetUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch { return null; }
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      spawn(`start "" "${url}"`, { shell: true, stdio: "ignore", detached: true }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
  } catch (e) { console.warn("[test_url] Could not open browser:", e); }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function proxyToMainApp(appOrigin, targetPath, method, body, cookieHeader) {
  const targetUrl = `${appOrigin}${targetPath}`;
  const headers = { "Content-Type": "application/json" };
  if (cookieHeader) headers["cookie"] = cookieHeader;
  logToFile(`PROXY ${method} ${targetUrl}`);

  return fetch(targetUrl, {
    method,
    headers,
    body: method === "GET" ? undefined : body,
    redirect: "follow",
  });
}

function startServer() {
  const options = parseArgs(process.argv.slice(2));
  const indexPath = path.join(__dirname, "index.html");

  if (!fs.existsSync(indexPath)) {
    console.error("[test_url] Missing:", indexPath);
    process.exit(1);
  }

  ensureLogDir();
  logToFile("=== Server started ===");

  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://localhost");

    // --- Log endpoint (POST) ---
    if (requestUrl.pathname === "/log" && req.method === "POST") {
      try {
        const body = await readBody(req);
        logToFile(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(500); res.end('{"ok":false}');
      }
      return;
    }

    // --- Get logs (GET) ---
    if (requestUrl.pathname === "/logs") {
      try {
        const now = new Date();
        const dateStr = requestUrl.searchParams.get("date") || now.toISOString().slice(0, 10);
        const filePath = path.join(LOG_DIR, `${dateStr}.log`);
        const tail = Number(requestUrl.searchParams.get("tail")) || 100;
        if (!fs.existsSync(filePath)) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ lines: [] }));
          return;
        }
        const content = fs.readFileSync(filePath, "utf8");
        const allLines = content.split("\n").filter(Boolean);
        const lines = allLines.slice(-tail);
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ lines }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      }
      return;
    }

    // --- Proxy: login ---
    if (requestUrl.pathname === "/api/login" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const upstream = await proxyToMainApp(options.appOrigin, "/api/auth/login", "POST", body);
        const data = await upstream.text();
        const setCookies = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : [];
        const resHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
        if (setCookies.length > 0) resHeaders["x-set-cookies"] = JSON.stringify(setCookies);
        logToFile(`LOGIN response status=${upstream.status}`);
        res.writeHead(upstream.status, resHeaders);
        res.end(data);
      } catch (e) {
        logToFile(`LOGIN error: ${e}`);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Proxy failed: " + e.message }));
      }
      return;
    }

    // --- Proxy: projects list ---
    if (requestUrl.pathname === "/api/projects" && req.method === "GET") {
      try {
        const cookie = req.headers.cookie || "";
        const upstream = await proxyToMainApp(options.appOrigin, "/api/projects", "GET", null, cookie);
        const data = await upstream.text();
        logToFile(`PROJECTS response status=${upstream.status}`);
        res.writeHead(upstream.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(data);
      } catch (e) {
        logToFile(`PROJECTS error: ${e}`);
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Proxy failed: " + e.message }));
      }
      return;
    }

    // --- Proxy: single project ---
    if (requestUrl.pathname.startsWith("/api/projects/") && req.method === "GET") {
      try {
        const cookie = req.headers.cookie || "";
        const upstream = await proxyToMainApp(options.appOrigin, requestUrl.pathname, "GET", null, cookie);
        const data = await upstream.text();
        logToFile(`PROJECT detail ${requestUrl.pathname} status=${upstream.status}`);
        res.writeHead(upstream.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(data);
      } catch (e) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Proxy failed: " + e.message }));
      }
      return;
    }

    // --- Probe ---
    if (requestUrl.pathname === "/probe") {
      const targetUrl = normalizeTargetUrl(requestUrl.searchParams.get("url"));
      if (!targetUrl) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Missing url" }));
        return;
      }
      const timeoutRaw = Number(requestUrl.searchParams.get("timeoutMs"));
      const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 1000 ? Math.min(timeoutRaw, 30000) : DEFAULT_PROBE_TIMEOUT_MS;
      const started = Date.now();
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const r = await fetch(targetUrl, { method: "GET", redirect: "follow", signal: ac.signal, headers: { "user-agent": "sajtmaskin-test-url-lab/1.0" } });
        clearTimeout(tid);
        const elapsed = Date.now() - started;
        logToFile(`PROBE ok=${r.ok} status=${r.status} elapsed=${elapsed}ms url=${targetUrl}`);
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ ok: r.ok, status: r.status, statusText: r.statusText, finalUrl: r.url || targetUrl, elapsedMs: elapsed }));
      } catch (e) {
        clearTimeout(tid);
        const elapsed = Date.now() - started;
        const timedOut = Boolean(e && e.name === "AbortError");
        logToFile(`PROBE fail timedOut=${timedOut} elapsed=${elapsed}ms url=${targetUrl} err=${e?.message}`);
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ ok: false, timedOut, error: timedOut ? `Timeout ${timeoutMs}ms` : String(e?.message || e), elapsedMs: elapsed }));
      }
      return;
    }

    // --- Static: index.html ---
    if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
      fs.readFile(indexPath, "utf8", (err, html) => {
        if (err) { res.writeHead(500); res.end("read error"); return; }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(html);
      });
      return;
    }

    if (requestUrl.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true}');
      return;
    }

    res.writeHead(404); res.end("Not found");
  });

  server.on("error", (e) => {
    if (e && e.code === "EADDRINUSE") { console.error(`[test_url] Port ${options.port} in use.`); process.exit(1); }
    console.error("[test_url] Error:", e); process.exit(1);
  });

  server.listen(options.port, "127.0.0.1", () => {
    const launchUrl = new URL(`http://127.0.0.1:${options.port}/`);
    if (options.url) launchUrl.searchParams.set("url", options.url);
    console.log(`[test_url] Lab running: ${launchUrl}`);
    console.log(`[test_url] Main app proxy: ${options.appOrigin}`);
    console.log(`[test_url] Logs in: ${LOG_DIR}`);
    console.log("[test_url] Ctrl+C to stop");
    if (options.open) openBrowser(launchUrl.toString());
  });

  process.on("SIGINT", () => { logToFile("=== Server stopped ==="); server.close(() => process.exit(0)); });
  process.on("SIGTERM", () => { logToFile("=== Server stopped ==="); server.close(() => process.exit(0)); });
}

startServer();
