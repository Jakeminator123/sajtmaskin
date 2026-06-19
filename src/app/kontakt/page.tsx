import ContactPage from "@viewser/marketing/kontakt";
import { MarketingShell } from "@viewser/marketing-shell";

export { metadata } from "@viewser/marketing/kontakt";

export default function Page() {
  return (
    <MarketingShell>
      <ContactPage />
    </MarketingShell>
  );
}
