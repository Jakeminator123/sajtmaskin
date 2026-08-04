/**
 * Fingerprint of the code that produces the addenda registry's excerpts.
 *
 * The registry is a cache of `extractVariantTemplateStructuralReferences` output
 * that was only bound to the *input* (the archive SHA-256), never to the code
 * that transformed it. So changing the extraction rules left every cached record
 * untouched: the generator skipped re-extraction because the archive SHA still
 * matched, and the runtime kept serving the old excerpts. That happened in
 * practice — tightening the direct-component rule left `components/ui/use-toast.ts`
 * sitting in the registry until the records were force-refreshed.
 *
 * Binding the cache to a hash of the extractor module closes it without relying
 * on anyone remembering to bump a version constant. Any edit to that file
 * invalidates the generated records, and `npm run templates:addenda -- --write`
 * rebuilds them.
 *
 * Node-only: imported by the generator script and by the integrity test, never
 * from a request path.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const EXTRACTOR_SOURCE_RELATIVE_PATH = path.join(
  "src",
  "lib",
  "gen",
  "scaffold-variants",
  "template-inspiration.ts",
);

/**
 * Hashed over LF-normalized bytes with any BOM removed, so a Windows checkout
 * and a Linux CI runner agree even if `.gitattributes` is ever relaxed.
 */
export function computeExtractorSha256(repoRoot: string = process.cwd()): string {
  const source = readFileSync(path.join(repoRoot, EXTRACTOR_SOURCE_RELATIVE_PATH), "utf8");
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
