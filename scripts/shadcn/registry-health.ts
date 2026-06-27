/**
 * shadcn registry health check (manual / soft).
 *
 * Live-verifies that the canonical runtime style resolved by
 * `src/lib/shadcn/registry-url.ts` actually serves the load-bearing artifacts on
 * ui.shadcn.com: the index, a component JSON, a block JSON, and a preview PNG.
 * This is the one thing the unit tests CANNOT prove — that the chosen style
 * (new-york-v4) is the COMPLETE, screenshot-backed set and not an empty alias.
 *
 * Network-dependent by design, so it is SOFT by default (always exits 0, prints
 * a report) and intended to be run manually or in an opt-in CI job. Use
 * `--strict` to make any failure exit non-zero.
 *
 * Usage:
 *   npm run shadcn:health            # report only, never fails the shell
 *   npm run shadcn:health -- --strict  # exit 1 on any failed probe
 */

import { getRegistryBaseUrl, resolveRegistryStyle } from "../../src/lib/shadcn/registry-url";

const STRICT = process.argv.includes("--strict");

interface Probe {
  label: string;
  url: string;
  kind: "json" | "image";
}

interface ProbeResult extends Probe {
  ok: boolean;
  detail: string;
}

async function probe(p: Probe): Promise<ProbeResult> {
  try {
    const res = await fetch(p.url, { method: p.kind === "image" ? "HEAD" : "GET" });
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

  const probes: Probe[] = [
    { label: "index", url: `${base}/r/styles/${style}/registry.json`, kind: "json" },
    { label: "component (button)", url: `${base}/r/styles/${style}/button.json`, kind: "json" },
    { label: "block (login-01)", url: `${base}/r/styles/${style}/login-01.json`, kind: "json" },
    {
      label: "preview png (login-01-light)",
      url: `${base}/r/styles/${style}/login-01-light.png`,
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

  if (failures > 0) {
    console.error(`[shadcn-health] ${failures} probe(s) failed.`);
    if (STRICT) process.exitCode = 1;
  } else {
    console.info("[shadcn-health] all probes passed.");
  }
}

main().catch((err) => {
  console.error("[shadcn-health] fatal:", err);
  if (STRICT) process.exitCode = 1;
});
