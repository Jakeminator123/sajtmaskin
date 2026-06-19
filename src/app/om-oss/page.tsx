import AboutPage from "@viewser/marketing/om-oss";
import { MarketingShell } from "@viewser/marketing-shell";

export { metadata } from "@viewser/marketing/om-oss";

export default function Page() {
  return (
    <MarketingShell>
      <AboutPage />
    </MarketingShell>
  );
}
