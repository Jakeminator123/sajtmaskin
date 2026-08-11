/**
 * Shared detector for the preview-host placeholder HTML
 * (`sendRuntimeStartingPage` / held-error page in
 * `preview-host/src/runtime/preview-proxy.js`).
 *
 * Used by F2 product postcheck and thumbnail capture so neither treats the
 * dark "Startar preview" page (status `warm_project`) as a real site.
 */

export type PreviewHostBootPageProbe = {
  title?: string | null;
  h1?: string | null;
  bodyText?: string | null;
};

/**
 * Thrown when a capture path lands on the host boot placeholder and must not
 * persist a screenshot / declare the product ready.
 */
export class PreviewHostBootPageError extends Error {
  readonly code = "preview_boot_page" as const;

  constructor(message = "Preview-host boot placeholder is still showing.") {
    super(message);
    this.name = "PreviewHostBootPageError";
  }
}

export function isPreviewHostBootPageError(error: unknown): boolean {
  if (error instanceof PreviewHostBootPageError) return true;
  if (!(error instanceof Error)) return false;
  if (error.name === "PreviewHostBootPageError") return true;
  // Stage-wrapped thumbnail errors keep the original as `cause`.
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && cause !== error) return isPreviewHostBootPageError(cause);
  return /\bpreview_boot_page\b|boot placeholder is still showing/i.test(error.message);
}

export function isPreviewHostBootPage(input: PreviewHostBootPageProbe): boolean {
  const title = (input.title ?? "").trim();
  const h1 = (input.h1 ?? "").trim();
  const body = (input.bodyText ?? "").trim();
  if (/^Startar (om )?preview$/i.test(title) || /^Startar (om )?preview$/i.test(h1)) {
    return true;
  }
  if (/^Preview kunde inte starta$/i.test(title) || /^Preview kunde inte starta$/i.test(h1)) {
    return true;
  }
  // Body copy is stable even if heading text drifts slightly.
  if (
    /Preview-host bygger projektet och startar Next\.js/i.test(body) ||
    /Preview-runtimen startar om i bakgrunden/i.test(body)
  ) {
    return true;
  }
  // Session status pill on the placeholder HTML (`Status: warm_project`).
  // That status means boot was queued/spawned — not that the site is ready.
  if (/\bStatus:\s*warm_project\b/i.test(body)) {
    return true;
  }
  // Fly readiness also treats HTTP 200 with an empty body as "not ready"
  // (compiling / blank page). Without this, postcheck/thumbnail can false-green
  // on a still-warming runtime that never rendered the Startar-preview page.
  if (!title && !h1 && body.length === 0) {
    return true;
  }
  return false;
}
