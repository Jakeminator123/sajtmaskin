import type { ScaffoldFamily, ScaffoldManifest } from "./types";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getScaffoldByFamily } from "./registry";

const CONTENT_KEYWORDS = [
  "blog", "article", "post", "content", "writer", "portfolio", "photographer",
  "agency", "founder", "creative", "personal", "resume", "cv", "about",
  "gallery", "showcase", "work", "projects", "case study", "stories",
  "landing", "marketing", "startup", "company", "business", "brand",
  "hemsida", "webbplats", "sajt", "företag", "byrå", "fotograf",
];

const APP_KEYWORDS = [
  "dashboard", "analytics", "admin", "crm", "stats", "metrics", "panel",
  "settings", "users", "table", "chart", "sidebar", "app", "tool",
  "management", "monitor", "overview", "reports",
];

export function matchScaffold(
  prompt: string,
  buildIntent?: BuildIntent | null,
): ScaffoldManifest | null {
  const lower = prompt.toLowerCase();

  if (buildIntent === "app") {
    return getScaffoldByFamily("app-shell");
  }

  const appScore = APP_KEYWORDS.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
  const contentScore = CONTENT_KEYWORDS.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);

  if (appScore >= 2) return getScaffoldByFamily("app-shell");
  if (contentScore >= 1) return getScaffoldByFamily("content-site");

  if (buildIntent === "website" || buildIntent === "template") {
    return getScaffoldByFamily("content-site");
  }

  return getScaffoldByFamily("base-nextjs");
}
