/**
 * Discreet, theme-aware notice for subscription / billing UI (a pricing or
 * "manage billing" button) when Paddle Billing is not configured yet. Lets the
 * button render in a calm "demo mode" instead of crashing or showing a raw
 * error. Mirrors the payments dossier's IntegrationConfigNotice. Copy is in
 * Swedish (user-facing); adapt it to the site's tone/theme as needed.
 */
export function SubscriptionConfigNotice() {
  return (
    <p
      role="note"
      className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
    >
      Prenumerationer är inte aktiverade ännu – knappen visas i demoläge tills
      Paddle och prenumerationsdatabasen är konfigurerade.
    </p>
  );
}
