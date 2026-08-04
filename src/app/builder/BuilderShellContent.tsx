"use client";

/**
 * Public entry for the builder shell. Implementation lives in
 * `./builder-shell-content/*` (deploy/domain, F3/readiness, registry-insert,
 * preview-layout). Active version status still flows through useVersionStatus
 * in `builder-shell-content/use-version-followup`.
 */
export { BuilderShellContent } from "./builder-shell-content/shell-content";
