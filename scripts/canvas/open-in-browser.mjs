#!/usr/bin/env node
/**
 * open-in-browser.mjs — bygger LLM-flödes-canvasen som fristående HTML och
 * öppnar den i standardwebbläsaren (ett kommando).
 *
 *   npm run canvas:open
 *   node scripts/canvas/open-in-browser.mjs
 *   node scripts/canvas/open-in-browser.mjs --no-open   (skriv bara filen)
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildData } from "./build-llm-flow-canvas.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const OUT_PATH = join(REPO_ROOT, ".tmp", "llm-flow-canvas.html");
const NO_OPEN = process.argv.includes("--no-open");

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toneClass(tone) {
  if (tone === "danger") return "tone-danger";
  if (tone === "warning") return "tone-warning";
  if (tone === "info") return "tone-info";
  if (tone === "success") return "tone-success";
  return "tone-neutral";
}

function renderTable(headers, rows, rowTones = []) {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const body = rows
    .map(
      (cells, i) =>
        `<tr class="${toneClass(rowTones[i] || "neutral")}">${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderHtml(data) {
  const stats = [
    ["Processer", String(data.totals.processes), "neutral"],
    ["Blockerade", String(data.totals.blocked), data.totals.blocked ? "danger" : "success"],
    ["Skakiga", String(data.totals.shaky), data.totals.shaky ? "warning" : "success"],
    ["Öppna P0", String(data.totals.openP0), data.totals.openP0 ? "danger" : "success"],
    ["Öppna P1", String(data.totals.openP1), data.totals.openP1 ? "warning" : "success"],
    [
      "Eval exact-hit",
      data.totals.evalExactHitPct == null ? "-" : `${data.totals.evalExactHitPct}%`,
      "info",
    ],
  ]
    .map(
      ([label, value, tone]) =>
        `<div class="stat ${toneClass(tone)}"><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div></div>`,
    )
    .join("");

  const legend = data.legend.map((l) => `<span class="pill">${esc(l)}</span>`).join("");

  const phases =
    data.phases.length === 0
      ? ""
      : `<section><h2>Faskedja</h2><ol class="phases">${data.phases
          .map((p) => `<li>${esc(p)}</li>`)
          .join("")}</ol></section>`;

  const processRows = data.processes.map((p) => [
    p.name,
    p.statusLabel,
    String(p.openBugs),
    String(p.churn),
    p.note,
  ]);
  const processTones = data.processes.map((p) => p.tone);

  const shaky =
    data.shaky.length === 0
      ? ""
      : `<section><h2>Skakigast just nu</h2>${data.shaky
          .map(
            (s) =>
              `<div class="callout ${toneClass(s.tone)}"><strong>${esc(s.name)} — ${esc(s.statusLabel)}</strong><p>${esc(s.reason)}</p></div>`,
          )
          .join("")}</section>`;

  const risks =
    data.topOpenRisks.length === 0
      ? ""
      : `<section><h2>Öppna huvudrisker (backlog)</h2><p class="muted">Öppna P0/BLOCKER/P1/P2-rader direkt ur BUG-SWARM-BACKLOG.md.</p>${renderTable(
          ["Prio", "Typ", "Fynd"],
          data.topOpenRisks.map((r) => [r.prio, r.blocker ? "BLOCKER" : "öppen", r.fynd]),
          data.topOpenRisks.map((r) =>
            r.prio === "P0" || r.blocker ? "danger" : r.prio === "P1" ? "warning" : "info",
          ),
        )}${
          data.topOpenRisksOmitted > 0
            ? `<p class="muted small">+${data.topOpenRisksOmitted} fler lägre-prioriterade rader (se BUG-SWARM-BACKLOG.md).</p>`
            : ""
        }</section>`;

  const evals =
    data.evals && data.evals.rows.length > 0
      ? `<section><h2>Eval-scorecard (baseline-master)</h2><p class="muted">exact-hit ${esc(
          data.evals.exactHitPct ?? "-",
        )}% · acceptable ${esc(data.evals.acceptableHitPct ?? "-")}% · ${esc(
          String(data.evals.total ?? data.evals.rows.length),
        )} prompts · fel: ${esc(String(data.evals.errors ?? 0))}</p>${renderTable(
          ["Prompt", "Träff", "Metod", "Confidence"],
          data.evals.rows.map((r) => [r.id, r.ok ? "ja" : "nej", r.method, r.confidence]),
          data.evals.rows.map((r) => (r.ok ? "success" : "warning")),
        )}</section>`
      : "";

  const metaDate = data.meta.commitDate ? ` (${esc(data.meta.commitDate)})` : "";

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LLM-flöde — ${esc(data.meta.commit)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #0b0f14;
      --panel: #121821;
      --text: #e8edf4;
      --muted: #9aa7b8;
      --border: #243041;
      --success: #22c55e;
      --info: #38bdf8;
      --warning: #f59e0b;
      --danger: #ef4444;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f6f8fb;
        --panel: #ffffff;
        --text: #0f172a;
        --muted: #64748b;
        --border: #e2e8f0;
      }
    }
    body { margin: 0; background: var(--bg); color: var(--text); line-height: 1.5; }
    main { max-width: 1100px; margin: 0 auto; padding: 24px; display: grid; gap: 24px; }
    h1 { margin: 0 0 8px; font-size: 1.75rem; }
    h2 { margin: 0 0 12px; font-size: 1.15rem; }
    .muted { color: var(--muted); margin: 0 0 12px; }
    .small { font-size: 0.875rem; }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .pill { border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; font-size: 0.85rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
    .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
    .stat-value { font-size: 1.5rem; font-weight: 700; }
    .stat-label { color: var(--muted); font-size: 0.85rem; }
    section { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { border-bottom: 1px solid var(--border); padding: 8px 10px; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    .phases { margin: 0; padding-left: 1.2rem; display: grid; gap: 8px; }
    .callout { border-left: 4px solid var(--border); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; background: rgba(255,255,255,0.02); }
    .callout p { margin: 6px 0 0; }
    .tone-success { border-left-color: var(--success); }
    .tone-info { border-left-color: var(--info); }
    .tone-warning { border-left-color: var(--warning); }
    .tone-danger { border-left-color: var(--danger); }
    tr.tone-success td:nth-child(2) { color: var(--success); font-weight: 600; }
    tr.tone-info td:nth-child(2) { color: var(--info); font-weight: 600; }
    tr.tone-warning td:nth-child(2) { color: var(--warning); font-weight: 600; }
    tr.tone-danger td:nth-child(2) { color: var(--danger); font-weight: 600; }
    .stat.tone-success .stat-value { color: var(--success); }
    .stat.tone-info .stat-value { color: var(--info); }
    .stat.tone-warning .stat-value { color: var(--warning); }
    .stat.tone-danger .stat-value { color: var(--danger); }
    footer { color: var(--muted); font-size: 0.85rem; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>LLM-flöde — status mot master</h1>
      <p class="muted">${esc(data.meta.repo)} · commit ${esc(data.meta.commit)}${metaDate} · genererad ${esc(
        new Date().toISOString().slice(0, 19).replace("T", " "),
      )} UTC</p>
      <p class="muted small">Ögonblicksbild vid körningstillfället: fil-källor (domain-map.json,
      BUG-SWARM-BACKLOG.md, eval-rapport) läses från working tree, medan commit ${esc(
        data.meta.commit,
      )} och churn speglar committat läge (git log). Uppdateras inte automatiskt — kör <code>npm run canvas:open</code> igen för färsk status (öppnar en ny flik).</p>
      <div class="legend">${legend}</div>
    </header>

    <div class="stats">${stats}</div>
    ${phases}
    <section><h2>Processer</h2>${renderTable(
      ["Process", "Status", "Öppna buggar", "Churn", "Not"],
      processRows,
      processTones,
    )}</section>
    ${shaky}
    ${risks}
    ${evals}
    <footer>
      Källa: config/dashboard/domain-map.json, BUG-SWARM-BACKLOG.md, eval-rapport
      (scaffold-selection / baseline-master), git-churn (committat läge).
      Manuell uppdatering: <code>npm run canvas:open</code> (HTML) ·
      <code>npm run canvas:build</code> (sparad .txt + .json) ·
      Cursor-vy: <code>node scripts/canvas/sync-to-cursor.mjs</code>
    </footer>
  </main>
</body>
</html>`;
}

function openFile(path) {
  const url = pathToFileURL(path).href;
  if (process.platform === "win32") {
    execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore" });
  } else if (process.platform === "darwin") {
    execFileSync("open", [url], { stdio: "ignore" });
  } else {
    execFileSync("xdg-open", [url], { stdio: "ignore" });
  }
}

function main() {
  const data = buildData();
  const html = renderHtml(data);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, html, "utf8");
  console.info(`[canvas:open] skrev ${OUT_PATH}`);
  if (!NO_OPEN) {
    openFile(OUT_PATH);
    console.info("[canvas:open] öppnade i webbläsaren");
  }
}

main();
