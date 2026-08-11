import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { resolveRegistryStyle } from "./registry-url";

/**
 * Locks the split that the Codex P2 fix introduced on the new-york-v4 work:
 *
 *   - `components.json` is the shadcn **CLI** config and MUST stay valid against
 *     the official `https://ui.shadcn.com/schema.json` `style` enum, or the CLI
 *     / MCP / editor can reject it before listing or adding components.
 *   - The canonical runtime style is resolved separately in `registry-url.ts`,
 *     which coerces the schema-valid alias to the COMPLETE `new-york-v4` set.
 *
 * Regression guard so `components.json.style` can't silently drift back to the
 * schema-invalid `new-york-v4`.
 */

// The `style` enum from https://ui.shadcn.com/schema.json (fetched 2026-06-24).
const SCHEMA_VALID_STYLES = new Set([
  "default",
  "new-york",
  "radix-vega",
  "radix-nova",
  "radix-maia",
  "radix-lyra",
  "radix-mira",
  "radix-luma",
  "radix-sera",
  "radix-rhea",
  "base-vega",
  "base-nova",
  "base-maia",
  "base-lyra",
  "base-mira",
  "base-luma",
  "base-sera",
  "base-rhea",
]);

describe("components.json shadcn config", () => {
  const componentsJson = JSON.parse(
    readFileSync(path.join(process.cwd(), "components.json"), "utf8"),
  ) as {
    style?: string;
    $schema?: string;
    registries?: Record<string, string | { url?: string }>;
  };

  it("declares the official ui.shadcn.com schema", () => {
    expect(componentsJson.$schema).toBe("https://ui.shadcn.com/schema.json");
  });

  it("uses a schema-valid style (never the schema-invalid new-york-v4)", () => {
    expect(componentsJson.style).toBeDefined();
    expect(componentsJson.style).not.toBe("new-york-v4");
    expect(SCHEMA_VALID_STYLES.has(componentsJson.style ?? "")).toBe(true);
  });

  it("still resolves to the complete new-york-v4 set at runtime for the official registry", () => {
    expect(resolveRegistryStyle(componentsJson.style, "https://ui.shadcn.com")).toBe(
      "new-york-v4",
    );
  });
});

/**
 * Fas 0 of the shadcn-registry consolidation (plan
 * 2026-07-22-shadcn-registry-beskriv-komposition.md) makes `components.json`
 * the canonical registry config: a `registries` key mapping the community
 * namespaces (`@shadcnblocks`, `@tailark-oss`, `@magicui`) that
 * `config/community-registries.json` seeds today. Fas 6 adds the internal
 * `@sajtmaskin` registry, served by the app itself from
 * `src/app/r/[name]/route.ts` (see `src/lib/sajtmaskin-registry/`).
 *
 * The built-in `@shadcn` (and `@v0`) registries are pre-configured in the CLI
 * and MUST NOT be declared here — shadcn CLI 4.x rejects a components.json that
 * redeclares a built-in namespace, which would break the pinned `shadcn mcp`
 * wrapper. Only custom/community namespaces belong in `registries`.
 *
 * This is the shadcn-supported `registries` field (see
 * https://ui.shadcn.com/docs/components-json and /docs/registry/namespace): each
 * value is a URL template and the `{name}` placeholder is mandatory. The key is
 * inert at runtime until the resolver (Fas 4) reads it, so this guard just locks
 * the shape so it can't silently drift or lose a namespace.
 *
 * `@tailark-oss` uses the free public host + Radix path (`/r/radix/{name}.json`)
 * to match `style: radix-vega`. Gated Quartz (`@tailark` on tailark.com) is
 * intentionally not wired — it requires TAILARK_API_KEY.
 */
describe("components.json canonical registries", () => {
  const componentsJson = JSON.parse(
    readFileSync(path.join(process.cwd(), "components.json"), "utf8"),
  ) as { registries?: Record<string, string | { url?: string }> };

  const EXPECTED_REGISTRIES: Record<string, string> = {
    "@shadcnblocks": "https://shadcnblocks.com/r/{name}.json",
    "@tailark-oss": "https://oss.tailark.com/r/radix/{name}.json",
    "@magicui": "https://magicui.design/r/{name}",
    // Fas 6: internal registry served by the app itself (src/app/r/[name]/route.ts).
    "@sajtmaskin": "https://sajtmaskin.vercel.app/r/{name}.json",
  };

  it("declares a registries map", () => {
    expect(componentsJson.registries).toBeDefined();
    expect(typeof componentsJson.registries).toBe("object");
  });

  it("maps exactly the expected namespaces (built-in @shadcn/@v0 stay implicit)", () => {
    expect(Object.keys(componentsJson.registries ?? {}).sort()).toEqual(
      Object.keys(EXPECTED_REGISTRIES).sort(),
    );
  });

  it("uses the expected URL template for each namespace", () => {
    for (const [namespace, url] of Object.entries(EXPECTED_REGISTRIES)) {
      expect(componentsJson.registries?.[namespace]).toBe(url);
    }
  });

  it("keeps the mandatory {name} placeholder in every registry URL template", () => {
    for (const value of Object.values(componentsJson.registries ?? {})) {
      const url = typeof value === "string" ? value : (value.url ?? "");
      expect(url).toContain("{name}");
    }
  });

  it("only uses https registry URLs (no secrets, public repo)", () => {
    for (const value of Object.values(componentsJson.registries ?? {})) {
      const url = typeof value === "string" ? value : (value.url ?? "");
      expect(url.startsWith("https://")).toBe(true);
    }
  });

  it("keeps @tailark-oss seed URLs + Mist item names aligned with components.json", () => {
    const seed = JSON.parse(
      readFileSync(path.join(process.cwd(), "config", "community-registries.json"), "utf8"),
    ) as Array<{
      namespace: string;
      url: string;
      sectionMappings?: Record<string, string[]>;
    }>;
    const tailark = seed.find((entry) => entry.namespace === "@tailark-oss");
    expect(tailark?.url).toBe(EXPECTED_REGISTRIES["@tailark-oss"]);
    const mappings = tailark?.sectionMappings ?? {};
    const itemNames = Object.values(mappings).flat();
    expect(itemNames.length).toBeGreaterThan(0);
    expect(seed.some((entry) => entry.namespace === "@tailark")).toBe(false);

    // Live-verified Mist catalog counts on oss.tailark.com (2026-08-12).
    // Guards silent 404s from typos/stale names without a network call in CI.
    const expectedCounts: Record<string, number> = {
      hero: 6,
      features: 11,
      pricing: 2,
      cta: 3,
      faq: 3,
      footer: 4,
      testimonials: 5,
      contact: 1,
      team: 2,
      stats: 4,
      "logo-cloud": 2,
      integrations: 3,
      content: 4,
    };
    expect(Object.keys(mappings).sort()).toEqual(Object.keys(expectedCounts).sort());
    const itemSlugBySection: Record<string, string> = {
      hero: "hero-section",
      features: "features",
      pricing: "pricing",
      cta: "call-to-action",
      faq: "faqs",
      footer: "footer",
      testimonials: "testimonials",
      contact: "contact",
      team: "team",
      stats: "stats",
      "logo-cloud": "logo-cloud",
      integrations: "integrations",
      content: "content",
    };
    for (const [section, count] of Object.entries(expectedCounts)) {
      const names = mappings[section] ?? [];
      expect(names, section).toHaveLength(count);
      const slug = itemSlugBySection[section];
      for (let i = 0; i < names.length; i++) {
        expect(names[i]).toBe(`mist-${slug}-${i + 1}`);
      }
    }
  });
});
