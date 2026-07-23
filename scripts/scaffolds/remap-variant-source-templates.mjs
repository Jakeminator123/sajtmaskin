/**
 * One-shot remap (2026-07-22): replace dead legacy external-template slugs in
 * every variant's `sourceTemplateIds` with real v0-mall Blob ids from
 * `src/lib/templates/template-blob-manifest.json`.
 *
 * The mapping below is hand-curated: each variant gets the Blob templates that
 * best match its visual direction (category + title + variant motif).
 * `sourceTemplateIds` stays a provenance label (no runtime join) — this just
 * makes the label truthful and resolvable in backoffice.
 *
 * Usage: node scripts/scaffolds/remap-variant-source-templates.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MANIFEST = JSON.parse(
  readFileSync(join(ROOT, "src/lib/templates/template-blob-manifest.json"), "utf8"),
);
const BLOB_IDS = new Set(MANIFEST.templates.map((t) => t.id));

/** variant path (scaffold/variant) → curated Blob template ids */
const MAPPING = {
  "app-shell/clean-utility": ["Pf7lw1nypu5", "m23KLm1bn8K", "FlR7JxdFesy", "ZZFpa3jFqnO"],
  "app-shell/immersive-dark": ["v9Hg1dBb5o3", "ZAyrQvYVCUs", "b7GDYVxuoGC", "GzHBHQAiS2F"],
  "auth-pages/clean-auth": ["Pr8Pms0CEBm", "E2PMKQo5S11", "oZxBJ6zcOsz", "KFyeD1PKXF4"],
  "auth-pages/glass-modern": ["VEoDcF84vxz", "FjVZH4DboBv", "gEmHlupUYoH"],
  "base-nextjs/fresh-mint": ["fUqrRFEXLnm", "sV0OtrkXM6x", "Vt3PtqfiHkh"],
  "base-nextjs/playground-mono": ["ov3ApgfOdx5", "GB2Aln8GBDP", "WKlyoWxO1ZD"],
  "base-nextjs/starter-neutral": ["sV0OtrkXM6x", "ov3ApgfOdx5", "Pf7lw1nypu5"],
  "base-nextjs/studio-soft": ["XOMN4texeRO", "iBPsMqPGRTZ", "ZIHJBIvfeuW"],
  "blog/editorial-serif": ["1FuIGdkaNxS", "1fwaS3xF7MM", "XOMN4texeRO"],
  "blog/tech-minimal": ["ov3ApgfOdx5", "1fwaS3xF7MM", "NjOUgG6VT7X"],
  "dashboard/dense-terminal": ["4b4SzAt1CLV", "lUo6XTuTJXl", "v9Hg1dBb5o3", "WKlyoWxO1ZD"],
  "dashboard/glass-frosted": ["SD8IPhg8bcC", "6UhtTqtAVaZ", "JfGEPnqVAVL", "jUBqSBJsNrz"],
  "ecommerce/boutique-warm": ["XmzC9oi7g4m", "mQB1SyhOpe8", "iBPsMqPGRTZ", "b3DN1aOd6mQ"],
  "ecommerce/megastore-clean": ["XmzC9oi7g4m", "b3DN1aOd6mQ", "o8uJYnZCaJQ", "QeFZttwuC80"],
  "ecommerce/streetwear-bold": ["QkihcSMmdWP", "0brPGNpjNkt", "XmzC9oi7g4m"],
  "landing-page/asymmetric-stack": ["VZ9EEGUUq9M", "XhGK3naSZPB", "wWvJxkk3ra7"],
  "landing-page/bold-startup": ["W0v7PBF5ev4", "XQxxv76lK5w", "zdiN8dHwaaT", "rHTER3Yq6df"],
  "landing-page/corporate-grid": ["ALfQrxyrJ8b", "8QhCJAwn16K", "Vt3PtqfiHkh", "sV0OtrkXM6x"],
  "landing-page/editorial-lux": ["XOMN4texeRO", "ZIHJBIvfeuW", "ezmvVsZJxz8"],
  "landing-page/hero-fullbleed-bg": ["R3n0gnvYFbO", "lJXGkoM1koN", "jZpf5doYiNe", "yih2hMiv5q3"],
  "landing-page/minimalist-mag": ["NFhsR5cAXJp", "XhGK3naSZPB", "lt2xTPgmFNB"],
  "landing-page/nature-flow": ["jZpf5doYiNe", "XOMN4texeRO", "mEefgKyVifq"],
  "landing-page/warm-editorial": ["XOMN4texeRO", "iBPsMqPGRTZ", "1FuIGdkaNxS"],
  "landing-page/warm-local": ["GN3Z2rw5BZz", "iBPsMqPGRTZ", "mEefgKyVifq"],
  "portfolio/minimal-studio": ["NFhsR5cAXJp", "pCMjvDLPVe3", "E3xFlIXCZi4", "mA8N4h1POSv"],
  "portfolio/showcase-bold": ["0brPGNpjNkt", "JgcWH8Dw9d3", "xAnNep21FiQ", "zjD8UoZcXy9"],
  "saas-landing/dev-terminal": ["W0v7PBF5ev4", "XQxxv76lK5w", "fnLkUW05eg3"],
  "saas-landing/friendly-saas": ["8Y9E0cStKrW", "8QhCJAwn16K", "zoQPxUaTqvE", "fUqrRFEXLnm"],
};

let changed = 0;
for (const [variantPath, ids] of Object.entries(MAPPING)) {
  const unknown = ids.filter((id) => !BLOB_IDS.has(id));
  if (unknown.length > 0) {
    throw new Error(`${variantPath}: unknown Blob ids: ${unknown.join(", ")}`);
  }
  const filePath = join(ROOT, "config/scaffold-variants", `${variantPath}.json`);
  const variant = JSON.parse(readFileSync(filePath, "utf8"));
  const before = JSON.stringify(variant.sourceTemplateIds ?? []);
  variant.sourceTemplateIds = ids;
  if (before !== JSON.stringify(ids)) {
    writeFileSync(filePath, JSON.stringify(variant, null, 2) + "\n", "utf8");
    changed += 1;
    console.log(`remapped ${variantPath}: ${ids.join(", ")}`);
  }
}
console.log(`\nDone. ${changed} variant files updated.`);
