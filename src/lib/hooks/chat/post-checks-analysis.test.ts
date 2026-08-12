import { describe, expect, it } from "vitest";
import { buildPostCheckBaseline } from "./post-checks-analysis";
import type { FileEntry, VersionEntry } from "./types";

// Regression suite for the imported-repo readiness gap (prod chat 0d52e5c9,
// 2026-07-31): server-preflight downgrades project-sanity errors to warnings
// for imported v0/ZIP templates, but this client pass used to re-run sanity
// WITHOUT the downgrade — template stock files (shadcn `components/ui/
// command.tsx` without DialogTitle) produced `project_sanity_errors`, failed
// readiness and stranded the version in draft/pending.

/** Stock-shadcn-style dialog usage without DialogTitle → real sanity error. */
const STOCK_COMMAND_FILE: FileEntry = {
  name: "components/ui/command.tsx",
  content: [
    'import { Dialog, DialogContent } from "@/components/ui/dialog";',
    "",
    "export function CommandDialog() {",
    "  return (",
    "    <Dialog>",
    '      <DialogContent className="overflow-hidden p-0">',
    "        <div>Command palette</div>",
    "      </DialogContent>",
    "    </Dialog>",
    "  );",
    "}",
  ].join("\n"),
};

const PAGE_FILE: FileEntry = {
  name: "app/page.tsx",
  content: [
    "export default function Page() {",
    "  return (",
    "    <main>",
    "      <h1>Aether</h1>",
    "      <p>Your creative workspace in the cloud.</p>",
    "    </main>",
    "  );",
    "}",
  ].join("\n"),
};

function baselineParams(versions: VersionEntry[]) {
  return {
    currentFiles: [PAGE_FILE, STOCK_COMMAND_FILE],
    previousFiles: [],
    previousVersionId: null,
    versions,
    versionId: "v2",
    demoUrl: null,
    preflight: null,
  };
}

describe("buildPostCheckBaseline imported-repo sanity policy", () => {
  it("downgrades sanity errors to warnings when the chat has an imported_repo version", () => {
    const baseline = buildPostCheckBaseline(
      baselineParams([
        { versionId: "v1", editKind: "imported_repo" },
        { versionId: "v2", editKind: null },
      ]),
    );

    const dialogIssue = baseline.sanityIssues.find((issue) =>
      issue.message.includes("DialogContent is missing DialogTitle"),
    );
    expect(dialogIssue).toBeDefined();
    expect(dialogIssue?.severity).toBe("warning");
    expect(dialogIssue?.category).toBe("non_blocking_quality_warning");
    // No errors left → post-checks readiness does not emit
    // `project_sanity_errors` for inherited template files.
    expect(baseline.sanityErrors).toEqual([]);
  });

  it("keeps sanity errors blocking for normal generated chats", () => {
    const baseline = buildPostCheckBaseline(
      baselineParams([{ versionId: "v2", editKind: null }]),
    );

    const dialogError = baseline.sanityErrors.find((issue) =>
      issue.message.includes("DialogContent is missing DialogTitle"),
    );
    expect(dialogError).toBeDefined();
    expect(dialogError?.severity).toBe("error");
  });
});
