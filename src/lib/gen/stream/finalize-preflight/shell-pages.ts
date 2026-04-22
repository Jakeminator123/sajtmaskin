/**
 * Shell-page generator used by `ensureDeferredRouteShells` to materialize
 * lightweight placeholder pages for planned-but-deferred routes.
 *
 * Extracted from `src/lib/gen/stream/finalize-preflight.ts` 2026-04-21.
 *
 * NOTE: "Skapa sida" is a REAL build-out trigger — the button posts a
 * `build-out-request` message to the parent (builder) window. The builder
 * listens via `usePreviewPanelOwnEnginePreviewTelemetry` and kicks off a
 * new generation for that specific route. Do not replace it with a plain
 * `<Link>` — that would take the user to an empty preview route instead
 * of generating content.
 *
 * Shell pages are detected by `isShellPageContent` — keep the string
 * markers ("Förberedd sida", "Skapa sida", "Varför sidan är enkel just
 * nu") and the oklch accent fingerprint so follow-up generations can
 * preserve and/or build them out on demand.
 */

import { normalizeRoutePath, type PlannedRoute } from "../../route-plan";

export function normalizeRouteSegment(segment: string): string {
  if (!segment) return "";
  if (segment.startsWith("[[...") && segment.endsWith("]]")) return segment;
  if (segment.startsWith("[...") && segment.endsWith("]")) return segment;
  if (segment.startsWith("[") && segment.endsWith("]")) return segment;
  return segment.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || segment;
}

export function routePathToPageFilePath(path: string): string {
  const normalized = normalizeRoutePath(path);
  if (normalized === "/") return "app/page.tsx";
  const segments = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => normalizeRouteSegment(segment));
  return `app/${segments.join("/")}/page.tsx`;
}

function buildShellPageTitle(route: PlannedRoute): string {
  const trimmedName = route.name.trim();
  if (trimmedName) return trimmedName;
  if (route.path === "/") return "Home";
  const label = route.path
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/\[|\]/g, "").replace(/[-_]/g, " "))
    .join(" ")
    .trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Page";
}

function shellIconForRoute(routePath: string, routeName: string): string {
  const lc = `${routePath} ${routeName}`.toLowerCase();
  if (/produkt|shop|butik|sortiment/.test(lc)) return "ShoppingBag";
  if (/om|about/.test(lc)) return "Users";
  if (/kontakt|contact/.test(lc)) return "Mail";
  if (/blogg|blog|nyheter|artikel/.test(lc)) return "FileText";
  if (/pris|pricing/.test(lc)) return "CreditCard";
  if (/tjänst|service/.test(lc)) return "Briefcase";
  if (/galler|portfolio|projekt/.test(lc)) return "LayoutGrid";
  if (/boka|book/.test(lc)) return "Calendar";
  if (/faq|fråg/.test(lc)) return "HelpCircle";
  return "FileText";
}

export function buildShellPageContent(route: PlannedRoute): string {
  const title = buildShellPageTitle(route);
  const purpose = route.intent.trim();
  const iconName = shellIconForRoute(route.path, route.name);
  const funcName = title.replace(/[^a-zA-Z0-9]/g, "") || "PlannedPage";

  const shortDesc = purpose
    ? purpose.charAt(0).toUpperCase() + purpose.slice(1)
    : `Här kommer vi snart visa mer om ${title.toLowerCase()}.`;

  const routePathJson = JSON.stringify(route.path);
  const routeIntentJson = JSON.stringify(purpose || "");
  const routeNameJson = JSON.stringify(route.name || "");

  return `"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ${iconName}, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";

export default function ${funcName}Page() {
  const routePath = ${routePathJson};
  const routeIntent = ${routeIntentJson};
  const routeName = ${routeNameJson};

  const requestBuildOut = () => {
    if (typeof window === "undefined") return;
    const payload = { path: routePath, intent: routeIntent, name: routeName };
    const message = { source: "sajtmaskin-preview", type: "build-out-request", payload };
    let posted = false;
    // Broadcast to both \`parent\` and \`top\` so the builder receives the
    // request regardless of iframe nesting depth (preview-host wrappers,
    // nested shims, etc.). Target "*" — parent is on a different origin.
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, "*");
        posted = true;
      }
    } catch {
      // ignore cross-window postMessage failures
    }
    try {
      if (window.top && window.top !== window && window.top !== window.parent) {
        window.top.postMessage(message, "*");
        posted = true;
      }
    } catch {
      // ignore cross-window postMessage failures
    }
    try {
      console.info("[sajtmaskin-preview] build-out-request", { ...payload, posted });
    } catch {
      // ignore console failures (should not happen)
    }
    if (posted) return;
    // Fallback: previewn är öppnad i ny flik utan parent-window. Lägg
    // build-out-intentet i URL:en så att builder-appen kan plocka upp det
    // nästa gång användaren kommer tillbaka.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("sajtmaskin_buildout", routePath);
      if (routeIntent) url.searchParams.set("sajtmaskin_buildout_intent", routeIntent);
      if (routeName) url.searchParams.set("sajtmaskin_buildout_name", routeName);
      window.location.href = url.toString();
    } catch {
      // ignore URL construction failures
    }
  };

  // Direkt DOM-binding som fallback om React-hydration fördröjs/selektivt
  // fallerar — den SSR-renderade knappen har stabilt id och blir
  // klickbar direkt, utan att invänta Reacts event-system.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = document.getElementById("sajtmaskin-skapa-sida");
    if (!el) return;
    const handler = (ev: Event) => {
      ev.preventDefault();
      requestBuildOut();
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-56 w-56 rounded-full bg-[oklch(0.58_0.22_262)] opacity-[0.08] blur-3xl"
      />

      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <Sparkles className="h-3 w-3" />
        Förberedd sida
      </span>

      <${iconName} className="mt-6 h-10 w-10 text-muted-foreground/70" />

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {/* Dynamisk routeskal för ${route.path} */}
        ${title}
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        ${shortDesc}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/60"
        >
          <ArrowLeft className="h-4 w-4" />
          Tillbaka till startsidan
        </Link>
        <button
          id="sajtmaskin-skapa-sida"
          data-sajtmaskin-path={routePath}
          data-sajtmaskin-intent={routeIntent}
          data-sajtmaskin-name={routeName}
          type="button"
          onClick={requestBuildOut}
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Skapa sida
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-10 max-w-md text-[11px] leading-relaxed text-muted-foreground/70">
        {/* Varför sidan är enkel just nu */}
        Vi har planerat den här sidan men väntar med att bygga ut den tills
        du eller teamet vill prioritera den. Tryck på <em>Skapa sida</em> ovan
        eller <em>Bygg ut</em>-pilen bredvid rutten för att generera den fullt ut.
      </p>
    </main>
  );
}
`;
}
