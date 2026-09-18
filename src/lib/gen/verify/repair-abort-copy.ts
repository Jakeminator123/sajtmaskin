/**
 * Honest terminal copy when a deploy/server repair is aborted by isolate
 * kill, budget expiry, or a dead (not-fresh) lease. Must never say the
 * repair is still "in progress".
 *
 * Kept import-light so the builder client can reuse the toast string
 * without pulling the watchdog or DB modules.
 */
export const REPAIR_ABORTED_SUMMARY =
  "Reparationen avbröts. Ingen kandidat sparades. Försök igen eller redigera filen manuellt.";

export const REPAIR_ABORTED_TOAST =
  "Reparationen avbröts. Ingen kandidat sparades. Försök igen.";
