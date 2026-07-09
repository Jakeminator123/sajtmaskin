/**
 * Calm, theme-aware notice for subscription/billing UI when Paddle Billing is
 * not configured yet (mock: "none" — billing cannot be meaningfully mocked).
 * Render it next to the pricing / manage-billing CTA and keep the CTA in a
 * disabled demo state instead of crashing or showing a raw error. Uses
 * neutral/muted tokens (never error-red) so an unconfigured integration reads
 * as "not set up yet", not "broken" — the IntegrationConfigNotice pattern.
 * Copy is Swedish (user-facing); adapt wording to the site's tone as needed.
 */
export function SubscriptionConfigNotice({ className }: { className?: string }) {
  const envKeys = [
    "PADDLE_API_KEY",
    "PADDLE_NOTIFICATION_WEBHOOK_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  return (
    <div
      role="note"
      className={[
        "rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <p className="font-medium text-foreground">
        Prenumerationer är inte aktiverade ännu
      </p>
      <p className="mt-1 leading-relaxed">
        Knappen visas i demoläge tills sajten kopplas till Paddle och
        prenumerationsdatabasen är på plats.
      </p>
      <p className="mt-3">
        Miljövariabler som behövs:{" "}
        {envKeys.map((key, index) => (
          <span key={key}>
            {index > 0 ? ", " : ""}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {key}
            </code>
          </span>
        ))}
      </p>
      <a
        href="https://developer.paddle.com/api-reference/about/authentication"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block font-medium text-foreground underline underline-offset-2 hover:no-underline"
      >
        Så hittar du dina Paddle-nycklar
      </a>
    </div>
  );
}
