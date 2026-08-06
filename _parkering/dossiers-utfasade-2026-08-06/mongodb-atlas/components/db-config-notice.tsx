/**
 * Discreet notice rendered when the database is not configured and the page
 * falls back to static seed data (`seedData`). Keep it subtle — a small muted
 * banner near the affected section, never a full-page error.
 */
export function DbConfigNotice() {
  return (
    <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Visar exempeldata – databasen är inte konfigurerad ännu.
    </p>
  );
}
