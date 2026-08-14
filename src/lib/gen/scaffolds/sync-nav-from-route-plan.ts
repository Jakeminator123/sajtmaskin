/**
 * Deterministic post-merge rewrite of a scaffold nav `navItems` array from
 * the route plan. Lives outside the fixer registry (same class as
 * `checkCrossFileImports`): it needs the merged file set + the plan, and
 * it does not emit a `FixEntry`.
 *
 * The target file is `ScaffoldManifest.navSurface` — the manifest points
 * the scaffold's nav component out, so nav targets are never guessed from
 * filenames (the SM-051 bug class). Scaffolds without a `navSurface`
 * (auth-pages, portfolio, base-nextjs, projekt-bas-app) are a no-op.
 *
 * Two stable `navItems` shapes are handled:
 *
 *  - `{ label, href, icon }` (app-shell/dashboard sidebars): the array is
 *    REWRITTEN from the plan — planned routes in, unplanned links out.
 *  - `{ label, href }` (site-/marketing-headers): the array is FILTERED —
 *    internal page links whose route is not in the plan are removed; in-page
 *    anchors (`#pricing`), `mailto:`/`tel:`, external URLs and template
 *    hrefs are never touched, and no links are added. Anchor-only headers
 *    (landing-page, saas-landing) therefore stay untouched.
 *
 * Follow-up freeze: never rewrite when `isFollowUp` is true. A user who
 * deleted a nav link in a previous round must not get it written back.
 * Even on init, rewrite only while `navItems` still has a stable form
 * (scaffold default or an LLM copy of that form). A rewrite that changes
 * the shape is left untouched.
 */

import type { CodeFile } from "@/lib/gen/parser";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import { normalizeRoutePath, type RoutePlan } from "@/lib/gen/route-plan";

const FALLBACK_ICON = "LayoutDashboard";

const NAV_ICON_BY_PATH: Record<string, string> = {
  "/": "LayoutDashboard",
  "/analytics": "BarChart3",
  "/users": "Users",
  "/settings": "Settings",
  "/dashboard": "LayoutDashboard",
};

const NAV_ITEMS_HEAD_RE = /(?:const|let|var)\s+navItems\s*=\s*\[/;
// One stable nav item. `icon:` is optional: sidebars carry it
// (`{ label, href, icon }`), site-/marketing-headers do not (`{ label, href }`).
const NAV_ITEM_RE =
  /\{\s*label:\s*(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1\s*,\s*href:\s*(["'`])((?:\\[\s\S]|(?!\3)[^\\])*?)\3\s*(?:,\s*icon:\s*([A-Za-z_$][\w$]*)\s*)?,?\s*\}/g;
const LUCIDE_IMPORT_RE = /import\s*\{[^}]*\}\s*from\s*["']lucide-react["']\s*;?/;

export interface SyncNavFromRoutePlanResult {
  files: CodeFile[];
  changedPaths: string[];
}

export function syncNavItemsFromRoutePlan(params: {
  files: CodeFile[];
  routePlan: RoutePlan | null | undefined;
  /** When true the file is left untouched (follow-up freeze). */
  isFollowUp?: boolean;
  /**
   * Scaffold whose manifest `navSurface` points out the nav file to sync.
   * No scaffold or no `navSurface` → no-op.
   */
  scaffold: Pick<ScaffoldManifest, "navSurface"> | null | undefined;
}): SyncNavFromRoutePlanResult {
  const { files, routePlan, isFollowUp = false, scaffold } = params;
  if (isFollowUp) return { files, changedPaths: [] };
  if (!routePlan || routePlan.routes.length === 0) return { files, changedPaths: [] };
  const navSurface = scaffold?.navSurface;
  if (!navSurface) return { files, changedPaths: [] };

  const changedPaths: string[] = [];
  const nextFiles = files.map((file) => {
    if (!isNavSurfacePath(file.path, navSurface)) return file;
    const next = rewriteNavItems(file.content, routePlan);
    if (!next || next === file.content) return file;
    changedPaths.push(file.path);
    return { ...file, content: next };
  });
  return { files: nextFiles, changedPaths };
}

function isNavSurfacePath(path: string, navSurface: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  // Suffix match tolerates `src/`-rooted copies of the same component.
  return normalized === navSurface || normalized.endsWith(`/${navSurface}`);
}

function rewriteNavItems(content: string, routePlan: RoutePlan): string | null {
  const head = NAV_ITEMS_HEAD_RE.exec(content);
  if (!head) return null;
  const openBracket = head.index + head[0].length - 1;
  const extracted = extractArrayBody(content, openBracket);
  if (!extracted) return null;
  const items = parseStableNavItems(extracted.body);
  if (!items) return null;

  const decl = head[0]!.replace(/\[$/, "");

  if (items.every((item) => item.icon !== null)) {
    // Sidebar form ({ label, href, icon }): rewrite wholly from the plan.
    const routes = routesForNav(routePlan);
    if (routes.length === 0) return null;
    const next =
      content.slice(0, head.index) + decl + renderNavItems(routes) + content.slice(extracted.end + 1);
    return syncLucideImport(
      next,
      routes.map((route) => iconForPath(route.path)),
    );
  }

  // Header form ({ label, href }): FILTER only. Drop internal page links
  // whose route the plan does not include; keep anchors, mailto:/tel:,
  // external URLs, template hrefs and planned routes verbatim. Adding links
  // stays the LLM's job — the plan only guarantees no dead targets.
  const planned = new Set(
    routePlan.routes.map((route) => normalizeRoutePath(route.path)),
  );
  const kept = items.filter((item) => !isUnplannedInternalHref(item.href, planned));
  if (kept.length === items.length) return null;
  const body =
    kept.length === 0 ? "[]" : `[\n${kept.map((item) => `  ${item.raw},`).join("\n")}\n]`;
  return content.slice(0, head.index) + decl + body + content.slice(extracted.end + 1);
}

function isUnplannedInternalHref(href: string, planned: Set<string>): boolean {
  const trimmed = href.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.includes("${")) return false;
  const base = trimmed.split(/[?#]/, 1)[0] || "/";
  const normalized = normalizeRoutePath(base);
  if (normalized === "/") return false;
  return !planned.has(normalized);
}

function extractArrayBody(
  source: string,
  openBracketIndex: number,
): { body: string; end: number } | null {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let i = openBracketIndex; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        return { body: source.slice(openBracketIndex + 1, i), end: i };
      }
    }
  }
  return null;
}

interface ParsedNavItem {
  /** Verbatim matched item text (braces included, no trailing separator). */
  raw: string;
  label: string;
  href: string;
  icon: string | null;
}

/** Returns the parsed items, or null when the array is not in a stable form. */
function parseStableNavItems(body: string): ParsedNavItem[] | null {
  let cursor = 0;
  const items: ParsedNavItem[] = [];
  const re = new RegExp(NAV_ITEM_RE.source, "g");
  while (cursor < body.length && /\s/.test(body[cursor]!)) cursor += 1;

  while (cursor < body.length) {
    re.lastIndex = cursor;
    const match = re.exec(body);
    if (!match || match.index !== cursor) {
      return body.slice(cursor).trim() === "" && items.length > 0 ? items : null;
    }
    items.push({
      raw: match[0]!,
      label: match[2]!,
      href: match[4]!,
      icon: match[5] ?? null,
    });
    cursor = match.index + match[0].length;
    while (cursor < body.length && /\s/.test(body[cursor]!)) cursor += 1;
    if (body[cursor] === ",") {
      cursor += 1;
      while (cursor < body.length && /\s/.test(body[cursor]!)) cursor += 1;
    }
  }
  return items.length > 0 ? items : null;
}

function routesForNav(routePlan: RoutePlan): Array<{ path: string; name: string }> {
  const seen = new Set<string>();
  const routes: Array<{ path: string; name: string }> = [];
  for (const route of routePlan.routes) {
    const path = normalizeRoutePath(route.path);
    if (path.includes("[")) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const name = route.name.trim() || path;
    routes.push({ path, name });
  }
  return routes;
}

function iconForPath(path: string): string {
  return NAV_ICON_BY_PATH[path] ?? FALLBACK_ICON;
}

function escapeJsDoubleQuoted(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

function renderNavItems(routes: Array<{ path: string; name: string }>): string {
  const lines = routes.map((route) => {
    const icon = iconForPath(route.path);
    return `  { label: "${escapeJsDoubleQuoted(route.name)}", href: "${escapeJsDoubleQuoted(route.path)}", icon: ${icon} },`;
  });
  return `[\n${lines.join("\n")}\n]`;
}

function parseLucideSpecifier(raw: string): { rawSpec: string; localName: string } {
  const rawSpec = raw.trim();
  const aliasParts = rawSpec.split(/\s+as\s+/);
  const localName = (aliasParts[aliasParts.length - 1] ?? rawSpec).trim();
  return { rawSpec, localName };
}

function insertLucideImport(content: string, nextImport: string): string {
  // `"use client"` måste förbli första statement — en prepend före
  // direktivet gör att Next behandlar sidebaren som Server Component.
  const directive = /^\s*(?:"use client"|'use client');?\s*\r?\n/.exec(content);
  if (directive) {
    return (
      content.slice(0, directive[0].length) +
      `${nextImport}\n` +
      content.slice(directive[0].length)
    );
  }
  return `${nextImport}\n${content}`;
}

function syncLucideImport(content: string, neededIcons: string[]): string {
  // Ersätt aldrig importen rakt av: filen kan använda lucide-ikoner UTANFÖR
  // navItems (LLM lägger gärna en <LogOut /> i samma sidebar), och en
  // wholesale-ersättning droppade den importen → runtime-ReferenceError som
  // F2 inte typcheckar bort (granskningsfynd). Behåll befintliga namn som
  // fortfarande refereras i filen efter omskrivningen; släpp de som bara
  // levde i gamla navItems (t.ex. scaffoldens Users/BarChart3).
  // Alias (`LogOut as LogoutIcon`): behåll-testet körs på localName, men
  // unionen renderar rawSpec oförändrad så identifieraren inte tappas.
  const existingMatch = LUCIDE_IMPORT_RE.exec(content);
  const importStatement = existingMatch?.[0] ?? "";
  const existingSpecs = importStatement
    ? (importStatement.match(/\{([^}]*)\}/)?.[1] ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map(parseLucideSpecifier)
    : [];
  const contentWithoutImport = importStatement
    ? content.replace(importStatement, "")
    : content;
  const stillUsed = existingSpecs.filter((spec) =>
    new RegExp(
      `\\b${spec.localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    ).test(contentWithoutImport),
  );
  const unique = [
    ...new Set([...neededIcons, ...stillUsed.map((spec) => spec.rawSpec)]),
  ];
  const preferred = ["LayoutDashboard", "BarChart3", "Users", "Settings"];
  unique.sort((a, b) => {
    const ia = preferred.indexOf(a);
    const ib = preferred.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const nextImport = `import { ${unique.join(", ")} } from "lucide-react";`;
  if (LUCIDE_IMPORT_RE.test(content)) {
    return content.replace(LUCIDE_IMPORT_RE, nextImport);
  }
  return insertLucideImport(content, nextImport);
}
