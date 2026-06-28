import { describe, it, expect, vi } from "vitest";

// The module imports `@/lib/db/client` at load for the `dbConfigured` guard.
// Mock it so the pure-formatter test never touches a real DB/env.
vi.mock("@/lib/db/client", () => ({ dbConfigured: false }));

import {
  formatOpenClawFindingsBlock,
  type OpenClawFindingRow,
} from "./findings-context";

describe("formatOpenClawFindingsBlock", () => {
  it("returns null when there are no warning/error rows", () => {
    const rows: OpenClawFindingRow[] = [
      {
        level: "info",
        category: "preflight:quality-gate",
        message: "Server verify passed.",
        meta: null,
      },
    ];
    expect(formatOpenClawFindingsBlock(rows)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(formatOpenClawFindingsBlock([])).toBeNull();
  });

  it("formats a failed gate with failed checks and error manifest", () => {
    const rows: OpenClawFindingRow[] = [
      {
        level: "error",
        category: "preflight:quality-gate",
        message: "Server verify failed.",
        meta: {
          checks: [
            { check: "typecheck", passed: false },
            { check: "build", passed: true },
          ],
          errorManifest: [
            {
              file: "app/page.tsx",
              diagnostics: [
                {
                  source: "tsc",
                  line: 12,
                  message: "TS2322: Type X is not assignable to Y",
                },
              ],
            },
          ],
        },
      },
    ];

    const block = formatOpenClawFindingsBlock(rows);
    expect(block).not.toBeNull();
    expect(block).toContain("[BUGGFYND]");
    expect(block).toContain("[error|preflight:quality-gate] Server verify failed.");
    expect(block).toContain("misslyckade kontroller: typecheck");
    expect(block).toContain("app/page.tsx");
    expect(block).toContain("TS2322");
    expect(block).toContain("[/BUGGFYND]");
  });

  it("skips info rows but keeps warning/error rows", () => {
    const rows: OpenClawFindingRow[] = [
      { level: "info", category: "server-verify:diagnostic", message: "noise", meta: null },
      { level: "warning", category: "server-repair", message: "Server repair incomplete.", meta: null },
    ];
    const block = formatOpenClawFindingsBlock(rows);
    expect(block).toContain("Server repair incomplete.");
    expect(block).not.toContain("noise");
  });

  it("caps the number of rendered finding rows", () => {
    const rows: OpenClawFindingRow[] = Array.from({ length: 20 }, (_, i) => ({
      level: "warning",
      category: "server-repair",
      message: `incomplete ${i}`,
      meta: null,
    }));
    const block = formatOpenClawFindingsBlock(rows)!;
    const bulletCount = (block.match(/^- \[/gm) ?? []).length;
    expect(bulletCount).toBe(8);
  });
});
