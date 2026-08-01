/**
 * Window-event som broar Fast Edit Lane-resultat från ytor UTANFÖR builderns
 * props-kedja (OpenClaws `apply_quick_edit`-kort) in till builder-controllern.
 *
 * Samma mönster som `sajtmaskin:auto-fix` (`src/lib/hooks/chat/auto-fix-events.ts`):
 * kortet dispatchar efter en lyckad quick edit, `useBuilderPageController`
 * lyssnar och kör `handleFilesSaved(payload)` när chatten matchar — så den nya
 * minor-versionen väljs, versionslistan uppdateras och preview-sessionens
 * no-restart-meta trädas igenom. Utan detta pekar builderns
 * `engineLatestKnownVersionId` kvar på den ersatta basen och NÄSTA
 * snabbändring avvisas med `stale_base_version` (Bugbot 2026-08-01).
 */

export const QUICK_EDIT_APPLIED_EVENT_NAME = "sajtmaskin:quick-edit-applied";

export interface QuickEditAppliedPayload {
  chatId: string;
  versionId: string;
  previewUrl: string | null;
  previewSessionId: string | null;
  previewMode: string | null;
}

export function dispatchQuickEditAppliedEvent(payload: QuickEditAppliedPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(QUICK_EDIT_APPLIED_EVENT_NAME, { detail: payload }));
}

export function readQuickEditAppliedEventPayload(
  event: Event,
): QuickEditAppliedPayload | null {
  const payload = (event as CustomEvent<QuickEditAppliedPayload>).detail;
  if (!payload?.chatId || !payload?.versionId) return null;
  return payload;
}
