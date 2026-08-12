/** Generate the committed, client-safe scaffold metadata projection. */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getAllScaffolds } from "../../src/lib/gen/scaffolds/registry";
import type { ScaffoldManifest } from "../../src/lib/gen/scaffolds/types";

export const CLIENT_LIST_PATH = resolve(
  process.cwd(),
  "src/lib/gen/scaffolds/scaffold-client-list.generated.ts",
);

type ScaffoldClientMetadata = Pick<
  ScaffoldManifest,
  "id" | "label" | "description" | "allowedBuildIntents"
>;

const HEADER = `/**
 * GENERATED FILE — client-safe projection of the runtime scaffold registry.
 * Source: src/lib/gen/scaffolds/registry.ts + each registered manifest.
 * Generator: scripts/scaffolds/generate-client-list.ts
 * Regenerate: npm run scaffolds:client-list:write
 */`;

function quote(value: string): string {
  return JSON.stringify(value);
}

export function renderScaffoldClientList(scaffolds: readonly ScaffoldClientMetadata[]): string {
  const ids = scaffolds.map((scaffold) => scaffold.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Cannot generate scaffold client list with duplicate ids.");
  }
  const entries = scaffolds.map(
    (scaffold) =>
      `  { id: ${quote(scaffold.id)}, label: ${quote(scaffold.label)}, description: ${quote(scaffold.description)}, allowedBuildIntents: [${scaffold.allowedBuildIntents.map(quote).join(", ")}] },`,
  );
  return [
    HEADER,
    'import type { ScaffoldId } from "./types";',
    "",
    "export type ScaffoldClientListEntry = {",
    "  readonly id: ScaffoldId;",
    "  readonly label: string;",
    "  readonly description: string;",
    '  readonly allowedBuildIntents: ReadonlyArray<"website" | "app" | "template">;',
    "};",
    "",
    "// Keep one deterministic row per manifest; the freshness gate owns this layout.",
    "// prettier-ignore",
    "export const SCAFFOLD_CLIENT_LIST: ReadonlyArray<ScaffoldClientListEntry> = [",
    ...entries,
    "];",
    "",
  ].join("\n");
}

export function expectedScaffoldClientListSource(): string {
  return renderScaffoldClientList(getAllScaffolds());
}

type ClientListMode = "check" | "write";
type ClientListSyncResult = "in-sync" | "out-of-sync" | "written";

function parseMode(args: readonly string[]): ClientListMode {
  const check = args.includes("--check");
  const write = args.includes("--write");
  if (check === write) {
    throw new Error("Pass exactly one of --check or --write.");
  }
  return write ? "write" : "check";
}

function writeAtomically(path: string, contents: string): void {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, contents, "utf8");
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function synchronizeScaffoldClientList(
  path: string,
  expected: string,
  mode: ClientListMode,
): ClientListSyncResult {
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === expected) return "in-sync";
  if (mode === "check") return "out-of-sync";
  writeAtomically(path, expected);
  return "written";
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  const expected = expectedScaffoldClientListSource();
  const count = getAllScaffolds().length;
  const result = synchronizeScaffoldClientList(CLIENT_LIST_PATH, expected, mode);

  if (result === "in-sync") {
    console.log(`[scaffold-client-list] in sync (${count} scaffolds)`);
    return;
  }
  if (result === "out-of-sync") {
    console.error("[scaffold-client-list] OUT OF SYNC with the runtime registry.");
    console.error("Run `npm run scaffolds:client-list:write` to regenerate.");
    process.exitCode = 1;
    return;
  }
  console.log(`[scaffold-client-list] wrote ${CLIENT_LIST_PATH} (${count} scaffolds)`);
}

function isInvokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isInvokedDirectly()) {
  try {
    main();
  } catch (error) {
    console.error(`[scaffold-client-list] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 2;
  }
}
