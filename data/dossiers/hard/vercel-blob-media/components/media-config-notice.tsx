/**
 * Discreet notice rendered when the media library is not connected and the
 * gallery falls back to the shipped sample media (`seedMedia`). Keep it
 * subtle — a small muted banner near the gallery, never a full-page error.
 */
export function MediaConfigNotice() {
  return (
    <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Visar exempelbilder och -filmer – mediabiblioteket är inte kopplat ännu.
    </p>
  );
}
