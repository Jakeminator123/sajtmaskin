import { applyPreviewOnlyRules } from "@/lib/gen/suspense/default-rules";
import type { CodeFile } from "./types";

const PREVIEW_STRIPPABLE_EXT_RE = /\.(?:[mc]?tsx?|[mc]?jsx?)$/i;

/**
 * Neither preview lane can run `next/headers`, `next/og` or `server-only`: the
 * Fly host has no request scope for them and the same-origin shim has no module
 * for them at all. The copy each lane receives gets those imports commented out;
 * the saved artefact keeps them. Every path that ships generated files to a
 * preview must go through here — see `createPreviewOnlyRules`.
 */
export function applyPreviewOnlyRulesToFiles(files: CodeFile[]): CodeFile[] {
  return files.map((file) => {
    if (!PREVIEW_STRIPPABLE_EXT_RE.test(file.path)) return file;
    const content = applyPreviewOnlyRules(file.content);
    return content === file.content ? file : { ...file, content };
  });
}
