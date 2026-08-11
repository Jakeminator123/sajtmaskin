/**
 * Fail if embedding JSON artifacts are still tracked by git.
 *
 * Usage:
 *   node scripts/embeddings/check-embeddings-not-tracked.mjs
 *   npm run embeddings:check-untracked
 */
import { execFileSync } from "node:child_process";

const FORBIDDEN = [
  "src/lib/templates/template-embeddings.json",
  "src/lib/gen/scaffolds/scaffold-embeddings.json",
  "config/scaffold-variants/_index/variant-embeddings.json",
];

function main() {
  let tracked = "";
  try {
    tracked = execFileSync("git", ["ls-files", "--", ...FORBIDDEN], {
      encoding: "utf-8",
    }).trim();
  } catch (err) {
    console.error("[embeddings:check-untracked] git ls-files failed:", err);
    process.exit(1);
  }

  if (!tracked) {
    console.info("[embeddings:check-untracked] OK — no embedding JSON tracked");
    return;
  }

  console.error("[embeddings:check-untracked] Embedding JSON must not be git-tracked:");
  for (const line of tracked.split(/\r?\n/).filter(Boolean)) {
    console.error(`  - ${line}`);
  }
  console.error(
    "Fix: npm run embeddings:promote -- --untrack\n" +
      "  (uploads to Vercel Blob then git rm --cached). Requires BLOB_READ_WRITE_TOKEN.",
  );
  process.exit(1);
}

main();
