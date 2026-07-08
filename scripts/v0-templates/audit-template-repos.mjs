// scripts/v0-templates/audit-template-repos.mjs
//
// Read-only compatibility audit of the v0 template repos (front-page Templates path)
// against Sajtmaskin's ACTUAL runtime guardrails.
//
// Context-safe by design: only reads package.json + config presence + file/byte stats
// out of each zip. Never dumps repo file contents. Emits an aggregate summary to the
// terminal and a full per-template JSON to --out.
//
// Sources:
//   default  -> src/lib/templates/template-blob-manifest.json (downloads each archiveUrl, cached)
//   --dir X  -> analyze every *.zip found recursively under X (your local intake)
//
// Usage (pwsh, from repo root):
//   node scripts/v0-templates/audit-template-repos.mjs                    # all, from Blob (cached)
//   node scripts/v0-templates/audit-template-repos.mjs --limit 30         # quick smoke
//   node scripts/v0-templates/audit-template-repos.mjs --dir "C:\path\to\zips"
//   node scripts/v0-templates/audit-template-repos.mjs --out scratch-template-audit.json --concurrency 8

import JSZip from "jszip";
import { readFile, readdir, mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, isAbsolute, basename } from "node:path";
import process from "node:process";
import os from "node:os";

// ---------- Guardrail constants (verified against repo code) ----------
// Preview-host payload caps (preview-host/src/validate.js): the real gate.
const HOST_MAX_FILES = 500;
const HOST_MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MiB per file
const HOST_MAX_TOTAL_BYTES = 12 * 1024 * 1024; // 12 MiB total
// Scaffold baseline pins (src/lib/gen/export/project-scaffold.ts) = the "fixed version".
const BASELINE = { next: 16, react: 19, tailwind: 4, ts: "5.9.3", node: ">=22.14.0 <23" };
// Import-path prefixes stripped before files reach the host (local-v0-template-source.ts).
const BLOCKED_PREFIXES = ["node_modules/", ".git/", ".next/", "dist/", "build/", "coverage/", "out/"];

// dep name -> capability bucket (the "features / dossiers" angle: needs secrets/backend/F3)
const INTEGRATION_MAP = {
  auth: [/^@clerk\//, /^next-auth$/, /^@auth\//, /^@supabase\/auth-helpers/, /^lucia$/, /^@workos-inc\//, /^@kinde-oss\//, /^@auth0\//, /^@stackframe\//],
  payments: [/^stripe$/, /^@stripe\//, /^@paddle\//, /^@lemonsqueezy\//],
  database: [/^@supabase\/supabase-js$/, /^@prisma\/client$/, /^prisma$/, /^drizzle-orm$/, /^mongoose$/, /^@neondatabase\//, /^pg$/, /^mysql2$/, /^@planetscale\//, /^mongodb$/, /^@vercel\/postgres$/, /^@upstash\//, /^redis$/, /^ioredis$/],
  ai: [/^openai$/, /^@ai-sdk\//, /^ai$/, /^@anthropic-ai\//, /^@google\/generative-ai$/, /^@decartai\//, /^replicate$/, /^cohere-ai$/, /^groq-sdk$/],
  email: [/^resend$/, /^nodemailer$/, /^@sendgrid\//, /^postmark$/],
  cms: [/^contentful$/, /^@sanity\//, /^next-sanity$/, /^@contentful\//, /^@storyblok\//, /^@prismicio\//],
  storage: [/^@vercel\/blob$/, /^@aws-sdk\/client-s3$/, /^@uploadthing\//, /^uploadthing$/],
};
// cross-framework markers (v0 "kitchen sink" package.json)
const CROSS_FRAMEWORK = [/^svelte$/, /^@sveltejs\//, /^vue$/, /^vue-router$/, /^@remix-run\//, /^solid-js$/, /^@angular\//, /^nuxt$/, /^@builder\.io\/qwik$/];

// Packages published in LOCKSTEP with internal cross-package imports. `framer-motion`/
// `motion` import internals (e.g. `activeAnimations`) from their sibling `motion-dom`,
// which is only guaranteed to match AT THE SAME VERSION. If the top-level parent is
// EXACT-pinned while `motion-dom` is left to float transitively (`^`), a later sibling
// release can drop an internal the pinned parent still imports -> Turbopack build dies
// with `Export X doesn't exist in target module … motion-dom`.
//
// NOTE (PR #424): the runtime Normalize step (`normalizeImportedRepoFiles`) now injects
// a safe `overrides.motion-dom` pin at import time whenever the exact-pin-without-sibling
// shape is detected AND no honored lockfile is present. The audit still detects and
// reports this shape, but it is a *post-normalize residual* (background data / potential
// future risk) rather than an active P1 blocker for repos imported via the ZIP/GitHub
// flow. Blob-template imports (local-v0-template-source.ts) run the same Normalize pass.
// Detect the exact-pin-without-sibling shape for monitoring purposes.
const MOTION_PARENTS = ["framer-motion", "motion"];
const MOTION_LOCKSTEP = new Set([...MOTION_PARENTS, "motion-dom", "motion-utils"]);
function isExactPin(range) {
  // exact = a bare semver (optionally `=`-prefixed). `^`/`~`/`>=`/`*`/`latest`/`x` are ranges.
  return typeof range === "string" && /^\s*=?\d+\.\d+\.\d+(?:[-+].*)?\s*$/.test(range);
}

// Env keys sajtmaskin auto-fills into preview .env.local (harmless + tier3-stub layers,
// src/lib/gen/preview/env-local.ts) + deterministic project-preview tokens
// (src/lib/gen/preview/project-preview-env.ts). Any referenced key OUTSIDE this set is
// `undefined` in F2 preview -> module-scope reads can crash `next dev`.
const PROJECT_PREVIEW_ENV_KEYS = [
  "NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID", "SAJTMASKIN_APP_PROJECT_ID", "PREVIEW_PROJECT_SECRET",
  "NEXT_PUBLIC_PREVIEW_KEY", "PREVIEW_API_KEY", "PREVIEW_INTEGRATION_TOKEN",
];
// Next.js built-in / framework env that is always defined — never a "missing key" risk.
const BUILTIN_ENV_KEYS = new Set(["NODE_ENV", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "NEXT_RUNTIME", "PORT", "HOSTNAME", "PATH"]);
let COVERED_ENV = new Set(); // filled in main()
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const ENV_REF_RE = /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g;

function parseEnvTxtKeys(text) {
  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) keys.push(t.slice(0, eq).trim());
  }
  return keys;
}

// ---------- args ----------
function parseArgs(argv) {
  const a = { dir: null, limit: Infinity, out: "scratch-template-audit.json", concurrency: 8, cache: join(os.tmpdir(), "sm-template-audit-cache"), noCache: false };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--dir") a.dir = argv[++i];
    else if (t === "--limit") a.limit = Number(argv[++i]);
    else if (t === "--out") a.out = argv[++i];
    else if (t === "--concurrency") a.concurrency = Number(argv[++i]);
    else if (t === "--cache") a.cache = argv[++i];
    else if (t === "--no-cache") a.noCache = true;
  }
  return a;
}

// ---------- helpers ----------
function majorOf(range) {
  if (typeof range !== "string") return null;
  const m = range.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
function stripCommonRoot(names) {
  if (names.length === 0) return names;
  const segs = names.map((n) => n.split("/").filter(Boolean));
  const first = segs[0]?.[0];
  if (!first) return names;
  const strip = segs.every((p) => p.length > 1 && p[0] === first);
  return strip ? segs.map((p) => p.slice(1).join("/")) : names;
}
function bucketForDep(name) {
  for (const [bucket, pats] of Object.entries(INTEGRATION_MAP)) {
    if (pats.some((re) => re.test(name))) return bucket;
  }
  return null;
}

// Replace comments + string/template literals with same-length blanks so brace-depth
// counting is not fooled by braces inside strings/`${}`/comments. Approximate (does not
// model regex literals), but good enough to classify env reads as top-level vs nested.
function stripNoise(src) {
  let out = "";
  let state = "code"; // code|line|block|sq|dq|tpl
  for (let i = 0; i < src.length; i++) {
    const c = src[i], c2 = src[i + 1];
    if (state === "code") {
      if (c === "/" && c2 === "/") { state = "line"; out += "  "; i++; continue; }
      if (c === "/" && c2 === "*") { state = "block"; out += "  "; i++; continue; }
      if (c === "'") { state = "sq"; out += " "; continue; }
      if (c === '"') { state = "dq"; out += " "; continue; }
      if (c === "`") { state = "tpl"; out += " "; continue; }
      out += c; continue;
    }
    if (state === "line") { if (c === "\n") { state = "code"; out += "\n"; } else out += " "; continue; }
    if (state === "block") { if (c === "*" && c2 === "/") { state = "code"; out += "  "; i++; } else out += (c === "\n" ? "\n" : " "); continue; }
    // string/template states
    if (c === "\\") { out += "  "; i++; continue; }
    if ((state === "sq" && c === "'") || (state === "dq" && c === '"') || (state === "tpl" && c === "`")) state = "code";
    out += (c === "\n" ? "\n" : " ");
  }
  return out;
}

// Is the `{` at `bracePos` a FUNCTION body (defers execution) vs an object
// literal / control block (runs at module eval)? Only function bodies defer, so
// `new Client({ apiKey: process.env.X })` at module scope must still count as
// module-eval (crash-on-load), even though the read sits inside `{}`.
function isFunctionBrace(src, bracePos) {
  let j = bracePos - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return false;
  if (src[j] === ">" && j - 1 >= 0 && src[j - 1] === "=") return true; // arrow `=> {`
  if (src[j] === ")") {
    let depth = 0;
    let k = j;
    for (; k >= 0; k--) {
      if (src[k] === ")") depth++;
      else if (src[k] === "(") { depth--; if (depth === 0) break; }
    }
    if (k < 0) return false;
    let t = k - 1;
    while (t >= 0 && /\s/.test(src[t])) t--;
    const end = t;
    while (t >= 0 && /[A-Za-z0-9_$]/.test(src[t])) t--;
    const word = src.slice(t + 1, end + 1);
    // control blocks execute at module load — NOT a deferred function body
    return !["if", "for", "while", "switch", "catch", "return"].includes(word);
  }
  return false; // preceded by `=`, `(`, `,`, `:`, `[`, keyword → object literal / block
}

// Count enclosing FUNCTION bodies before `index`. 0 ⇒ runs at module eval.
function functionDepthBefore(src, index) {
  const stack = [];
  for (let i = 0; i < index; i++) {
    const ch = src[i];
    if (ch === "{") stack.push(isFunctionBrace(src, i));
    else if (ch === "}") stack.pop();
  }
  return stack.reduce((n, isFn) => n + (isFn ? 1 : 0), 0);
}

// Where does a file sit relative to the initially-rendered homepage?
function fileRole(path) {
  if (/(?:^|\/)(?:app|src\/app)\/.*route\.(?:t|j)sx?$/.test(path)) return "route";
  if (/(?:^|\/)pages\/api\//.test(path)) return "route";
  if (/(?:^|\/)(?:app|src\/app)\/(?:.*\/)?(?:page|layout|template|loading|error|not-found)\.(?:t|j)sx?$/.test(path)) return "render";
  if (/(?:^|\/)middleware\.(?:t|j)sx?$/.test(path)) return "render";
  return "component-lib"; // components/, lib/, hooks/, actions/ — in render path when imported
}

async function analyzeZipBuffer(buffer, meta) {
  const rec = {
    id: meta.id, title: meta.title ?? null, category: meta.category ?? null,
    galleryVisible: meta.galleryVisible ?? null, manifestPreviewFits: meta.manifestPreviewFits ?? null,
    fileCount: 0, totalBytes: 0, maxFileBytes: 0,
    hasPackageJson: false, packageJsonOk: false,
    framework: "unknown", isAppRouter: false, isPagesRouter: false,
    hasDevScript: false, devScript: null, lockfile: "none",
    nextVersion: null, reactVersion: null, tailwindVersion: null, tailwindSignal: "unknown", tsVersion: null,
    depCount: 0, crossFrameworkDeps: [], integrations: {},
    motionDeps: {}, motionDomExplicit: false, lockstepPinRisk: [],
    envRefCount: 0, envUncovered: [], envUncoveredServer: [], envFilesShipped: [],
    envPlacement: "none", envPlacementDetail: [],
    issues: [],
  };
  let zip;
  try { zip = await JSZip.loadAsync(buffer); }
  catch { rec.issues.push("zip-unreadable"); return rec; }

  const rawNames = Object.values(zip.files).filter((e) => !e.dir).map((e) => e.name);
  const stripped = stripCommonRoot(rawNames);
  const byStripped = new Map();
  for (let i = 0; i < rawNames.length; i++) byStripped.set(stripped[i], rawNames[i]);

  const kept = [];
  for (let i = 0; i < stripped.length; i++) {
    const s = stripped[i].replace(/^\/+/, "");
    if (BLOCKED_PREFIXES.some((p) => s.startsWith(p))) continue;
    kept.push({ s, orig: rawNames[i] });
  }
  rec.fileCount = kept.length;
  for (const { orig } of kept) {
    const size = zip.files[orig]?._data?.uncompressedSize ?? 0;
    rec.totalBytes += size;
    if (size > rec.maxFileBytes) rec.maxFileBytes = size;
  }

  const keptSet = new Set(kept.map((k) => k.s));
  const has = (p) => keptSet.has(p);
  const hasDir = (prefix) => kept.some((k) => k.s.startsWith(prefix));

  rec.isAppRouter = hasDir("app/") || hasDir("src/app/");
  rec.isPagesRouter = hasDir("pages/") || hasDir("src/pages/");

  if (has("pnpm-lock.yaml") || has("pnpm-lock.yml")) rec.lockfile = "pnpm";
  else if (has("yarn.lock")) rec.lockfile = "yarn";
  else if (has("package-lock.json")) rec.lockfile = "npm";

  const hasNextConfig = kept.some((k) => /^next\.config\.(mjs|js|ts|cjs)$/.test(k.s));
  const hasViteConfig = kept.some((k) => /^vite\.config\.(mjs|js|ts)$/.test(k.s));
  const hasAstroConfig = kept.some((k) => /^astro\.config\.(mjs|js|ts)$/.test(k.s));
  const hasSvelteConfig = kept.some((k) => /^svelte\.config\.(mjs|js)$/.test(k.s));
  const hasIndexHtml = has("index.html");

  const pkgKey = kept.map((k) => k.s).filter((s) => /(^|\/)package\.json$/.test(s)).sort((a, b) => a.split("/").length - b.split("/").length)[0];
  let deps = {};
  if (pkgKey) {
    rec.hasPackageJson = true;
    try {
      const raw = await zip.files[byStripped.get(pkgKey)].async("string");
      const pkg = JSON.parse(raw);
      rec.packageJsonOk = true;
      deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      rec.depCount = Object.keys(deps).length;
      rec.devScript = pkg.scripts?.dev ?? null;
      rec.hasDevScript = typeof rec.devScript === "string" && rec.devScript.trim().length > 0;
      rec.nextVersion = deps.next ?? null;
      rec.reactVersion = deps.react ?? null;
      rec.tsVersion = deps.typescript ?? null;
      rec.tailwindVersion = deps.tailwindcss ?? null;
      const twMajor = majorOf(rec.tailwindVersion);
      if (deps["@tailwindcss/postcss"]) rec.tailwindSignal = "v4";
      else if (twMajor === 4) rec.tailwindSignal = "v4";
      else if (twMajor === 3) rec.tailwindSignal = "v3";
      else if (rec.tailwindVersion) rec.tailwindSignal = `v${twMajor ?? "?"}`;
      else rec.tailwindSignal = "none";
      const intAcc = {};
      const motionAcc = {};
      for (const [name, ver] of Object.entries(deps)) {
        const b = bucketForDep(name);
        if (b) (intAcc[b] ||= []).push(name);
        if (CROSS_FRAMEWORK.some((re) => re.test(name))) rec.crossFrameworkDeps.push(name);
        if (MOTION_LOCKSTEP.has(name)) motionAcc[name] = ver;
      }
      rec.integrations = intAcc;
      rec.motionDeps = motionAcc;
      rec.motionDomExplicit = Boolean(motionAcc["motion-dom"]);
      // Risk = a motion PARENT is exact-pinned AND `motion-dom` is not explicitly listed
      // (so it floats transitively to whatever the registry ships at install time).
      if (!rec.motionDomExplicit) {
        for (const parent of MOTION_PARENTS) {
          if (motionAcc[parent] && isExactPin(motionAcc[parent])) {
            rec.lockstepPinRisk.push(`${parent}@${motionAcc[parent]}`);
          }
        }
      }
    } catch { rec.issues.push("package-json-unparseable"); }
  }

  if (deps.next || hasNextConfig) rec.framework = "next";
  else if (deps.vite || hasViteConfig) rec.framework = "vite";
  else if (Object.keys(deps).some((d) => /^@remix-run\//.test(d))) rec.framework = "remix";
  else if (deps.astro || hasAstroConfig) rec.framework = "astro";
  else if (deps["@sveltejs/kit"] || hasSvelteConfig) rec.framework = "sveltekit";
  else if (!rec.hasPackageJson && hasIndexHtml) rec.framework = "static-html";
  else rec.framework = "unknown";

  // ---------- env scan: which process.env keys does this repo read, and WHERE? ----------
  const envRefsDetailed = []; // { key, topLevel, role }
  for (const { s, orig } of kept) {
    if (/(^|\/)\.env(\.|$)/.test(s)) { rec.envFilesShipped.push(s); continue; }
    if (!SOURCE_EXT.test(s)) continue;
    if (s.startsWith("components/ui/")) continue; // shadcn primitives never read env
    let content;
    try { content = await zip.files[orig].async("string"); } catch { continue; }
    if (!content.includes("process.env")) continue;
    const stripped = stripNoise(content);
    const role = fileRole(s);
    ENV_REF_RE.lastIndex = 0;
    let m;
    while ((m = ENV_REF_RE.exec(stripped)) !== null) {
      const key = m[1] || m[2];
      if (!key || BUILTIN_ENV_KEYS.has(key)) continue;
      // top-level = runs at module eval = NOT inside any function body (object
      // literals / control blocks at module scope still count as module-eval).
      const topLevel = functionDepthBefore(stripped, m.index) === 0;
      envRefsDetailed.push({ key, topLevel, role });
    }
  }
  const envRefs = new Set(envRefsDetailed.map((d) => d.key));
  rec.envRefCount = envRefs.size;
  for (const key of envRefs) {
    if (COVERED_ENV.has(key)) continue;
    rec.envUncovered.push(key);
    if (!key.startsWith("NEXT_PUBLIC_")) rec.envUncoveredServer.push(key);
  }
  rec.envUncovered.sort();
  rec.envUncoveredServer.sort();

  // placement of the UNCOVERED SERVER keys (the crash candidates)
  const uncoveredServerSet = new Set(rec.envUncoveredServer);
  const relevant = envRefsDetailed.filter((d) => uncoveredServerSet.has(d.key));
  rec.envPlacementDetail = relevant;
  if (relevant.some((d) => d.topLevel && (d.role === "render" || d.role === "component-lib"))) rec.envPlacement = "crash-on-load";
  else if (relevant.some((d) => d.topLevel && d.role === "route")) rec.envPlacement = "crash-on-route";
  else if (relevant.length) rec.envPlacement = "lazy-only";
  else rec.envPlacement = "none";

  // ---------- issue classification ----------
  if (!rec.hasPackageJson) rec.issues.push("no-package-json");
  if (rec.hasPackageJson && !rec.hasDevScript) rec.issues.push("no-dev-script");
  if (rec.hasPackageJson && rec.framework !== "next") rec.issues.push(`not-next(${rec.framework})`);
  if (rec.framework === "next" && !rec.isAppRouter && rec.isPagesRouter) rec.issues.push("pages-router-only");
  if (rec.fileCount <= 1 && rec.hasPackageJson === false) rec.issues.push("single-file-no-project");
  const capReasons = [];
  if (rec.fileCount > HOST_MAX_FILES) capReasons.push(`files>${HOST_MAX_FILES}`);
  if (rec.maxFileBytes > HOST_MAX_FILE_BYTES) capReasons.push("file>2MiB");
  if (rec.totalBytes > HOST_MAX_TOTAL_BYTES) capReasons.push("total>12MiB");
  rec.fitsHostCaps = capReasons.length === 0;
  if (!rec.fitsHostCaps) rec.issues.push(`exceeds-host-caps(${capReasons.join(",")})`);
  const nextMajor = majorOf(rec.nextVersion);
  const reactMajor = majorOf(rec.reactVersion);
  if (nextMajor !== null && nextMajor !== BASELINE.next) rec.issues.push(`next-major-drift(${nextMajor}!=${BASELINE.next})`);
  if (reactMajor !== null && reactMajor !== BASELINE.react) rec.issues.push(`react-major-drift(${reactMajor}!=${BASELINE.react})`);
  if (rec.tailwindSignal === "v3") rec.issues.push("tailwind-v3-drift");
  if (rec.crossFrameworkDeps.length) rec.issues.push(`kitchen-sink(${rec.crossFrameworkDeps.length})`);
  if (rec.lockstepPinRisk.length) rec.issues.push(`lockstep-pin-risk(${rec.lockstepPinRisk.join(",")})`);
  const intBuckets = Object.keys(rec.integrations);
  if (intBuckets.length) rec.issues.push(`needs-backend(${intBuckets.join("/")})`);
  if (rec.envUncoveredServer.length) rec.issues.push(`env-missing-server(${rec.envUncoveredServer.length})`);
  else if (rec.envUncovered.length) rec.issues.push(`env-missing-public(${rec.envUncovered.length})`);
  return rec;
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function downloadCached(url, cacheDir, id, noCache) {
  const file = join(cacheDir, `${id}.zip`);
  if (!noCache && existsSync(file)) {
    const st = await stat(file);
    if (st.size > 0) return readFile(file);
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!noCache) { await mkdir(cacheDir, { recursive: true }); await writeFile(file, buf); }
  return buf;
}

async function collectZips(dir) {
  const root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  const found = [];
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".zip")) found.push(p);
    }
  }
  await walk(root);
  return found;
}

function pct(n, total) { return total ? `${Math.round((n / total) * 100)}%` : "0%"; }
function tally(records, key) {
  const m = {};
  for (const r of records) { const v = r[key]; m[v] = (m[v] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
function countIssue(records, prefix) {
  return records.filter((r) => (r.issues || []).some((i) => i === prefix || i.startsWith(prefix + "("))).length;
}

async function loadCoveredEnvKeys() {
  const set = new Set(PROJECT_PREVIEW_ENV_KEYS);
  for (const f of ["config/ai_models/40-harmless-placeholders.env.txt", "config/ai_models/41-tier3-stub-placeholders.env.txt"]) {
    try {
      const txt = await readFile(resolve(process.cwd(), f), "utf8");
      for (const k of parseEnvTxtKeys(txt)) set.add(k);
    } catch (e) { console.warn(`[audit] could not read ${f}: ${e.message}`); }
  }
  return set;
}

async function main() {
  const args = parseArgs(process.argv);
  COVERED_ENV = await loadCoveredEnvKeys();
  console.log(`[audit] covered env keys (auto-filled placeholders): ${COVERED_ENV.size}`);
  let records = [];

  if (args.dir) {
    const zips = (await collectZips(args.dir)).slice(0, args.limit);
    console.log(`[audit] local mode: ${zips.length} zip(s) under ${args.dir}`);
    records = await mapLimited(zips, args.concurrency, async (p) => {
      try {
        const buf = await readFile(p);
        const id = basename(p).replace(/\.zip$/i, "");
        return await analyzeZipBuffer(buf, { id });
      } catch (e) { return { id: basename(p), issues: [`read-error:${e.message}`], fileCount: 0, integrations: {}, crossFrameworkDeps: [] }; }
    });
  } else {
    const base = resolve(process.cwd(), "src/lib/templates");
    const manifest = JSON.parse(await readFile(join(base, "template-blob-manifest.json"), "utf8"));
    const gallery = JSON.parse(await readFile(join(base, "templates.json"), "utf8"));
    const galleryIds = new Set(gallery.filter((t) => t.slug !== "categories" && t.id !== "categories").map((t) => t.id));
    const items = manifest.templates.slice(0, args.limit);
    console.log(`[audit] blob mode: ${items.length} template(s), concurrency=${args.concurrency}, cache=${args.cache}`);
    let done = 0;
    records = await mapLimited(items, args.concurrency, async (t) => {
      try {
        const buf = await downloadCached(t.archiveUrl, args.cache, t.id, args.noCache);
        return await analyzeZipBuffer(buf, {
          id: t.id, title: t.title, category: t.category,
          galleryVisible: galleryIds.has(t.id), manifestPreviewFits: t.previewFits ?? null,
        });
      } catch (e) {
        return { id: t.id, title: t.title, category: t.category, galleryVisible: galleryIds.has(t.id), issues: [`download-error:${e.message}`], fileCount: 0, integrations: {}, crossFrameworkDeps: [] };
      } finally {
        done++;
        if (done % 25 === 0) console.log(`  ...${done}/${items.length}`);
      }
    });
  }

  const total = records.length;
  await writeFile(resolve(process.cwd(), args.out), JSON.stringify(records, null, 2));

  const L = (s) => console.log(s);
  L("\n============================================================");
  L(`TEMPLATE AUDIT - ${total} repos  (full detail -> ${args.out})`);
  L("============================================================");

  L("\n-- Framework --");
  for (const [k, n] of tally(records, "framework")) L(`  ${String(k).padEnd(14)} ${String(n).padStart(4)}  ${pct(n, total)}`);

  L("\n-- Preview-host compatibility (blocking) --");
  const noPkg = countIssue(records, "no-package-json");
  const noDev = countIssue(records, "no-dev-script");
  const notNext = countIssue(records, "not-next");
  const singleFile = countIssue(records, "single-file-no-project");
  const overCaps = countIssue(records, "exceeds-host-caps");
  L(`  no package.json .............. ${noPkg}  ${pct(noPkg, total)}`);
  L(`  no "dev" script .............. ${noDev}  ${pct(noDev, total)}`);
  L(`  not a Next app ............... ${notNext}  ${pct(notNext, total)}`);
  L(`  single-file (no project) ..... ${singleFile}  ${pct(singleFile, total)}`);
  L(`  exceeds host caps ............ ${overCaps}  ${pct(overCaps, total)}`);

  L("\n-- Version drift vs scaffold baseline (bites after 1st follow-up edit) --");
  const nextDrift = countIssue(records, "next-major-drift");
  const reactDrift = countIssue(records, "react-major-drift");
  const twV3 = countIssue(records, "tailwind-v3-drift");
  L(`  next major != ${BASELINE.next} ............. ${nextDrift}  ${pct(nextDrift, total)}`);
  L(`  react major != ${BASELINE.react} ............ ${reactDrift}  ${pct(reactDrift, total)}`);
  L(`  tailwind v3 (baseline v4) .... ${twV3}  ${pct(twV3, total)}`);
  L("  tailwind signal:");
  for (const [k, n] of tally(records, "tailwindSignal")) L(`     ${String(k).padEnd(8)} ${n}`);
  L("  next version (raw, top 12):");
  for (const [k, n] of tally(records, "nextVersion").slice(0, 12)) L(`     ${String(k).padEnd(16)} ${n}`);

  L("\n-- 'Features' needing backend/secrets (dossier/F3 territory, NOT wired on import) --");
  const buckets = {};
  let anyBackend = 0;
  for (const r of records) {
    const ks = Object.keys(r.integrations || {});
    if (ks.length) anyBackend++;
    for (const k of ks) buckets[k] = (buckets[k] || 0) + 1;
  }
  L(`  templates needing some backend capability: ${anyBackend}  ${pct(anyBackend, total)}`);
  for (const [k, n] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) L(`     ${k.padEnd(10)} ${n}`);

  const kitchen = countIssue(records, "kitchen-sink");
  L(`\n-- 'Kitchen-sink' cross-framework deps (svelte/vue/remix in a Next app): ${kitchen}  ${pct(kitchen, total)} --`);

  L("\n-- Lockstep dep skew (framer-motion/motion exact-pinned, motion-dom floats) --");
  L("   [Runtime Normalize (PR #424) injects overrides.motion-dom at import — post-normalize residual only]");
  const usesMotion = records.filter((r) => Object.keys(r.motionDeps || {}).length > 0);
  const motionParentUsers = records.filter((r) => MOTION_PARENTS.some((p) => (r.motionDeps || {})[p]));
  const lockstepRisk = records.filter((r) => (r.lockstepPinRisk || []).length > 0);
  const lockstepRiskVisible = lockstepRisk.filter((r) => r.galleryVisible === true);
  const domExplicit = motionParentUsers.filter((r) => r.motionDomExplicit);
  L(`  uses any motion package .................... ${usesMotion.length}  ${pct(usesMotion.length, total)}`);
  L(`  uses framer-motion/motion (parent) ........ ${motionParentUsers.length}  ${pct(motionParentUsers.length, total)}`);
  L(`  exact-pin shape (post-normalize residual) .. ${lockstepRisk.length}  (gallery-visible: ${lockstepRiskVisible.length})`);
  L(`  parent + explicit motion-dom (no repair needed) ${domExplicit.length}`);
  const pinTally = {};
  for (const r of lockstepRisk) for (const p of r.lockstepPinRisk) pinTally[p] = (pinTally[p] || 0) + 1;
  const topPins = Object.entries(pinTally).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (topPins.length) {
    L("  most common exact pins at risk:");
    for (const [k, n] of topPins) L(`     ${String(k).padEnd(24)} ${n}`);
  }
  if (lockstepRiskVisible.length) {
    L("  gallery-visible templates at risk (first 20):");
    for (const r of lockstepRiskVisible.slice(0, 20)) {
      L(`     [${String(r.category || "?").padEnd(16)}] ${String(r.id).padEnd(14)} :: ${r.lockstepPinRisk.join(", ")}`);
    }
  }

  L("\n-- ENV: reads process.env & is it auto-filled? --");
  const readsEnv = records.filter((r) => (r.envRefCount || 0) > 0).length;
  const missServer = countIssue(records, "env-missing-server");
  const missPublic = countIssue(records, "env-missing-public");
  const shipsEnvFile = records.filter((r) => (r.envFilesShipped || []).length > 0).length;
  L(`  reads process.env at all ................. ${readsEnv}  ${pct(readsEnv, total)}`);
  L(`  reads UNCOVERED server key (crash risk) . ${missServer}  ${pct(missServer, total)}`);
  L(`  reads UNCOVERED NEXT_PUBLIC_ only ....... ${missPublic}  ${pct(missPublic, total)}`);
  L(`  ships a committed .env* file ............ ${shipsEnvFile}  ${pct(shipsEnvFile, total)}`);
  const uncoveredTally = {};
  for (const r of records) for (const k of (r.envUncovered || [])) uncoveredTally[k] = (uncoveredTally[k] || 0) + 1;
  const topUncovered = Object.entries(uncoveredTally).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (topUncovered.length) {
    L("  top uncovered env keys (referenced but NOT auto-filled):");
    for (const [k, n] of topUncovered) L(`     ${String(k).padEnd(34)} ${n}`);
  }

  L("\n-- ENV PLACEMENT of uncovered server keys (how acute is the crash risk?) --");
  const byPlacement = (p) => records.filter((r) => r.envPlacement === p);
  const crashLoad = byPlacement("crash-on-load");
  const crashRoute = byPlacement("crash-on-route");
  const lazyOnly = byPlacement("lazy-only");
  const visN = (arr) => arr.filter((r) => r.galleryVisible === true).length;
  L(`  crash-on-load  (top-level in render path -> BREAKS preview) : ${crashLoad.length}  (klickbara: ${visN(crashLoad)})`);
  L(`  crash-on-route (top-level, only in an API route)           : ${crashRoute.length}  (klickbara: ${visN(crashRoute)})`);
  L(`  lazy-only      (inside handlers -> preview OK, feature dead): ${lazyOnly.length}  (klickbara: ${visN(lazyOnly)})`);
  if (crashLoad.length) {
    L("  crash-on-load templates (worst first):");
    for (const r of crashLoad.sort((a, b) => b.envUncoveredServer.length - a.envUncoveredServer.length).slice(0, 15)) {
      const topKeys = (r.envPlacementDetail || []).filter((d) => d.topLevel && d.role !== "route").map((d) => d.key);
      L(`     [${String(r.category || "?").padEnd(16)}] ${String(r.id).padEnd(14)} vis=${r.galleryVisible ? "Y" : "n"} :: ${[...new Set(topKeys)].join(", ")}`);
    }
  }

  const withManifest = records.filter((r) => r.manifestPreviewFits !== null && r.manifestPreviewFits !== undefined);
  if (withManifest.length) {
    const mismatch = withManifest.filter((r) => r.manifestPreviewFits !== r.fitsHostCaps);
    L(`\n-- Cross-check: my host-cap calc vs manifest.previewFits: ${mismatch.length} mismatch of ${withManifest.length} --`);
  }

  const worst = [...records].sort((a, b) => ((b.issues || []).length) - ((a.issues || []).length)).slice(0, 15);
  L("\n-- 15 templates with the MOST issues --");
  for (const r of worst) L(`  [${String(r.category || "?").padEnd(18)}] ${String(r.id).padEnd(14)} vis=${r.galleryVisible ? "Y" : "n"} :: ${(r.issues || []).join(", ")}`);

  L("\n(Full per-template records in " + args.out + ")");
}

main().catch((e) => { console.error(e); process.exit(1); });
