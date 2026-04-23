/**
 * Domain-profile-driven structure + contract hints and prompt observations.
 *
 * Split out of `promptAssist.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import { type DomainProfile } from "../domain-inference";

// Domain profile is provided by domain-inference.ts (canonical source).
// buildDomainStructureHints / buildDomainContractHints remain here because
// they produce prompt text specific to the addendum format.

export function buildDomainStructureHints(domain: DomainProfile): string[] {
  switch (domain) {
    case "restaurant":
      return [
        "Treat this as a hospitality/restaurant website, not an online store.",
        "Strong default pages/sections: home, menu, about, contact, booking/reservation, opening hours, FAQ.",
        "Do not introduce cart, checkout, product catalog, inventory, or payment-provider flows unless the user explicitly asks for online ordering.",
        "Emphasize atmosphere, food/drink presentation, trust, practical visit information, and clear reservation/contact CTAs.",
      ];
    case "hotel":
      return [
        "Treat this as a hospitality/hotel website, not ecommerce.",
        "Strong default pages/sections: home, rooms, amenities/spa, about, contact, booking, FAQ.",
        "Focus on stay experience, location, rooms, amenities, and booking journey.",
      ];
    case "spa-salon":
      return [
        "Treat this as a service-booking website, not ecommerce.",
        "Strong default pages/sections: home, services/treatments, about/team, contact, booking, FAQ.",
        "Focus on treatments/services, trust, staff, ambience, and appointment booking CTAs.",
      ];
    case "clinic":
      return [
        "Treat this as a clinic/service website, not ecommerce.",
        "Strong default pages/sections: home, services, practitioners/team, about, contact, booking/request appointment, FAQ.",
        "Focus on trust, credentials, patient journey, and practical contact/booking information.",
      ];
    case "event-venue":
      return [
        "Treat this as a venue/hospitality website, not ecommerce.",
        "Strong default pages/sections: home, venue spaces, events/packages, gallery, contact, booking inquiry, FAQ.",
        "Focus on spaces, atmosphere, booking inquiry, logistics, and social proof.",
      ];
    case "ecommerce":
      return [
        "Treat this as a real online store/storefront.",
        "Strong default pages/sections: home, product/category pages, cart, checkout, trust/returns/shipping information.",
      ];
    case "portfolio":
      return [
        "Treat this as a portfolio/showcase site.",
        "Strong default pages/sections: home, selected work, about, services/contact, case studies or gallery.",
      ];
    case "saas":
      return [
        "Treat this as product/saas positioning or app-marketing.",
        "Strong default pages/sections: home, features, pricing, FAQ, contact/demo CTA.",
      ];
    case "agency":
      return [
        "Treat this as an agency/services website.",
        "Strong default pages/sections: home, services, about/team, case studies/portfolio, contact.",
      ];
    case "education":
      return [
        "Treat this as an education/course website.",
        "Strong default pages/sections: home, courses/programs, about, instructors/team, enrollment/contact, FAQ.",
      ];
    case "real-estate":
      return [
        "Treat this as a real estate/property website.",
        "Strong default pages/sections: home, listings/properties, about, agents/team, contact.",
      ];
    default:
      return [];
  }
}

export function buildDomainContractHints(domain: DomainProfile): string[] {
  switch (domain) {
    case "restaurant":
    case "hotel":
    case "spa-salon":
    case "clinic":
    case "event-venue":
      return [
        "Booking/contact keywords in hospitality or service domains do not automatically imply Stripe, checkout, carts, or persisted database contracts.",
        "If no real backend is explicitly requested, prefer static/reservation-request flows, contact forms, booking CTAs, or external-booking placeholders over local databases and payment providers.",
      ];
    case "ecommerce":
      return [
        "Ecommerce keywords do imply storefront/cart/checkout patterns and may justify payment/provider contracts.",
      ];
    default:
      return [];
  }
}

export function buildPromptAssistObservations(
  originalPrompt: string,
  domain: DomainProfile,
  sections: string[],
  styles: string[],
): string[] {
  const lines: string[] = [];
  if (domain !== "general") {
    lines.push(`- Domain profile inferred from the prompt: ${domain}.`);
  }
  if (sections.length > 0) {
    lines.push(`- Explicit section/page hints detected: ${sections.join(", ")}.`);
  }
  if (styles.length > 0) {
    lines.push(`- Style/tone hints detected: ${styles.join(", ")}.`);
  }
  if (!/\b(about|om oss|kontakt|contact|faq|pricing|menu|meny|book|booking|boka|services|tjänster)\b/i.test(originalPrompt)) {
    lines.push(
      "- Prompt is sparse; infer sensible default information architecture from the domain instead of keeping the site too generic.",
    );
  }
  return lines;
}
