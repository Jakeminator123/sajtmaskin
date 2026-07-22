#!/usr/bin/env node
/**
 * build-llm-flow-canvas.mjs — deterministisk, beroendefri generator for en
 * Cursor-canvas som visar LLM-flodets processer och deras status (Klart /
 * Pagar / Skakigt / Blockerat) for sajtmaskin.
 *
 * Designprinciper (medvetet skonsam mot ett repo i tung forandring):
 *   - INGA npm-beroenden. Bara Node-inbyggda moduler.
 *   - INGA andringar i andra filer. Skriver BARA canvas-artefakten:
 *       docs/canvases/llm-flow.canvas.txt
 *     (.txt, inte .tsx, sa att repots `tsc`/`eslint` aldrig ror den och CI
 *      inte kan brackas oavsett hur kontraktsytorna andras.)
 *   - ALLA signalkallor ar VALFRIA. Saknas eller andras en kalla utelamnas
 *     bara den harledningen — generatorn kraschar aldrig.
 *   - DETERMINISTISK: ingen Date.now()/slump. "Generad"-stampeln kommer fran
 *     HEAD-commit, sa identiska indata ger identisk output (ingen PR-loop).
 *
 * Korning:  node scripts/canvas/build-llm-flow-canvas.mjs
 * Rendera lokalt sedan med:  node scripts/canvas/sync-to-cursor.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const OUT_REL = "docs/canvases/llm-flow.canvas.txt";
const OUT_JSON_REL = "docs/canvases/llm-flow.canvas.json";
const CONFIG_REL = "scripts/canvas/llm-flow-canvas.config.json";
const DOMAIN_MAP_REL = "config/dashboard/domain-map.json";
const BACKLOG_REL = "BUG-SWARM-BACKLOG.md";
// Kanonisk LLM-fas-doc: faserna låses mot dess "## FAS N"-rubriker när den finns.
const LLM_PIPELINE_REL = "docs/architecture/llm-pipeline.md";
// Eval-scorecard: prova de kanoniska rapport-platserna i tur och ordning i stället
// för en enda (ev. borttagen) path. Första som finns och parsar vinner.
const EVAL_SUMMARY_CANDIDATES = [
  "data/scaffold-eval/reports/scaffold-selection-latest.json",
  "evals/results/baseline-master/_summary.json",
];

/** Default-fokus: vilka domain-map-sidor som hor till LLM-flodet, i visningsordning.
 *  Inget av detta ar ett krav — sidor som saknas hoppas bara over, och en
 *  override i config kan ersatta hela listan. */
const DEFAULT_FOCUS = [
  "LLM-faser & runtime-sanning",
  "Codegen core",
  "prompt-core",
  "ai_models",
  "Scaffolds",
  "Scaffold Lifecycle",
  "Preview och versioner",
  "Eval",
];

const STATUS = {
  done: { label: "Klart", tone: "success" },
  ongoing: { label: "Pagar", tone: "info" },
  shaky: { label: "Skakigt", tone: "warning" },
  blocked: { label: "Blockerat", tone: "danger" },
};

// --- sma robusta helpers -------------------------------------------------

function readText(rel) {
  try {
    return readFileSync(join(REPO_ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

function readJson(rel) {
  const raw = readText(rel);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Returnerar första JSON som finns och parsar bland kandidat-sökvägarna. */
function readFirstJson(relPaths) {
  for (const rel of relPaths) {
    const parsed = readJson(rel);
    if (parsed) return parsed;
  }
  return null;
}

/** Faser: lås mot llm-pipeline.md (kanonisk LLM-fas-doc) när den finns.
 *  Parsar "## FAS N ..."-rubrikerna deterministiskt; faller annars tillbaka
 *  på de tre kända faserna så att canvasen aldrig blir tom (doc kan saknas
 *  på äldre brancher eller vara avindexerad). */
function derivePhases() {
  const FALLBACK = [
    "FAS 1 - Intent: prompt, brief, scaffold/variant/dossiers, route plan",
    "FAS 2 - Orkestrering & build: system prompt, codegen, finalize, autofix, verifier, persist",
    "FAS 3 - Preview & deploy: preview-host/VM, quality-gate, repair, deploy",
  ];
  const md = readText(LLM_PIPELINE_REL);
  if (!md) return FALLBACK;
  const heads = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^##\s+(FAS\s+\d[^\n]*?)\s*$/u);
    if (m) heads.push(m[1].replace(/\s+/g, " ").trim());
  }
  return heads.length >= 2 ? heads : FALLBACK;
}

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function basename(p) {
  return String(p)
    .replace(/[/\\]+$/, "")
    .split(/[/\\]/)
    .pop();
}

/** Kuraterade, SPECIFIKA termer per process. Avsiktligt smala sa att en
 *  backlog-rad bara matchas nar den verkligen ror processen (hellre missa an
 *  over-matcha). Helt valfria: en process utan traffar visas som stabil. En
 *  process som saknas har faller tillbaka pa enbart langa fil-stammar. */
const STRONG_TERMS = {
  "LLM-faser & runtime-sanning": ["phase-routing", "phaserouting", "buildprofile", "build-profile", "tier-routing", "fixer/verifier"],
  "Codegen core": ["autofix", "cross-file", "null-render", "static-core", "domain-inference", "prompt-heuristic", "system-prompt"],
  "prompt-core": ["core rules", "prompt-core", "core-contract", "systemprompt", "system prompt"],
  "ai_models": ["manifest.json", "phase-routing", "token-budget", "tokenbudget", "repair-pass", "build-spec", "buildspec", "promptlimits", "partial-file repair"],
  "Scaffolds": ["scaffold", "dossier", "capability", "route-plan", "routeplan"],
  "Scaffold Lifecycle": ["scaffold-variant", "variant-json", "scaffold-variants"],
  "Preview och versioner": ["preview", "verifier", "finalize-design", "quality gate", "quality-gate", "warm-typecheck", "product-postcheck", "server-verify", "event-bus", "build plan", "f3 ", " f3", "f2 ", " f2", "repair gate"],
  Eval: ["eval", "baseline", "merge-syntax", "merge syntax", "arcade-with-klarna"],
};

/** Specifika sokmonster per process: kuraterade termer + langa hyphen-stammar
 *  ur dess paths (>= 9 tecken, fler-ords). Korta/generiska tokens undviks helt
 *  for att inte matcha hela backloggen. */
function keywordsFor(name, page) {
  const terms = new Set((STRONG_TERMS[name] || []).map((t) => t.toLowerCase()));
  const paths = [...(page.canonicalPaths || []), ...(page.codeReaders || [])];
  for (const p of paths) {
    const stem = basename(p).toLowerCase().replace(/\.[a-z]+$/u, "");
    // Bara distinkta fler-ords-stammar (innehaller bindestreck) och langa nog.
    if (stem.includes("-") && stem.length >= 9) terms.add(stem);
  }
  return [...terms];
}

// --- signalkallor --------------------------------------------------------

/** Plockar ut oppna backlog-rader ur "## Aktiv ko"-sektionen.
 *  Returnerar [{ prio, blocker, text }]. Helt defensiv mot formatdrift.
 *
 *  Bara rader UNDER rubriken "## Aktiv ko" (fram till nasta "## ") raknas, sa
 *  att "Beslut & policy"-, "Behover repro"- och arkiv-tabeller aldrig blastas
 *  in som oppna risker. Saknas rubriken (aldre fil) faller vi tillbaka pa hela
 *  filen sa canvasen aldrig blir tom. */
export function parseBacklogRows(md) {
  if (!md) return [];
  const lines = md.split(/\r?\n/);
  // Begransa till "## Aktiv ko"-sektionen om den finns (Unicode-okansligt for o/ö).
  const startIdx = lines.findIndex((l) => /^##\s+Aktiv\s+k/iu.test(l.trim()));
  let scope = lines;
  if (startIdx !== -1) {
    const endRel = lines.slice(startIdx + 1).findIndex((l) => /^##\s+/u.test(l.trim()));
    const endIdx = endRel === -1 ? lines.length : startIdx + 1 + endRel;
    scope = lines.slice(startIdx + 1, endIdx);
  }
  const rows = [];
  for (const line of scope) {
    const t = line.trim();
    if (!t.startsWith("| [")) continue; // bara "Klar"-markerade datarader
    const cells = t.split("|").map((c) => c.trim());
    // | Klar | Status | Prio | Fynd | Kalla | Beslut |
    if (cells.length < 7) continue;
    const klar = cells[1];
    if (!/^\[\s?\]$/.test(klar) && klar !== "[ ]") continue; // bara oppna
    const prioRaw = (cells[3] || "").toUpperCase();
    const prioM = prioRaw.match(/P[0-3]/);
    const fynd = cells[4] || "";
    const kalla = cells[5] || "";
    const beslut = cells[6] || "";
    const blob = `${fynd} ${kalla} ${beslut}`;
    rows.push({
      prio: prioM ? prioM[0] : null,
      blocker: /BLOCKER/.test(beslut.toUpperCase()),
      text: blob.toLowerCase(),
      fynd,
    });
  }
  return rows;
}

/** Valjer "Oppna huvudrisker" ur backlog-rader. P0 ar hogsta allvar och far
 *  ALDRIG falla bort tyst: P0 sorteras overst och garanteras plats aven nar
 *  listan trunkeras till `cap`. Overskjutande LAGRE-prio rader redovisas via
 *  `omitted` (renderas som en "+N fler"-rad), sa inget P0 kan doljas i tysthet. */
export function selectTopOpenRisks(backlogRows, cap = 12) {
  const prioRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const candidates = (backlogRows || [])
    .filter((r) => r.blocker || r.prio === "P0" || r.prio === "P1" || r.prio === "P2")
    .sort((a, b) => {
      const ap0 = a.prio === "P0" ? 0 : 1;
      const bp0 = b.prio === "P0" ? 0 : 1;
      if (ap0 !== bp0) return ap0 - bp0; // P0 alltid overst
      if (a.blocker !== b.blocker) return a.blocker ? -1 : 1; // sen BLOCKER
      return (prioRank[a.prio] ?? 9) - (prioRank[b.prio] ?? 9); // sen prio
    });
  // Garantera plats for ALLA P0-rader; fyll resten upp till taket.
  const p0 = candidates.filter((r) => r.prio === "P0");
  const rest = candidates.filter((r) => r.prio !== "P0");
  const shown = [...p0, ...rest.slice(0, Math.max(0, cap - p0.length))];
  return {
    rows: shown.map((r) => ({ prio: r.prio || "-", blocker: r.blocker, fynd: truncate(r.fynd, 110) })),
    omitted: candidates.length - shown.length,
  };
}

function evalSignal(summary) {
  if (!summary || typeof summary !== "object") return null;
  const s = summary.summary || {};
  // Stöd båda rapport-scheman: nuvarande scaffold-selection-rapport
  // (semanticTop1Accuracy / results[].semanticTop1Correct / semanticMethod /
  // semanticConfidence) och äldre baseline (exactHitRatePercent / match /
  // selectionMethod / selectionConfidence). Okänt schema -> null/tomt, så
  // sektionen döljs i st.f. att felrapportera tomma "miss"-rader.
  const rawAcc =
    typeof s.semanticTop1Accuracy === "number"
      ? s.semanticTop1Accuracy
      : typeof s.exactHitRatePercent === "number"
        ? s.exactHitRatePercent
        : null;
  // semanticTop1Accuracy kan vara fraktion (0–1) eller procent; normalisera till procent.
  const exactHitPct =
    rawAcc == null ? null : rawAcc <= 1 ? Math.round(rawAcc * 1000) / 10 : rawAcc;
  const rows = Array.isArray(summary.results)
    ? summary.results.map((r) => ({
        id: String(r.id ?? "?"),
        ok: r.semanticTop1Correct === true || r.match === true,
        method: String(r.semanticMethod ?? r.selectionMethod ?? ""),
        confidence: String(r.semanticConfidence ?? r.selectionConfidence ?? ""),
      }))
    : [];
  return {
    exactHitPct,
    acceptableHitPct:
      typeof s.acceptableHitRatePercent === "number" ? s.acceptableHitRatePercent : null,
    total: typeof summary.total === "number" ? summary.total : rows.length || null,
    errors: typeof s.errors === "number" ? s.errors : null,
    rows,
  };
}

/** Antal commits de senaste `sinceDays` dagarna som ror processens paths. */
function churnFor(page, sinceDays) {
  const paths = [...(page.canonicalPaths || []), ...(page.codeReaders || [])]
    .map((p) => String(p).replace(/\s*\(.*\)\s*$/u, "").trim()) // strippa "(...)"-noter
    .map((p) => p.replace(/\*.*$/u, "")) // strippa glob-svansar -> katalog
    .filter(Boolean)
    .filter((p) => existsSync(join(REPO_ROOT, p)));
  if (paths.length === 0) return 0;
  const out = git(["log", `--since=${sinceDays} days ago`, "--pretty=format:%H", "--", ...paths]);
  if (!out) return 0;
  return out.split(/\r?\n/).filter(Boolean).length;
}

// --- statushardledning ---------------------------------------------------

function deriveStatus({ override, matched, churn, evalForProcess, churnHot }) {
  if (override && STATUS[override]) return override;
  const hasBlocker = matched.some((r) => r.blocker);
  if (hasBlocker) return "blocked";
  const openCount = matched.length;
  const evalWeak = evalForProcess && typeof evalForProcess.exactHitPct === "number" && evalForProcess.exactHitPct < 90;
  if (openCount > 0 || evalWeak) return "shaky";
  if (churn >= churnHot) return "ongoing";
  return "done";
}

// --- bygg DATA -----------------------------------------------------------

export function buildData() {
  const config = readJson(CONFIG_REL) || {};
  const sinceDays = Number.isFinite(config.churnSinceDays) ? config.churnSinceDays : 14;
  const churnHot = Number.isFinite(config.churnHotThreshold) ? config.churnHotThreshold : 4;
  const overrides = config.statusOverrides || {};

  const domainMap = readJson(DOMAIN_MAP_REL);
  const pages = (domainMap && domainMap.pages) || {};
  const focus = Array.isArray(config.focus) && config.focus.length ? config.focus : DEFAULT_FOCUS;

  // Processordning: konfig/förvald fokus forst (om de finns), sen ev. resten.
  const orderedNames = [];
  for (const n of focus) if (pages[n]) orderedNames.push(n);
  if (config.includeAllPages) {
    for (const n of Object.keys(pages)) if (!orderedNames.includes(n)) orderedNames.push(n);
  }

  const backlogMd = readText(BACKLOG_REL);
  const backlogRows = parseBacklogRows(backlogMd);
  const evals = evalSignal(readFirstJson(EVAL_SUMMARY_CANDIDATES));

  const processes = [];
  for (const name of orderedNames) {
    const page = pages[name] || {};
    const kws = keywordsFor(name, page);
    const matched = backlogRows.filter((row) => kws.some((kw) => row.text.includes(kw)));
    const churn = churnFor(page, sinceDays);
    const isEvalProcess = /eval/i.test(name);
    const evalForProcess = isEvalProcess ? evals : null;
    const status = deriveStatus({ override: overrides[name], matched, churn, evalForProcess, churnHot });

    const openByPrio = { P0: 0, P1: 0, P2: 0, P3: 0, other: 0 };
    for (const r of matched) {
      if (r.prio && openByPrio[r.prio] != null) openByPrio[r.prio] += 1;
      else openByPrio.other += 1;
    }

    const summary = String(page.summary || "")
      .replace(/\s+/g, " ")
      .slice(0, 180);

    let note = "";
    if (matched.some((r) => r.blocker)) {
      const ex = matched.find((r) => r.blocker);
      note = `BLOCKER: ${truncate(ex.fynd, 90)}`;
    } else if (matched.length > 0) {
      note = `${matched.length} oppna backlog-rader (P0:${openByPrio.P0} P1:${openByPrio.P1} P2:${openByPrio.P2} P3:${openByPrio.P3})`;
    } else if (churn >= churnHot) {
      note = `Aktiv: ${churn} commits / ${sinceDays}d`;
    } else if (isEvalProcess && evals && evals.exactHitPct != null) {
      note = `Eval exact-hit ${evals.exactHitPct}%`;
    } else {
      note = churn > 0 ? `${churn} commits / ${sinceDays}d` : "Inga oppna signaler";
    }

    processes.push({
      name,
      status,
      statusLabel: STATUS[status].label,
      tone: STATUS[status].tone,
      openBugs: matched.length,
      openByPrio,
      churn,
      summary,
      note,
    });
  }

  // Globala totaler ur backloggen.
  const totals = {
    processes: processes.length,
    openP0: backlogRows.filter((r) => r.prio === "P0").length,
    openP1: backlogRows.filter((r) => r.prio === "P1").length,
    openP2: backlogRows.filter((r) => r.prio === "P2").length,
    openP3: backlogRows.filter((r) => r.prio === "P3").length,
    blocked: processes.filter((p) => p.status === "blocked").length,
    shaky: processes.filter((p) => p.status === "shaky").length,
    evalExactHitPct: evals ? evals.exactHitPct : null,
  };

  // "Skakigast just nu": blockerade forst, sen flest oppna buggar / churn.
  const rank = { blocked: 0, shaky: 1, ongoing: 2, done: 3 };
  const shaky = processes
    .filter((p) => p.status === "blocked" || p.status === "shaky")
    .sort((a, b) => rank[a.status] - rank[b.status] || b.openBugs - a.openBugs || b.churn - a.churn)
    .slice(0, 5)
    .map((p) => ({ name: p.name, statusLabel: p.statusLabel, tone: p.tone, reason: p.note }));

  const phases = derivePhases();

  // Globala huvudrisker: oppna P0/BLOCKER/P1/P2-rader direkt ur backloggen, sa den
  // rika listan syns aven nar en rad inte kan mappas till en enskild process. P0 ar
  // hogsta allvar och garanteras plats (se selectTopOpenRisks) — kritiska rader kan
  // aldrig forsvinna tyst fran statusvyn.
  const { rows: topOpenRisks, omitted: topOpenRisksOmitted } = selectTopOpenRisks(backlogRows, 12);

  const commit = git(["rev-parse", "--short", "HEAD"]) || "okand";
  const commitDate = git(["show", "-s", "--format=%cs", "HEAD"]) || "";
  const repo = "Jakeminator123/sajtmaskin";

  return {
    meta: { repo, commit, commitDate, sinceDays },
    totals,
    processes,
    shaky,
    topOpenRisks,
    topOpenRisksOmitted,
    evals,
    phases,
    legend: Object.values(STATUS).map((s) => s.label),
  };
}

function truncate(s, n) {
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

// --- canvas-mall (statisk TSX, dynamiskt DATA injiceras) -----------------

function renderCanvas(data) {
  const json = JSON.stringify(data, null, 2);
  return `// AUTO-GENERERAD av scripts/canvas/build-llm-flow-canvas.mjs - redigera inte for hand.
// Lagras som .txt sa repots tsc/eslint aldrig ror den. Rendera lokalt med:
//   node scripts/canvas/sync-to-cursor.mjs
import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  type StatTone,
  type TableRowTone,
} from "cursor/canvas";

type Status = "done" | "ongoing" | "shaky" | "blocked";

type Process = {
  name: string;
  status: Status;
  statusLabel: string;
  tone: TableRowTone;
  openBugs: number;
  openByPrio: { P0: number; P1: number; P2: number; P3: number; other: number };
  churn: number;
  summary: string;
  note: string;
};

type CanvasData = {
  meta: { repo: string; commit: string; commitDate: string; sinceDays: number };
  totals: {
    processes: number;
    openP0: number;
    openP1: number;
    openP2: number;
    openP3: number;
    blocked: number;
    shaky: number;
    evalExactHitPct: number | null;
  };
  processes: Process[];
  shaky: { name: string; statusLabel: string; tone: TableRowTone; reason: string }[];
  topOpenRisks: { prio: string; blocker: boolean; fynd: string }[];
  topOpenRisksOmitted: number;
  evals: {
    exactHitPct: number | null;
    acceptableHitPct: number | null;
    total: number | null;
    errors: number | null;
    rows: { id: string; ok: boolean; method: string; confidence: string }[];
  } | null;
  phases: string[];
  legend: string[];
};

const DATA: CanvasData = ${json};

const STATUS_TONE: Record<Status, TableRowTone> = {
  done: "success",
  ongoing: "info",
  shaky: "warning",
  blocked: "danger",
};

const CALLOUT_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  success: "success",
  info: "info",
  warning: "warning",
  danger: "danger",
  neutral: "neutral",
};

export default function LLMFlowCanvas() {
  const d = DATA;
  return (
    <Stack gap={24} style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <Stack gap={6}>
        <H1>LLM-flode - status mot master</H1>
        <Text tone="secondary">
          {d.meta.repo} {"\u00b7"} commit {d.meta.commit}
          {d.meta.commitDate ? " (" + d.meta.commitDate + ")" : ""} {"\u00b7"} auto-genererad fran repo-signaler
        </Text>
        <Row gap={8} wrap>
          {d.legend.map((l) => (
            <Pill key={l}>{l}</Pill>
          ))}
        </Row>
      </Stack>

      <Grid columns={6} gap={12}>
        <Stat value={String(d.totals.processes)} label="Processer" />
        <Stat value={String(d.totals.blocked)} label="Blockerade" tone={(d.totals.blocked ? "danger" : "success") as StatTone} />
        <Stat value={String(d.totals.shaky)} label="Skakiga" tone={(d.totals.shaky ? "warning" : "success") as StatTone} />
        <Stat value={String(d.totals.openP0)} label="Oppna P0" tone={(d.totals.openP0 ? "danger" : "success") as StatTone} />
        <Stat value={String(d.totals.openP1)} label="Oppna P1" tone={(d.totals.openP1 ? "warning" : "success") as StatTone} />
        <Stat
          value={d.totals.evalExactHitPct == null ? "-" : d.totals.evalExactHitPct + "%"}
          label="Eval exact-hit"
          tone={"info" as StatTone}
        />
      </Grid>

      {d.phases.length > 0 && (
        <Stack gap={8}>
          <H2>Faskedja</H2>
          <Stack gap={6}>
            {d.phases.map((p, i) => (
              <Row key={i} gap={8} align="start">
                <Pill>{i + 1}</Pill>
                <Text>{p}</Text>
              </Row>
            ))}
          </Stack>
        </Stack>
      )}

      <Stack gap={10}>
        <H2>Processer</H2>
        <Table
          headers={["Process", "Status", "Oppna buggar", "Churn", "Not"]}
          columnAlign={["left", "left", "right", "right", "left"]}
          rowTone={d.processes.map((p) => STATUS_TONE[p.status])}
          rows={d.processes.map((p) => [
            p.name,
            p.statusLabel,
            String(p.openBugs),
            String(p.churn),
            p.note,
          ])}
        />
      </Stack>

      {d.shaky.length > 0 && (
        <Stack gap={10}>
          <H2>Skakigast just nu</H2>
          {d.shaky.map((s) => (
            <Callout key={s.name} tone={CALLOUT_TONE[s.tone] ?? "neutral"} title={s.name + " - " + s.statusLabel}>
              {s.reason}
            </Callout>
          ))}
        </Stack>
      )}

      {d.topOpenRisks.length > 0 && (
        <Stack gap={10}>
          <H2>Oppna huvudrisker (backlog)</H2>
          <Text tone="secondary">
            Oppna P0/BLOCKER/P1/P2-rader direkt ur BUG-SWARM-BACKLOG.md. Mappas inte alltid till en enskild
            process - visas globalt sa inget tappas. P0 ar hogsta allvar och visas alltid overst.
          </Text>
          <Table
            headers={["Prio", "Typ", "Fynd"]}
            columnAlign={["left", "left", "left"]}
            rowTone={d.topOpenRisks.map((r) => (r.prio === "P0" || r.blocker ? "danger" : r.prio === "P1" ? "warning" : "info") as TableRowTone)}
            rows={d.topOpenRisks.map((r) => [r.prio, r.blocker ? "BLOCKER" : "oppen", r.fynd])}
          />
          {d.topOpenRisksOmitted > 0 && (
            <Text size="small" tone="tertiary">
              {"+" + d.topOpenRisksOmitted + " fler lagre-prioriterade rader (se BUG-SWARM-BACKLOG.md) - inga P0 doljs."}
            </Text>
          )}
        </Stack>
      )}

      {d.evals && d.evals.rows.length > 0 && (
        <Stack gap={10}>
          <H2>Eval-scorecard (scaffold-selection, baseline-master)</H2>
          <Text tone="secondary">
            exact-hit {d.evals.exactHitPct ?? "-"}% {"\u00b7"} acceptable {d.evals.acceptableHitPct ?? "-"}% {"\u00b7"}{" "}
            {d.evals.total ?? d.evals.rows.length} prompts {"\u00b7"} fel: {d.evals.errors ?? 0}
          </Text>
          <Table
            headers={["Prompt", "Traff", "Metod", "Confidence"]}
            columnAlign={["left", "left", "left", "left"]}
            rowTone={d.evals.rows.map((r) => (r.ok ? "success" : "warning") as TableRowTone)}
            rows={d.evals.rows.map((r) => [r.id, r.ok ? "ja" : "nej", r.method, r.confidence])}
          />
        </Stack>
      )}

      <Card>
        <CardHeader>Hur den uppdateras</CardHeader>
        <CardBody>
          <Stack gap={6}>
            <Text size="small" tone="secondary">
              Ogonblicksbild vid korningstillfallet. Fil-kallorna (config/dashboard/domain-map.json,
              BUG-SWARM-BACKLOG.md, eval-rapporten) lases fran working tree, medan commit {d.meta.commit}
              och churn speglar committat lage (git log).
            </Text>
            <Text size="small" tone="secondary">
              Uppdateras MANUELLT - auto-PR-workflowen togs bort i #191. Kor om for farsk status:
              npm run canvas:build (sparad .txt + .json) eller npm run canvas:open (HTML).
            </Text>
            <Text size="small" tone="tertiary">
              Lokalt i Cursor: git pull {"\u2192"} node scripts/canvas/sync-to-cursor.mjs {"\u2192"} oppna canvasen bredvid chatten.
            </Text>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}
`;
}

// --- main ----------------------------------------------------------------

function main() {
  // `--json-only`: skriv bara den gitignorerade JSON-sidecaren, inte den spårade
  // .txt:en. Backoffice använder detta vid start/refresh så att enbart öppna
  // panelen aldrig smutsar working tree. Full build sker via `npm run canvas:build`.
  const jsonOnly = process.argv.includes("--json-only");
  const data = buildData();
  mkdirSync(dirname(join(REPO_ROOT, OUT_JSON_REL)), { recursive: true });
  // JSON-sidecar: samma buildData()-payload som .txt:en, så backoffice-fliken
  // (och andra konsumenter) kan läsa strukturerad data utan att tolka TSX.
  const jsonPath = join(REPO_ROOT, OUT_JSON_REL);
  writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  if (!jsonOnly) {
    const outPath = join(REPO_ROOT, OUT_REL);
    writeFileSync(outPath, renderCanvas(data), "utf8");
  }
  console.info(
    `[build-llm-flow-canvas] skrev ${jsonOnly ? OUT_JSON_REL : `${OUT_REL} + ${OUT_JSON_REL}`} (${data.totals.processes} processer, ` +
      `${data.totals.blocked} blockerade, ${data.totals.shaky} skakiga, commit ${data.meta.commit})`,
  );
}

// Kor bara nar skriptet startas direkt (node ...build-llm-flow-canvas.mjs), inte
// vid import — tester importerar de rena funktionerna utan att skriva nagon fil.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
