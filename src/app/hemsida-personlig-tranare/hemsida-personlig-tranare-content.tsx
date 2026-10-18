import { getIndustryCopy } from "@/lib/seo-landing-pages/industry-copy";
import {
  IndustryLandingContent,
  readyRelatedSeoLandingSlugs,
} from "@/lib/seo-landing-pages/industry-landing";

const SLUG = "hemsida-personlig-tranare" as const;

export const FAQS = getIndustryCopy(SLUG).faqs;
export { readyRelatedSeoLandingSlugs };

export function HemsidaPersonligTranareContent() {
  return <IndustryLandingContent slug={SLUG} />;
}
