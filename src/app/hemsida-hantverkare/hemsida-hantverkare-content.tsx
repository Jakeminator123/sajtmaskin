import { getIndustryCopy } from "@/lib/seo-landing-pages/industry-copy";
import {
  IndustryLandingContent,
  readyRelatedSeoLandingSlugs,
} from "@/lib/seo-landing-pages/industry-landing";

const SLUG = "hemsida-hantverkare" as const;

export const FAQS = getIndustryCopy(SLUG).faqs;
export { readyRelatedSeoLandingSlugs };

export function HemsidaHantverkareContent() {
  return <IndustryLandingContent slug={SLUG} />;
}
