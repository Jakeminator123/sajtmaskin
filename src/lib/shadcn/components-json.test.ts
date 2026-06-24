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
  ) as { style?: string; $schema?: string };

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
