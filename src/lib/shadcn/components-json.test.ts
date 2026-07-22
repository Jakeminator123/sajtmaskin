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
 * the canonical registry config: a `registries` key mapping the official
 * `@shadcn` namespace plus the community namespaces (`@shadcnblocks`,
 * `@tailark`, `@magicui`) that `config/community-registries.json` seeds today.
 *
 * This is the shadcn-supported `registries` field (see
 * https://ui.shadcn.com/docs/components-json and /docs/registry/namespace): each
 * value is a URL template and the `{name}` placeholder is mandatory. The key is
 * inert at runtime until the resolver (Fas 4) reads it, so this guard just locks
 * the shape so it can't silently drift or lose a namespace.
 */
describe("components.json canonical registries", () => {
  const componentsJson = JSON.parse(
    readFileSync(path.join(process.cwd(), "components.json"), "utf8"),
  ) as { registries?: Record<string, string | { url?: string }> };

  const EXPECTED_REGISTRIES: Record<string, string> = {
    "@shadcn": "https://ui.shadcn.com/r/{name}.json",
    "@shadcnblocks": "https://shadcnblocks.com/r/{name}.json",
    "@tailark": "https://tailark.com/r/{name}.json",
    "@magicui": "https://magicui.design/r/{name}",
  };

  it("declares a registries map", () => {
    expect(componentsJson.registries).toBeDefined();
    expect(typeof componentsJson.registries).toBe("object");
  });

  it("maps exactly the official @shadcn namespace plus the community seed namespaces", () => {
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
});
