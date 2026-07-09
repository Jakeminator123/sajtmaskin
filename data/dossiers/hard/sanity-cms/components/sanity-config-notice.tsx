/**
 * Discreet notice rendered when Sanity is not configured and the page falls
 * back to static example content. Keep it subtle — a small muted banner
 * near the affected section, never a full-page error (same contract as
 * `DbConfigNotice` in the database dossiers).
 */
export function SanityConfigNotice() {
  return (
    <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      CMS ej konfigurerat – exempelinnehåll visas.
    </p>
  );
}
