import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { format } from "prettier";
import { describe, expect, it } from "vitest";

import type { ScaffoldManifest } from "../../src/lib/gen/scaffolds/types";
import {
  CLIENT_LIST_PATH,
  expectedScaffoldClientListSource,
  renderScaffoldClientList,
  synchronizeScaffoldClientList,
} from "./generate-client-list";

type ClientMetadata = Pick<
  ScaffoldManifest,
  "id" | "label" | "description" | "allowedBuildIntents"
>;

describe("scaffold client-list generator", () => {
  it("renders registry order and JSON-safe strings deterministically", () => {
    const rows: ClientMetadata[] = [
      {
        id: "app-shell",
        label: 'App "A" \\ svensk — rad\n2',
        description: "Först",
        allowedBuildIntents: ["app"],
      },
      {
        id: "base-nextjs",
        label: "Bas",
        description: "Sedan",
        allowedBuildIntents: ["website", "template"],
      },
    ];

    const first = renderScaffoldClientList(rows);
    expect(renderScaffoldClientList(rows)).toBe(first);
    expect(first.indexOf('id: "app-shell"')).toBeLessThan(first.indexOf('id: "base-nextjs"'));
    expect(first).toContain(`label: ${JSON.stringify(rows[0].label)}`);
    expect(first).not.toMatch(/generatedAt|\d{4}-\d{2}-\d{2}T/);
    expect(first.endsWith("\n")).toBe(true);
  });

  it("rejects duplicate scaffold ids instead of emitting ambiguous client choices", () => {
    const row: ClientMetadata = {
      id: "app-shell",
      label: "App",
      description: "App shell",
      allowedBuildIntents: ["app"],
    };
    expect(() => renderScaffoldClientList([row, row])).toThrow(/duplicate ids/);
  });

  it("keeps the committed artifact byte-identical to the runtime registry", () => {
    expect(readFileSync(CLIENT_LIST_PATH, "utf8")).toBe(expectedScaffoldClientListSource());
  });

  it("emits a Prettier-stable artifact", async () => {
    const source = expectedScaffoldClientListSource();
    expect(await format(source, { parser: "typescript" })).toBe(source);
  });

  it("recreates a missing artifact in write mode without mutating it in check mode", () => {
    const directory = mkdtempSync(join(tmpdir(), "scaffold-client-list-"));
    const path = join(directory, "client-list.generated.ts");
    const expected = "generated\n";
    try {
      expect(synchronizeScaffoldClientList(path, expected, "check")).toBe("out-of-sync");
      expect(synchronizeScaffoldClientList(path, expected, "write")).toBe("written");
      expect(readFileSync(path, "utf8")).toBe(expected);
      expect(synchronizeScaffoldClientList(path, expected, "check")).toBe("in-sync");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps the generated module safe for browser imports", () => {
    const source = readFileSync(CLIENT_LIST_PATH, "utf8");
    const imports = source.split("\n").filter((line) => line.startsWith("import "));
    expect(imports).toEqual(['import type { ScaffoldId } from "./types";']);
    expect(source).not.toMatch(/from\s+["'][^"']*(?:registry|manifest)[^"']*["']/);
    expect(source).not.toMatch(/node:|loadScaffoldFiles|scaffold-research/);
  });
});
