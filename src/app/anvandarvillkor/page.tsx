import TermsPage from "@viewser/marketing/anvandarvillkor";
import { MarketingShell } from "@viewser/marketing-shell";

export { metadata } from "@viewser/marketing/anvandarvillkor";

export default function Page() {
  return (
    <MarketingShell>
      <TermsPage />
    </MarketingShell>
  );
}
