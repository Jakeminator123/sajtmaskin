import ProfessionLandingPage from "@viewser/marketing/for-yrke";
import { MarketingShell } from "@viewser/marketing-shell";

// Next requires `dynamicParams` as a direct literal export (it can't be
// re-exported), so it's declared here; the functions are re-exported.
export const dynamicParams = false;

export {
  generateStaticParams,
  generateMetadata,
} from "@viewser/marketing/for-yrke";

export default async function Page({
  params,
}: {
  params: Promise<{ yrke: string }>;
}) {
  return (
    <MarketingShell>
      <ProfessionLandingPage params={params} />
    </MarketingShell>
  );
}
