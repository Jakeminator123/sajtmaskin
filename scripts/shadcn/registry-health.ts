/**
 * shadcn registry health check (manual / soft).
 *
 * Live-verifies every registry reference the app hands to users or to the
 * model, using the same URL builders as runtime:
 *
 * - official ui.shadcn.com: index, a component, a block and a preview PNG for
 *   the canonical runtime style (`src/lib/shadcn/registry-url.ts`);
 * - every name in `FEATURED_BLOCKS`, `CURATED_UI_COLLECTIONS` and the legacy
 *   UI-recipe candidates, fetched through the runtime style fallback chain;
 * - every `OFFICIAL_BLOCK_PREVIEW_IMAGE_NAMES` thumbnail (light + dark);
 * - every community item seeded in `config/community-registries.json` plus the
 *   featured shadcnblocks shortcuts, with `SHADCNBLOCKS_API_KEY` when it is set.
 *
 * Unit tests mock fetch, so this is the only check that proves the names still
 * exist upstream. A shadcnblocks Pro item answering 401 is a warning without a
 * key and a failure with one (the key is then rejected: invalid, expired,
 * revoked or not on a Pro plan).
 *
 * Network-dependent by design, so it is SOFT by default (always exits 0, prints
 * a report) and intended to be run manually or in an opt-in CI job. Use
 * `--strict` to make any failure exit non-zero.
 *
 * Usage:
 *   npm run shadcn:health            # report only, never fails the shell
 *   npm run shadcn:health -- --strict  # exit 1 on any failed probe
 */

import { inferCapabilities } from "../../src/lib/gen/capability-inference";
import { buildLegacyCandidates } from "../../src/lib/gen/data/shadcn-ui-recipes";
import { FEATURED_SHADCNBLOCKS } from "../../src/lib/shadcn/community-registry-catalog";
import {
  buildCommunityRegistryRequest,
  isShadcnblocksRegistryUrl,
} from "../../src/lib/shadcn/community-registry-fetch";
import { loadDescribeCommunityRegistries } from "../../src/lib/shadcn/registry-search";
import {
  CURATED_UI_COLLECTIONS,
  FEATURED_BLOCKS,
  OFFICIAL_BLOCK_PREVIEW_IMAGE_NAMES,
  buildPreviewImageUrl,
} from "../../src/lib/shadcn/registry-service";
import {
  getRegistryBaseUrl,
  getStyleFallbackChain,
  resolvePreviewImageStyle,
  resolveRegistryStyle,
} from "../../src/lib/shadcn/registry-url";

const STRICT = process.argv.includes("--strict");
const FETCH_TIMEOUT_MS = 20_000;
const CONCURRENCY = 8;

type Outcome = "pass" | "warn" | "fail";

interface Probe {
  label: string;
  url: string;
  kind: "json" | "image";
}

interface ProbeResult extends Probe {
  ok: boolean;
  detail: string;
}

interface ReferenceResult {
  group: string;
  name: string;
  outcome: Outcome;
  detail: string;
}

async function fetchWithRetry(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  }
}

async function mapWithConcurrency<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    }),
  );
  return results;
}

function hasFileContent(data: unknown): boolean {
  const files = (data as { files?: Array<{ content?: unknown }> } | null)?.files;
  return (
    Array.isArray(files) &&
    files.some((file) => typeof file?.content === "string" && file.content.trim().length > 0)
  );
}

async function probe(p: Probe): Promise<ProbeResult> {
  try {
    const res = await fetchWithRetry(p.url, { method: p.kind === "image" ? "HEAD" : "GET" });
    if (!res.ok) {
      return { ...p, ok: false, detail: `HTTP ${res.status}` };
    }
    if (p.kind === "image") {
      const type = res.headers.get("content-type") ?? "";
      if (!type.startsWith("image/")) {
        return { ...p, ok: false, detail: `unexpected content-type "${type}"` };
      }
      return { ...p, ok: true, detail: type };
    }
    const data = (await res.json()) as { files?: unknown[]; items?: unknown[] } | unknown[];
    const count = Array.isArray(data)
      ? data.length
      : (data.files?.length ?? data.items?.length ?? 0);
    return { ...p, ok: true, detail: `${count} entr${count === 1 ? "y" : "ies"}` };
  } catch (err) {
    return { ...p, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Same lookup as runtime: first style in the fallback chain that serves files. */
async function checkOfficialItem(
  group: string,
  name: string,
  base: string,
  chain: string[],
): Promise<ReferenceResult> {
  for (const style of chain) {
    const url = `${base}/r/styles/${encodeURIComponent(style)}/${encodeURIComponent(name)}.json`;
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) continue;
      if (!hasFileContent(await res.json())) continue;
      return style === chain[0]
        ? { group, name, outcome: "pass", detail: style }
        : { group, name, outcome: "pass", detail: `only via fallback style ${style}` };
    } catch {
      continue;
    }
  }
  return { group, name, outcome: "fail", detail: `missing in ${chain.join(", ")}` };
}

async function checkPreviewImage(name: string): Promise<ReferenceResult> {
  for (const theme of ["light", "dark"] as const) {
    const url = buildPreviewImageUrl(name, theme);
    const res = await fetchWithRetry(url, { method: "HEAD" }).catch(() => null);
    const type = res?.headers.get("content-type") ?? "";
    if (!res?.ok || !type.startsWith("image/")) {
      return {
        group: "OFFICIAL_BLOCK_PREVIEW_IMAGE_NAMES",
        name,
        outcome: "fail",
        detail: `${theme}: HTTP ${res?.status ?? "network error"} (${url})`,
      };
    }
  }
  return { group: "OFFICIAL_BLOCK_PREVIEW_IMAGE_NAMES", name, outcome: "pass", detail: "" };
}

async function checkCommunityItem(
  group: string,
  namespace: string,
  urlTemplate: string,
  name: string,
): Promise<ReferenceResult> {
  const label = `${namespace}/${name}`;
  const request = buildCommunityRegistryRequest(
    urlTemplate.replace("{name}", encodeURIComponent(name)),
  );
  try {
    const res = await fetchWithRetry(request.url, request.init);
    if (res.ok) {
      return hasFileContent(await res.json())
        ? { group, name: label, outcome: "pass", detail: "" }
        : { group, name: label, outcome: "fail", detail: "200 without file content" };
    }
    if (res.status === 401 && isShadcnblocksRegistryUrl(request.url)) {
      return process.env.SHADCNBLOCKS_API_KEY?.trim()
        ? {
            group,
            name: label,
            outcome: "fail",
            detail:
              "401 with SHADCNBLOCKS_API_KEY: key rejected (invalid, expired, revoked or no Pro plan)",
          }
        : {
            group,
            name: label,
            outcome: "warn",
            detail: "401: Pro item, needs SHADCNBLOCKS_API_KEY",
          };
    }
    return { group, name: label, outcome: "fail", detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      group,
      name: label,
      outcome: "fail",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function allCapabilitiesOn() {
  const caps = inferCapabilities("");
  return Object.fromEntries(
    Object.entries(caps).map(([key, value]) => [key, typeof value === "boolean" ? true : value]),
  ) as typeof caps;
}

function report(results: ReferenceResult[]): { failures: number; warnings: number } {
  const groups = [...new Set(results.map((r) => r.group))];
  let failures = 0;
  let warnings = 0;
  for (const group of groups) {
    const rows = results.filter((r) => r.group === group);
    const failed = rows.filter((r) => r.outcome === "fail");
    const warned = rows.filter((r) => r.outcome === "warn");
    const viaFallback = rows.filter((r) => r.detail.startsWith("only via fallback"));
    failures += failed.length;
    warnings += warned.length;
    const status = failed.length > 0 ? "FAIL" : warned.length > 0 ? "WARN" : "PASS";
    const extras = [
      warned.length > 0 ? `${warned.length} warn` : "",
      viaFallback.length > 0 ? `${viaFallback.length} via fallback style` : "",
    ].filter(Boolean);
    console.info(
      `  [${status}] ${group.padEnd(34)} ${rows.length - failed.length - warned.length}/${rows.length} ok${
        extras.length > 0 ? ` (${extras.join(", ")})` : ""
      }`,
    );
    for (const row of [...failed, ...warned]) {
      console.info(`         ${row.outcome === "fail" ? "x" : "!"} ${row.name}: ${row.detail}`);
    }
  }
  return { failures, warnings };
}

async function main() {
  const base = getRegistryBaseUrl();
  const style = resolveRegistryStyle(undefined, base);

  console.info(`[shadcn-health] base=${base} style=${style} strict=${STRICT}`);

  if (style === "radix-vega") {
    // The whole point of the canonical-style choice is to avoid this alias.
    console.error(
      "[shadcn-health] FAIL: runtime style resolved to the incomplete radix-vega alias.",
    );
    if (STRICT) process.exitCode = 1;
    return;
  }

  // Preview PNGs live under their own style path (see resolvePreviewImageStyle).
  const imageStyle = resolvePreviewImageStyle(undefined, base);
  const probes: Probe[] = [
    { label: "index", url: `${base}/r/styles/${style}/registry.json`, kind: "json" },
    { label: "component (button)", url: `${base}/r/styles/${style}/button.json`, kind: "json" },
    { label: "block (login-01)", url: `${base}/r/styles/${style}/login-01.json`, kind: "json" },
    {
      label: "preview png (login-01-light)",
      url: `${base}/r/styles/${imageStyle}/login-01-light.png`,
      kind: "image",
    },
  ];

  const results = await Promise.all(probes.map(probe));

  let failures = 0;
  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    if (!r.ok) failures += 1;
    console.info(`  [${status}] ${r.label.padEnd(28)} ${r.detail}  (${r.url})`);
    if (r.url.includes("radix-vega")) {
      failures += 1;
      console.error(`  [FAIL] ${r.label}: URL leaked the radix-vega style`);
    }
  }

  const chain = getStyleFallbackChain(undefined, base);
  const officialGroups: Array<[string, string[]]> = [
    ["FEATURED_BLOCKS", FEATURED_BLOCKS.flatMap((group) => group.blocks)],
    ["CURATED_UI_COLLECTIONS", CURATED_UI_COLLECTIONS.flatMap((c) => c.itemNames)],
    [
      "legacy UI-recipe candidates",
      // Some candidates (e.g. `tabs`) only come from prompt keywords, so the
      // prompt must hit every keyword branch in buildLegacyCandidates.
      buildLegacyCandidates(allCapabilitiesOn(), "modal dashboard login pricing").map(
        (c) => c.name,
      ),
    ],
  ];
  const officialTasks = officialGroups.flatMap(([group, names]) =>
    [...new Set(names)].map((name) => ({ group, name })),
  );
  const officialResults = await mapWithConcurrency(officialTasks, (task) =>
    checkOfficialItem(task.group, task.name, base, chain),
  );
  const imageResults = await mapWithConcurrency(
    [...OFFICIAL_BLOCK_PREVIEW_IMAGE_NAMES],
    checkPreviewImage,
  );

  const communityTasks: Array<{
    group: string;
    namespace: string;
    urlTemplate: string;
    name: string;
  }> = [];
  const registries = loadDescribeCommunityRegistries();
  for (const registry of registries) {
    for (const name of registry.itemNames) {
      communityTasks.push({
        group: `community ${registry.namespace}`,
        namespace: registry.namespace,
        urlTemplate: registry.urlTemplate,
        name,
      });
    }
  }
  const shadcnblocks = registries.find((registry) => registry.namespace === "@shadcnblocks");
  if (shadcnblocks) {
    for (const item of FEATURED_SHADCNBLOCKS) {
      communityTasks.push({
        group: "FEATURED_SHADCNBLOCKS",
        namespace: shadcnblocks.namespace,
        urlTemplate: shadcnblocks.urlTemplate,
        name: item.name,
      });
    }
  }
  const communityResults = await mapWithConcurrency(communityTasks, (task) =>
    checkCommunityItem(task.group, task.namespace, task.urlTemplate, task.name),
  );

  console.info(
    `[shadcn-health] referenced names (style chain ${chain.join(" -> ")}; SHADCNBLOCKS_API_KEY ${
      process.env.SHADCNBLOCKS_API_KEY?.trim() ? "set" : "not set"
    }):`,
  );
  const referenced = report([...officialResults, ...imageResults, ...communityResults]);
  failures += referenced.failures;

  if (failures > 0) {
    console.error(`[shadcn-health] ${failures} probe(s) failed.`);
    if (STRICT) process.exitCode = 1;
  } else {
    console.info(
      `[shadcn-health] all probes passed${
        referenced.warnings > 0 ? ` (${referenced.warnings} warning(s))` : ""
      }.`,
    );
  }
}

main().catch((err) => {
  console.error("[shadcn-health] fatal:", err);
  if (STRICT) process.exitCode = 1;
});
