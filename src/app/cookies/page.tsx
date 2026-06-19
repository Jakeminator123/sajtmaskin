import CookiesPage from "@viewser/marketing/cookies";
import { MarketingShell } from "@viewser/marketing-shell";

export { metadata } from "@viewser/marketing/cookies";

export default function Page() {
  return (
    <MarketingShell>
      <CookiesPage />
    </MarketingShell>
  );
}
