import MarketingHome from "@viewser/marketing/home";
import { MarketingShell } from "@viewser/marketing-shell";

export { metadata } from "@viewser/marketing/home";

export default function Page() {
  return (
    <MarketingShell>
      <MarketingHome />
    </MarketingShell>
  );
}
