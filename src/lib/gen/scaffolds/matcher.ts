import type { ScaffoldManifest } from "./types";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getScaffoldByFamily, getScaffoldById } from "./registry";

const LANDING_KEYWORDS = [
  "landing",
  "marketing",
  "campaign",
  "company",
  "business",
  "services",
  "service",
  "consulting",
  "consultant",
  "studio",
  "agency",
  "corporate",
  "startup",
  "brand",
  "homepage",
  "home page",
  "hemsida",
  "webbplats",
  "sajt",
  "företag",
  "byrå",
  "tjänster",
  "kampanj",
];

const SAAS_KEYWORDS = [
  "saas",
  "software",
  "platform",
  "subscription",
  "pricing",
  "billing",
  "product-led",
  "product led",
  "b2b",
  "workspace",
  "dashboard preview",
  "free trial",
  "mjukvara",
  "plattform",
  "abonnemang",
  "pris",
  "testperiod",
];

const PORTFOLIO_KEYWORDS = [
  "portfolio",
  "designer",
  "developer",
  "photographer",
  "creative",
  "creator",
  "personal",
  "resume",
  "cv",
  "selected work",
  "case study",
  "case studies",
  "founder profile",
  "artist",
  "stylist",
  "copywriter",
  "consultant profile",
  "illustrator",
  "videographer",
  "portfolio site",
  "fotograf",
  "kreatör",
  "personlig",
  "case",
];

const BLOG_KEYWORDS = [
  "blog",
  "blogg",
  "article",
  "artikel",
  "post",
  "inlägg",
  "writer",
  "författare",
  "newsletter",
  "magazine",
  "magasin",
  "editorial",
  "redaktion",
  "content",
  "innehåll",
  "reading",
  "läsa",
];

const DASHBOARD_KEYWORDS = [
  "dashboard",
  "instrumentpanel",
  "analytics",
  "analys",
  "stats",
  "statistik",
  "metrics",
  "mätvärden",
  "overview",
  "översikt",
  "reports",
  "rapport",
  "rapporter",
  "chart",
  "diagram",
  "table",
  "tabell",
];

const APP_KEYWORDS = [
  "admin",
  "crm",
  "panel",
  "settings",
  "inställningar",
  "users",
  "användare",
  "sidebar",
  "sidopanel",
  "tool",
  "verktyg",
  "management",
  "monitor",
  "application",
  "app",
  "workspace",
  "portal",
  "backoffice",
];

const AUTH_KEYWORDS = [
  "auth",
  "login",
  "inloggning",
  "signup",
  "sign up",
  "registrera",
  "register",
  "password",
  "lösenord",
  "forgot password",
  "glömt lösenord",
  "reset password",
  "återställ",
];

const CONTENT_KEYWORDS = [
  "content",
  "innehåll",
  "gallery",
  "galleri",
  "showcase",
  "work",
  "projekt",
  "projects",
  "stories",
  "landing",
  "marketing",
  "startup",
  "company",
  "business",
  "brand",
  "hemsida",
  "webbplats",
  "sajt",
  "företag",
  "byrå",
  "fotograf",
  "saas",
  "software",
  "pricing",
  "subscription",
  "tier",
  "feature",
  "product",
  "service",
  "solution",
  "plattform",
  "tjänst",
  "mjukvara",
  "pris",
  "abonnemang",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countKeywordMatches(text: string, keywords: readonly string[]): number {
  return keywords.reduce((count, keyword) => {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escapeRegex(keyword)}([^\\p{L}\\p{N}]|$)`,
      "iu",
    );
    return count + (pattern.test(text) ? 1 : 0);
  }, 0);
}

/** Minimum score to prefer a specific scaffold over fallbacks */
const MIN_SCORE = 2;

/** Picks the best scaffold from scored candidates, or null if none meets threshold */
function pickBestScaffold(
  scores: Array<{ id: string; score: number }>,
): ScaffoldManifest | null {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best || best.score < MIN_SCORE) return null;
  return getScaffoldById(best.id);
}

export function matchScaffold(
  prompt: string,
  buildIntent?: BuildIntent | null,
): ScaffoldManifest | null {
  const lower = prompt.toLowerCase();

  // Auth-specific: login, signup, forgot password
  const authScore = countKeywordMatches(lower, AUTH_KEYWORDS);
  if (authScore >= MIN_SCORE) {
    return getScaffoldByFamily("auth-pages");
  }

  // App/dashboard intent
  if (buildIntent === "app") {
    const dashboardScore = countKeywordMatches(lower, DASHBOARD_KEYWORDS);
    const appScore = countKeywordMatches(lower, APP_KEYWORDS);
    if (dashboardScore >= MIN_SCORE && dashboardScore >= appScore) {
      return getScaffoldByFamily("dashboard");
    }
    return getScaffoldByFamily("app-shell");
  }

  const dashboardScore = countKeywordMatches(lower, DASHBOARD_KEYWORDS);
  const appScore = countKeywordMatches(lower, APP_KEYWORDS);
  if (appScore >= MIN_SCORE || dashboardScore >= MIN_SCORE) {
    if (dashboardScore >= appScore) {
      return getScaffoldByFamily("dashboard");
    }
    return getScaffoldByFamily("app-shell");
  }

  // Content-type scaffolds: pick best among landing, saas, portfolio, blog
  const saasScore = countKeywordMatches(lower, SAAS_KEYWORDS);
  const portfolioScore = countKeywordMatches(lower, PORTFOLIO_KEYWORDS);
  const landingScore = countKeywordMatches(lower, LANDING_KEYWORDS);
  const blogScore = countKeywordMatches(lower, BLOG_KEYWORDS);

  const bestContent = pickBestScaffold([
    { id: "saas-landing", score: saasScore },
    { id: "portfolio", score: portfolioScore },
    { id: "landing-page", score: landingScore },
    { id: "blog", score: blogScore },
  ]);

  if (bestContent) {
    return bestContent;
  }

  // Fallback: content-site for generic content prompts
  const contentScore = countKeywordMatches(lower, CONTENT_KEYWORDS);
  if (contentScore >= MIN_SCORE) {
    return getScaffoldByFamily("content-site");
  }

  // Default for website/template
  if (buildIntent === "website" || buildIntent === "template") {
    return getScaffoldById("landing-page");
  }

  return getScaffoldByFamily("base-nextjs");
}
