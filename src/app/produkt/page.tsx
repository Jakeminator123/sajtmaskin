import ProductPage from "@viewser/marketing/produkt";
import { MarketingShell } from "@viewser/marketing-shell";

export { metadata } from "@viewser/marketing/produkt";

export default function Page() {
  return (
    <MarketingShell>
      <ProductPage />
    </MarketingShell>
  );
}
