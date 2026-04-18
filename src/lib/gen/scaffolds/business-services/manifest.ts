import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const businessServicesManifest: ScaffoldManifest = {
  id: "business-services",
  label: "Business & Services",
  description:
    "Professional service-business site for offices, clinics, law/accounting/consulting/agency firms, and local trades — structured services grid, process, pricing, team, and contact.",
  siteKind: "marketing",
  complexity: "medium",
  structureProfile: "multi-section-service-site",
  contentProfile: "service-business",
  features: ["hero", "services-grid", "process", "pricing", "team", "contact"],
  allowedBuildIntents: ["website", "template"],
  tags: [
    "business",
    "services",
    "agency",
    "consulting",
    "clinic",
    "law",
    "accounting",
    "coworking",
    "local-business",
    "professional",
    "b2b",
  ],
  promptHints: [
    "Use this scaffold for professional service businesses: kontorshotell/coworking, advokatbyrå, redovisningsbyrå, klinik/tandläkare, konsultbolag, arkitektbyrå, reklam-/design-/webbyrå, byggfirma, städfirma, mäklare, bemanning och liknande.",
    "Keep the rhythm: trust-first hero, clearly named services grid, explicit process/steps, transparent pricing or packages, a team or expertise block, and a concrete contact/booking CTA.",
    "Replace all placeholder services, process steps, pricing tiers and contact details with concrete, real-world content that matches the user's profession — a law firm should feel precise and authoritative, a coworking space welcoming and practical, a clinic calm and trustworthy.",
    "Prefer a professional, trust-building palette (deep slate, warm sand, quiet accent) and typography that reads as credible rather than playful.",
  ],
  qualityChecklist: [
    "Hero headline names the profession and location (e.g. 'Kontorshotell i centrala Stockholm', 'Advokatbyrå specialiserad på arbetsrätt') — never generic marketing filler.",
    "Services grid has at least 4 distinct, named services tied to the real profession (not '[Tjänst 1]').",
    "Process section has concrete numbered steps the client actually goes through (kontakt → behovsanalys → offert → leverans, or motsvarande).",
    "Pricing/packages block lists at least 3 real tiers with prices, or a clear 'from X kr' anchor when prices aren't public.",
    "Team / about block gives real credibility signals (antal anställda, år i branschen, certifieringar, auktorisationer).",
    "Contact block includes opening hours, address, phone, email and a primary booking/quote CTA.",
    "Sub-pages (om oss, tjänster, priser, kontakt, blogg, case) contain real content, not stub paragraphs.",
    "Color palette adapted to the profession — legal/financial lean deep slate + warm sand, medical lean calm teal, creative agency lean monochrome + single accent.",
  ],
  files: loadScaffoldFiles("business-services"),
};
