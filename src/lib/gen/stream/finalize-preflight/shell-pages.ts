/**
 * Shell-page generator used by `ensureDeferredRouteShells` to materialize
 * lightweight placeholder pages for planned-but-deferred routes.
 *
 * Extracted from `src/lib/gen/stream/finalize-preflight.ts` 2026-04-21.
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

function routePathToHrefExample(path: string): string {
  const normalized = normalizeRoutePath(path);
  // 2026-04-22 follow-up audit: tidigare renderade catch-all-segment
  // (`[...slug]`, `[[...slug]]`) som `...slug` → `/blog/...slug`, vilket är
  // en ogiltig preview-URL för shell-sidan (trasig CTA-länk i preview).
  // Ersätt catch-all med `example`, optional catch-all med tomt segment,
  // och vanlig dynamisk param med dess namn (oförändrat beteende).
  return normalized
    .replace(/\[\[\.\.\.[^\]]+\]\]/g, "")
    .replace(/\[\.\.\.[^\]]+\]/g, "example")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "") || "/";
}

function toValidIdentifierPart(raw: string): string {
  const stripped = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return "Planned";
  // 2026-04-22 follow-up audit: tidigare kunde en titel som "3D" bli
  // `function 3DPage()` — ogiltig TS/JS-identifierare (får inte börja med
  // siffra). Prefix:a ett säkert tecken om första char är en siffra.
  return /^[0-9]/.test(stripped) ? `Page${stripped}` : stripped;
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

export function buildShellPageContent(route: PlannedRoute): string {
  const title = buildShellPageTitle(route);
  const hrefExample = routePathToHrefExample(route.path);
  const purpose = route.intent.trim();
  const isDynamic = /\[[^\]]+\]/.test(route.path);
  const pathNote =
    route.path === hrefExample
      ? `Path: ${route.path}`
      : `Route pattern: ${route.path} (preview example: ${hrefExample})`;

  return `import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ${toValidIdentifierPart(title)}Page() {
  return (
    <main className="min-h-[70vh] bg-[oklch(0.58_0.22_262)] text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col justify-center px-6 py-20">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <Badge className="w-fit border border-white/20 bg-white/10 text-white hover:bg-white/10">
            ${isDynamic ? "Dynamisk routeskal" : "Förberedd sida"}
          </Badge>
          <div className="space-y-3">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              ${title}
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">
              Den här sidan finns medvetet redan nu så att navigation, preview och strukturen i projektet håller ihop medan huvudsidan får mest kvalitet i första byggsteget.
            </p>
          </div>
          <div className="space-y-3 text-sm text-white/75">
            <p>${pathNote}</p>
            <p>${purpose}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-white text-[oklch(0.58_0.22_262)] hover:bg-white/90"
            >
              <Link href="${hrefExample}">
                Skapa sida <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/">
                Till huvudsidan
              </Link>
            </Button>
          </div>
        </div>
        <Card className="border-white/15 bg-white/8 text-white shadow-none">
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="text-sm font-medium">Plan för sidan</p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                ${purpose}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Varför sidan är enkel just nu</p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                Första generationen fokuserar på att göra huvudsidan stark. Den här sidan finns redan som en giltig route, men är avsiktligt lätt tills du väljer att bygga ut just den.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/55">Nästa steg</p>
              <p className="mt-2 text-sm leading-relaxed text-white/80">
                Öppna sidan via navigationen och be sedan buildern att bygga ut ${title.toLowerCase()} fullt ut.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </main>
  );
}
`;
}
