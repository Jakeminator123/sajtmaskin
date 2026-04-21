/**
 * Pattern banks for deterministic route inference from prompts.
 *
 * `WEBSITE_ROUTE_PATTERNS` — marketing/content routes users commonly request
 * when building a website (`/about`, `/pricing`, `/contact`, …).
 *
 * `APP_ROUTE_PATTERNS` — in-app routes for build-intent `"app"` projects
 * (`/settings`, `/billing`, `/login`, …).
 *
 * Extracted from `src/lib/gen/route-plan.ts` 2026-04-21.
 */

export type RoutePatternEntry = {
  match: RegExp;
  path: string;
  name: string;
  intent: string;
};

export const WEBSITE_ROUTE_PATTERNS: RoutePatternEntry[] = [
  {
    match: /\bom\s+oss\b/i,
    path: "/om",
    name: "Om oss",
    intent: "Build trust and explain the company or creator (Swedish sites: use /om).",
  },
  {
    match: /\b(about|company|story)\b/i,
    path: "/about",
    name: "About",
    intent: "Build trust and explain the company or creator.",
  },
  {
    match: /\b(booking\s+page|bookings?\s+page|bokningssida|bokningssidan|bookings?|booking|boka|reservation|reserve)\b/i,
    path: "/booking",
    name: "Booking",
    intent: "Provide a dedicated booking/reservation flow.",
  },
  { match: /\b(services?\s+page|tjänste?r?\s*sida|our services|våra tjänster)\b/i, path: "/services", name: "Services", intent: "Explain offers, packages, or capabilities." },
  { match: /\b(pricing|price|pris|priser|billing)\b/i, path: "/pricing", name: "Pricing", intent: "Show pricing, plans, or billing details." },
  { match: /\b(contact|kontakta|kontakt|kontaktsida|kontaktsidan)\b/i, path: "/contact", name: "Contact", intent: "Capture leads or contact requests." },
  { match: /\b(blog|blogg|articles?|newsletter)\b/i, path: "/blog", name: "Blog", intent: "Publish articles, updates, or editorial content." },
  { match: /\b(docs|documentation|kunskapsbank|guide|guides)\b/i, path: "/docs", name: "Docs", intent: "Provide structured documentation or help content." },
  { match: /\b(support|help center|faq|kundservice)\b/i, path: "/support", name: "Support", intent: "Answer common questions and support flows." },
  { match: /\b(portfolio|case study|case studies|work|projekt)\b/i, path: "/work", name: "Work", intent: "Show portfolio pieces, projects, or case studies." },
  { match: /\b(team\s+page|employees|staff\s+page|medarbetare\s*sida|our team|vårt team)\b/i, path: "/team", name: "Team", intent: "Introduce people behind the company or product." },
  { match: /\b(testimonial|reviews|recensioner|omdömen)\b/i, path: "/testimonials", name: "Testimonials", intent: "Show social proof and customer outcomes." },
  { match: /\b(shop|store|butik|products|product|catalog|katalog)\b/i, path: "/products", name: "Products", intent: "Show product catalog or product overview." },
  { match: /\b(cart|varukorg)\b/i, path: "/cart", name: "Cart", intent: "Show selected products before checkout." },
  { match: /\b(checkout|kassa)\b/i, path: "/checkout", name: "Checkout", intent: "Complete the purchase flow." },
];

export const APP_ROUTE_PATTERNS: RoutePatternEntry[] = [
  { match: /\b(settings|inställningar)\b/i, path: "/settings", name: "Settings", intent: "Manage account, workspace, or application settings." },
  { match: /\b(user|users|team|members|användare)\b/i, path: "/users", name: "Users", intent: "Manage users, roles, or members." },
  { match: /\b(billing|subscription|invoice|faktur)\b/i, path: "/billing", name: "Billing", intent: "Manage billing, subscriptions, or invoices." },
  { match: /\b(analytics|metrics|statistik|analys)\b/i, path: "/analytics", name: "Analytics", intent: "Show analytics, metrics, or statistical dashboards." },
  { match: /\b(report|reports|rapport|rapporter)\b/i, path: "/reports", name: "Reports", intent: "Show reports or exportable summaries." },
  { match: /\b(sign.?up|register|registr(?:era|ering)?)\b/i, path: "/signup", name: "Signup", intent: "Provide account registration for the application." },
  { match: /\b(forgot.?password|reset.?password|glömt lösenord|återställ)\b/i, path: "/forgot-password", name: "Forgot Password", intent: "Provide password recovery in the authentication flow." },
  { match: /\b(login|inlogg|auth|sign.?in|logga in)\b/i, path: "/login", name: "Login", intent: "Provide authentication entry for the application." },
];
