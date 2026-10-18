import { getComparisonCopy } from "@/lib/seo-landing-pages/comparison-copy";
import {
  ComparisonLandingContent,
  readyRelatedSeoLandingSlugs,
} from "@/lib/seo-landing-pages/comparison-landing";

const SLUG = "one-com-alternativ" as const;

export const FAQS = getComparisonCopy(SLUG).faqs;
export { readyRelatedSeoLandingSlugs };

export function OneComAlternativContent() {
  return <ComparisonLandingContent slug={SLUG} />;
}
