import PrivacyPage from "@viewser/marketing/integritetspolicy";
import { MarketingShell } from "@viewser/marketing-shell";

export { metadata } from "@viewser/marketing/integritetspolicy";

export default function Page() {
  return (
    <MarketingShell>
      <PrivacyPage />
    </MarketingShell>
  );
}
