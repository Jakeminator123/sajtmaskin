/**
 * GENERATED FILE — client-safe projection of the runtime scaffold registry.
 * Source: src/lib/gen/scaffolds/registry.ts + each registered manifest.
 * Generator: scripts/scaffolds/generate-client-list.ts
 * Regenerate: npm run scaffolds:client-list:write
 */
import type { ScaffoldId } from "./types";

export type ScaffoldClientListEntry = {
  readonly id: ScaffoldId;
  readonly label: string;
  readonly description: string;
  readonly allowedBuildIntents: ReadonlyArray<"website" | "app" | "template">;
};

// Keep one deterministic row per manifest; the freshness gate owns this layout.
// prettier-ignore
export const SCAFFOLD_CLIENT_LIST: ReadonlyArray<ScaffoldClientListEntry> = [
  { id: "base-nextjs", label: "Base Next.js", description: "Minimal Next.js starter with Tailwind, App Router, and dark theme.", allowedBuildIntents: ["website", "template"] },
  { id: "landing-page", label: "Landing Page", description: "Polished one-page or multi-section layout for local businesses, service companies, and product launches.", allowedBuildIntents: ["website", "template"] },
  { id: "saas-landing", label: "SaaS Landing", description: "Product-led marketing starter with feature narrative, dashboard preview, pricing, FAQ, and conversion-ready sections.", allowedBuildIntents: ["website", "template"] },
  { id: "portfolio", label: "Portfolio", description: "Personal portfolio starter with intro, selected work, writing, credibility, and contact sections.", allowedBuildIntents: ["website", "template"] },
  { id: "blog", label: "Blog", description: "Content-first blog starter with article list, post layout, author, featured posts, and reading-friendly typography.", allowedBuildIntents: ["website", "template"] },
  { id: "dashboard", label: "Dashboard", description: "Analytics and overview dashboard with sidebar, stats cards, data tables, and chart placeholders. For admin panels, analytics, and SaaS apps.", allowedBuildIntents: ["app"] },
  { id: "auth-pages", label: "Auth Pages", description: "Login, signup, and forgot-password pages with form layout, validation-ready structure, and minimal branding.", allowedBuildIntents: ["website", "app", "template"] },
  { id: "ecommerce", label: "E-handel", description: "Storefront starter with product grid, category filtering, product detail page, cart drawer, and checkout-ready layout.", allowedBuildIntents: ["website", "template"] },
  { id: "app-shell", label: "App Shell", description: "Operational app shell with sidebar navigation, workspace summaries, queue tables, and execution-focused content areas.", allowedBuildIntents: ["app"] },
  { id: "projekt-bas-app", label: "Projekt bas-app", description: "Minimal app-bas för Scaffold: Av i fritext — körbar Next.js-start utan färdig produktstruktur.", allowedBuildIntents: ["app", "website"] },
];
