/**
 * End-to-end smoke test: prompt -> scaffold -> complete project -> sandbox readiness.
 *
 * Verifies the full pipeline headlessly without a running dev server or browser.
 * Requires OPENAI_API_KEY in env/.env.local for embedding-based tests (steps 3-4).
 * Steps 1-2 and 5-9 work without any API key.
 *
 * Usage:
 *   npx tsx config/scripts/smoke-e2e-preview.ts
 *   npx tsx config/scripts/smoke-e2e-preview.ts "Bygg ett bokningssystem med kalender"
 */
import "dotenv/config";
import { matchScaffoldWithEmbeddings, matchScaffold } from "../../src/lib/gen/scaffolds/matcher";
import { getAllScaffolds } from "../../src/lib/gen/scaffolds/registry";
import { prepareSandboxProjectFiles } from "../../src/lib/gen/sandbox-project-files";
import { runProjectSanityChecks } from "../../src/lib/gen/validation/project-sanity";
import { buildCompleteProject } from "../../src/lib/gen/project-scaffold";
import { repairGeneratedFiles } from "../../src/lib/gen/repair-generated-files";
import { buildRoutePlan } from "../../src/lib/gen/route-plan";
import { inferCapabilities } from "../../src/lib/gen/capability-inference";
import { searchTemplateLibrary } from "../../src/lib/gen/template-library/search";
import type { CodeFile } from "../../src/lib/gen/parser";

const R = "\x1b[0m";
const G = "\x1b[32m";
const E = "\x1b[31m";
const W = "\x1b[33m";
const C = "\x1b[36m";
const B = "\x1b[1m";
const D = "\x1b[2m";

function ok(m: string) { console.log(`  ${G}pass${R} ${m}`); }
function fail(m: string) { console.log(`  ${E}FAIL${R} ${m}`); }
function warn(m: string) { console.log(`  ${W}warn${R} ${m}`); }
function hdr(m: string) { console.log(`\n${B}${C}-- ${m}${R}`); }
function dim(m: string) { console.log(`  ${D}${m}${R}`); }

const TESTS = [
  { label: "Landing (website)", prompt: "Bygg en hemsida for ett byggforetag med tjanster och kontakt", intent: "website" as const, expect: "landing-page" },
  { label: "Dashboard (app)", prompt: "Bygg en instrumentpanel med statistik och nyckeltal", intent: "app" as const, expect: "dashboard" },
  { label: "Booking (website+interactive)", prompt: "Jag vill ha ett bokningssystem med kalender och filter for mina kunder", intent: "website" as const, expect: "app-shell" },
  { label: "E-commerce", prompt: "En e-handel med produkter, varukorg och checkout", intent: "website" as const, expect: "ecommerce" },
  { label: "Blog", prompt: "En blogg med artiklar och nyhetsbrev", intent: "website" as const, expect: "blog" },
];

let p = 0, f = 0, w = 0;

async function main() {
  const custom = process.argv[2];
  const key = process.env.OPENAI_API_KEY?.trim();

  console.log(`${B}Sajtmaskin E2E Preview Smoke Test${R}`);
  console.log(`${D}embeddings -> scaffold -> project completion -> sanity -> sandbox prep${R}\n`);

  // 1. Registry & embeddings
  hdr("1. Scaffold registry & embeddings");
  const scaffolds = getAllScaffolds();
  if (scaffolds.length >= 10) { ok(`${scaffolds.length} scaffolds: ${scaffolds.map(s => s.id).join(", ")}`); p++; }
  else { fail(`Only ${scaffolds.length} scaffolds`); f++; }

  let embOk = false;
  try {
    const data = await import("../../src/lib/gen/scaffolds/scaffold-embeddings.json");
    const d = "default" in data ? data.default : data;
    if ((d as { embeddings?: unknown[] }).embeddings && (d as { embeddings: unknown[] }).embeddings.length === scaffolds.length) {
      ok(`Scaffold embeddings: ${(d as { embeddings: unknown[] }).embeddings.length} vectors`); embOk = true; p++;
    } else { warn(`Embeddings count mismatch`); w++; }
  } catch { fail("scaffold-embeddings.json missing"); f++; }

  try {
    const data = await import("../../src/lib/gen/template-library/template-library-embeddings.json");
    const d = "default" in data ? data.default : data;
    if ((d as { embeddings?: unknown[] }).embeddings && (d as { embeddings: unknown[] }).embeddings.length > 0) {
      ok(`Template library embeddings: ${(d as { embeddings: unknown[] }).embeddings.length} vectors`); p++;
    } else { warn("Template lib embeddings empty"); w++; }
  } catch { warn("template-library-embeddings.json missing (keyword fallback)"); w++; }

  // 2. Keyword matching
  hdr("2. Keyword scaffold matching");
  for (const t of TESTS) {
    const r = matchScaffold(t.prompt, t.intent);
    if (r?.family === t.expect) { ok(`${t.label} -> ${r.family}`); p++; }
    else { fail(`${t.label} -> ${r?.family ?? "null"} (expected ${t.expect})`); f++; }
  }

  // 3. Embedding matching
  hdr("3. Embedding scaffold matching (requires OPENAI_API_KEY)");
  if (!key) { warn("OPENAI_API_KEY missing -- skipping"); w++; }
  else if (!embOk) { warn("Embeddings not loaded -- skipping"); w++; }
  else {
    for (const t of TESTS.slice(0, 3)) {
      try {
        const r = await matchScaffoldWithEmbeddings(t.prompt, t.intent);
        dim(`${t.label} -> ${r.scaffold?.family ?? "null"} (src=${r.matchMeta.matchSource}, score=${r.matchMeta.embeddingScore ?? "n/a"})`);
        if (r.scaffold) { ok(`Resolved: ${r.scaffold.id}`); p++; }
        else { warn(`No scaffold for "${t.label}"`); w++; }
      } catch (e) { fail(`Embedding error: ${e instanceof Error ? e.message : String(e)}`); f++; }
    }
  }

  // 4. Template library search
  hdr("4. Template library reference search (requires OPENAI_API_KEY)");
  if (!key) { warn("OPENAI_API_KEY missing -- skipping"); w++; }
  else {
    for (const q of ["Next.js dashboard med auth", "restaurant landing page"]) {
      try {
        const r = await searchTemplateLibrary(q, 3);
        if (r.length > 0) { ok(`"${q}" -> ${r.length} hits (top: ${r[0].entry.title}, ${r[0].score.toFixed(3)})`); p++; }
        else { warn(`"${q}" -> 0 hits`); w++; }
      } catch (e) { fail(`Search failed: ${e instanceof Error ? e.message : String(e)}`); f++; }
    }
  }

  // 5. Complete project from minimal model output
  hdr("5. Complete project assembly");
  const minimal: CodeFile[] = [{
    path: "app/page.tsx",
    content: 'import { Button } from "@/components/ui/button";\n\nexport default function Page() {\n  return <main className="flex min-h-screen items-center justify-center"><Button>Hej</Button></main>;\n}',
    language: "tsx",
  }];

  const complete = buildCompleteProject(minimal);
  const paths = new Set(complete.map(f => f.path));
  const req = ["package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", "app/globals.css", "app/layout.tsx", "lib/utils.ts"];
  for (const r of req) {
    if (paths.has(r)) { ok(`Injected: ${r}`); p++; }
    else { fail(`Missing: ${r}`); f++; }
  }

  if (paths.has("components/ui/button.tsx")) { ok("shadcn/ui button.tsx auto-resolved"); p++; }
  else { warn("button.tsx not found (local ui dir may be missing)"); w++; }

  const pkg = complete.find(f => f.path === "package.json");
  if (pkg) {
    try {
      const j = JSON.parse(pkg.content);
      if (j.scripts?.dev === "next dev" && j.scripts?.build === "next build" && j.dependencies?.next && j.dependencies?.react && j.dependencies?.["react-dom"]) {
        ok("package.json: scripts + core deps OK"); p++;
      } else { fail("package.json incomplete"); f++; }
    } catch { fail("package.json invalid JSON"); f++; }
  }

  // 6. Repair + sanity
  hdr("6. Repair & sanity checks");
  const repaired = repairGeneratedFiles(complete);
  dim(`Repairs: ${repaired.fixes.length}`);
  for (const fix of repaired.fixes) dim(`  ${fix.fixer}: ${fix.description}`);

  const sanity = runProjectSanityChecks(repaired.files);
  const errs = sanity.issues.filter(i => i.severity === "error");
  const wrns = sanity.issues.filter(i => i.severity === "warning");
  if (errs.length === 0) { ok(`Sanity: 0 errors, ${wrns.length} warnings`); p++; }
  else { fail(`Sanity: ${errs.length} errors`); for (const e of errs) dim(`  ERR ${e.file}: ${e.message}`); f++; }
  for (const x of wrns) dim(`  WARN ${x.file}: ${x.message}`);

  // 7. Sandbox prep
  hdr("7. Sandbox project preparation");
  const sbx = prepareSandboxProjectFiles(minimal);
  const sbxPkg = sbx.find(f => f.name === "package.json");
  if (sbx.length >= req.length) { ok(`${sbx.length} files prepared`); p++; }
  else { fail(`Only ${sbx.length} files`); f++; }

  if (sbxPkg) {
    try {
      const j = JSON.parse(sbxPkg.content);
      if (j.scripts?.dev && j.dependencies?.next) { ok("Sandbox pkg: scripts + next OK"); p++; }
      else { fail("Sandbox pkg missing scripts/next"); f++; }
    } catch { fail("Sandbox pkg invalid JSON"); f++; }
  } else { fail("No package.json in sandbox output"); f++; }

  // 8. Route plan + capabilities
  hdr("8. Route plan & capabilities");
  const prompt = custom || "Bygg en restaurangsida med meny, bokning och kontakt";
  dim(`Prompt: "${prompt}"`);
  const sc = matchScaffold(prompt, "website");
  dim(`Scaffold: ${sc?.id ?? "null"} (${sc?.family ?? "n/a"})`);

  const rp = buildRoutePlan({ prompt, buildIntent: "website", brief: null, resolvedScaffold: sc });
  if (rp.routes.length > 0) {
    ok(`${rp.routes.length} routes planned`);
    for (const r of rp.routes) dim(`  ${r.path} -- ${r.name}`);
    p++;
  } else { warn("0 routes"); w++; }

  const caps = inferCapabilities(prompt);
  const active = Object.entries(caps).filter(([, v]) => v);
  if (active.length > 0) { ok(`Capabilities: ${active.map(([k]) => k).join(", ")}`); p++; }
  else dim("No capabilities inferred");

  // 9. package.json merge guardrail
  hdr("9. package.json merge guardrail");
  const badPkg: CodeFile[] = [
    { path: "package.json", content: JSON.stringify({ name: "bad", dependencies: { "some-lib": "^1.0.0" } }), language: "json" },
    { path: "app/page.tsx", content: 'export default function P() { return <div>X</div>; }', language: "tsx" },
  ];
  const merged = buildCompleteProject(badPkg);
  const mp = merged.find(f => f.path === "package.json");
  if (mp) {
    const j = JSON.parse(mp.content);
    const all = j.scripts?.dev === "next dev" && j.dependencies?.next && j.dependencies?.react && j.dependencies?.["some-lib"] === "^1.0.0" && j.name === "bad";
    if (all) { ok("Merge: canonical scripts + deps + model extras preserved"); p++; }
    else { fail("Merge incomplete"); f++; }
  }
  if (merged.filter(f => f.path === "package.json").length === 1) { ok("No duplicate package.json"); p++; }
  else { fail("Duplicate package.json"); f++; }

  // Summary
  console.log(`\n${B}========================================${R}`);
  console.log(`  ${G}Passed: ${p}${R}  ${E}Failed: ${f}${R}  ${W}Warnings: ${w}${R}`);
  console.log(`${B}========================================${R}\n`);

  if (f > 0) { console.log(`${E}${B}Some checks failed.${R}\n`); process.exit(1); }
  else if (w > 0) { console.log(`${W}All critical checks passed with ${w} warning(s).${R}\n`); }
  else { console.log(`${G}${B}All checks passed! Pipeline ready for real Next.js runtime.${R}\n`); }
}

main().catch(e => { console.error(`\n${E}Fatal:${R}`, e); process.exit(1); });
