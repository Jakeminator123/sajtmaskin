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
 * Binding the cache to a hash of the extractor sources closes it without relying
 * on anyone remembering to bump a version constant. Any edit to those files
 * invalidates the generated records, and `npm run templates:addenda -- --write`
 * rebuilds them. A comment-only edit invalidates them too — deliberately, since
 * guessing which edits are behavioural is how this gap appeared in the first
 * place, and rebuilding costs about half a minute.
 *
 * Node-only: imported by the generator script and by the integrity test, never
 * from a request path.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Every module whose behaviour decides what ends up in a record. A record's
 * content is a function of the archive bytes plus these two: the first decides
 * which files are harvested out of the ZIP, the second which of them become
 * excerpts. Leaving either out would leave the same staleness class open.
 *
 * Written with forward slashes and joined per-platform, so the hash input is the
 * file contents rather than the path separator.
 */
export const EXTRACTOR_SOURCE_RELATIVE_PATHS = [
  "src/lib/gen/scaffold-variants/template-inspiration.ts",
  "src/lib/templates/local-v0-template-source.ts",
] as const;

/**
 * Hashed over LF-normalized bytes with any BOM removed, so a Windows checkout
 * and a Linux CI runner agree even if `.gitattributes` is ever relaxed. Paths
 * are hashed in sorted order alongside their contents, so adding a module to the
 * list changes the fingerprint even if the file contents are unchanged.
 */
export function computeExtractorSha256(repoRoot: string = process.cwd()): string {
  const digest = createHash("sha256");
  for (const relativePath of [...EXTRACTOR_SOURCE_RELATIVE_PATHS].sort()) {
    const absolutePath = path.join(repoRoot, ...relativePath.split("/"));
    const source = readFileSync(absolutePath, "utf8");
    const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    digest.update(`${relativePath}\n`, "utf8");
    digest.update(normalized, "utf8");
    digest.update("\0", "utf8");
  }
  return digest.digest("hex");
}
