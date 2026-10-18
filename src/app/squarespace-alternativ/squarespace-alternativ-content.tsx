import { getComparisonCopy } from "@/lib/seo-landing-pages/comparison-copy";
import {
  ComparisonLandingContent,
  readyRelatedSeoLandingSlugs,
} from "@/lib/seo-landing-pages/comparison-landing";

const SLUG = "squarespace-alternativ" as const;

export const FAQS = getComparisonCopy(SLUG).faqs;
export { readyRelatedSeoLandingSlugs };

export function SquarespaceAlternativContent() {
  return <ComparisonLandingContent slug={SLUG} />;
}
