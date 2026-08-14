/**
 * Shared detector for the preview-host placeholder HTML
 * (`sendRuntimeStartingPage` / held-error page in
 * `preview-host/src/runtime/preview-proxy.js`).
 *
 * Used by F2 product postcheck and thumbnail capture so neither treats the
 * dark "Startar preview" page (status `warm_project`) as a real site.
 *
 * An empty or failed probe is **not** the boot page. Chromium can return
 * nothing when the app's own capture path fails (full `/tmp`, evaluate
 * miss). That outcome is `unreadable` — it must not be phrased as
 * "preview-host is still showing the start page".
 */

export type PreviewHostBootPageProbe = {
  title?: string | null;
  h1?: string | null;
  bodyText?: string | null;
};

/** What a single HTML probe can honestly claim. */
export type PreviewPageProbeClassification = "boot_page" | "unreadable" | "live";

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

/**
 * Thrown when the capture probe got no readable page content. Distinct from
 * {@link PreviewHostBootPageError}: we do not know what the host is showing.
 */
export class PreviewProbeUnreadableError extends Error {
  readonly code = "preview_probe_unreadable" as const;

  constructor(message = "Page probe returned no readable content.") {
    super(message);
    this.name = "PreviewProbeUnreadableError";
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

export function isPreviewProbeUnreadableError(error: unknown): boolean {
  if (error instanceof PreviewProbeUnreadableError) return true;
  if (!(error instanceof Error)) return false;
  if (error.name === "PreviewProbeUnreadableError") return true;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && cause !== error) return isPreviewProbeUnreadableError(cause);
  return /\bpreview_probe_unreadable\b|no readable content/i.test(error.message);
}

function hasPreviewHostBootMarkers(input: PreviewHostBootPageProbe): boolean {
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
  return false;
}

/**
 * Classify one HTML probe. Empty title/h1/body — or a missing probe — is
 * `unreadable`, not `boot_page`. Only the host placeholder markers count as
 * the start page.
 */
export function classifyPreviewPageProbe(
  input: PreviewHostBootPageProbe | null | undefined,
): PreviewPageProbeClassification {
  if (!input) return "unreadable";
  if (hasPreviewHostBootMarkers(input)) return "boot_page";
  const body = (input.bodyText ?? "").trim();
  if (body.length === 0) return "unreadable";
  return "live";
}

export function isPreviewHostBootPage(input: PreviewHostBootPageProbe): boolean {
  return classifyPreviewPageProbe(input) === "boot_page";
}
