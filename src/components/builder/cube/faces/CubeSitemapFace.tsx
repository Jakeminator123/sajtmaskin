"use client";

/**
 * Sajtkartan som egen yta i byggkuben: sajtens sidor som ett träd, där ett
 * klick visar sidan i förhandsvisningen.
 *
 * Sidorna kommer från samma källa som förhandsvisningens sidflikar
 * (`usePreviewPanelPreviewRoutes` → versionens filer), och sidbytet går genom
 * förhandsvisningens egen sidnavigering (`preview-page-navigator.ts`): den
 * vet vilken sida iframen faktiskt visar, även efter en navigering inne i
 * sajten. Kartan äger alltså ingen egen sanning om sidorna eller om var
 * förhandsvisningen står.
 */

import { useMemo } from "react";
import { FileText, Folder, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreviewPageNavigator } from "../../preview-panel/pages/preview-page-navigator";
import type { PreviewRouteInfo } from "../../preview-panel/pages/preview-route-helpers";
import { usePreviewPanelPreviewRoutes } from "../../preview-panel/pages/usePreviewPanelPreviewRoutes";

export interface CubeSitemapFaceProps {
  chatId: string | null;
  versionId: string | null;
  /** Förhandsvisningens adress; utan den finns ingen sida att visa. */
  previewUrl: string | null;
  /** Byts när versionens sidor kan ha ändrats utan nytt versions-id. */
  refreshToken?: number;
  /**
   * Sidan står fram, eller kortet är öppet. Sidorna läses bara då: listan
   * byggs ur versionens alla filer, och förhandsvisningen hämtar redan samma
   * filer till sina flikar.
   */
  visible: boolean;
  /** Mobilskalets väg till den separata förhandsvisningsfliken. */
  onNavigate?: () => void;
}

export interface SitemapNode {
  /** Sökvägssegmentets adress, t.ex. "/tjanster/badrum". */
  path: string;
  /** Sista segmentet, läsbart: "badrum" → "Badrum". "/" → "Start". */
  title: string;
  /** Sidan finns; annars är noden bara en mapp som håller undersidor. */
  page: PreviewRouteInfo | null;
  children: SitemapNode[];
}

function titleFor(segment: string): string {
  if (!segment) return "Start";
  const clean = segment.replace(/^\[\.{0,3}(.+)\]$/u, ":$1").replace(/[-_]+/gu, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Bygg ett träd av sidornas adresser. En förälder som saknar egen sida
 * («/tjanster» när bara «/tjanster/badrum» finns) blir en mapp, så barnen
 * hamnar under rätt rubrik i stället för löst i roten. Ordningen följer
 * källistan: startsidan först, sedan som i förhandsvisningens flikar.
 */
export function buildSitemapTree(routes: ReadonlyArray<PreviewRouteInfo>): SitemapNode[] {
  const roots: SitemapNode[] = [];
  const byPath = new Map<string, SitemapNode>();

  const ensure = (path: string): SitemapNode => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const segments = path.split("/").filter(Boolean);
    const node: SitemapNode = {
      path,
      title: titleFor(segments[segments.length - 1] ?? ""),
      page: null,
      children: [],
    };
    byPath.set(path, node);
    if (segments.length <= 1) {
      roots.push(node);
    } else {
      ensure(`/${segments.slice(0, -1).join("/")}`).children.push(node);
    }
    return node;
  };

  for (const route of routes) {
    const path = route.route === "/" ? "/" : `/${route.route.split("/").filter(Boolean).join("/")}`;
    ensure(path).page = route;
  }
  return roots;
}

export function CubeSitemapFace({
  chatId,
  versionId,
  previewUrl,
  refreshToken,
  visible,
  onNavigate,
}: CubeSitemapFaceProps) {
  const { previewRoutes, previewRoutesLoading } = usePreviewPanelPreviewRoutes(
    visible ? chatId : null,
    visible ? versionId : null,
    refreshToken,
  );
  const tree = useMemo(() => buildSitemapTree(previewRoutes), [previewRoutes]);
  const navigator = usePreviewPageNavigator();
  const activeRoute = navigator?.activeRoute ?? null;

  // Sidan som redan visas laddas inte om; allt annat avgör förhandsvisningen.
  const navigate = (route: string) => {
    if (!navigator) return;
    if (route !== navigator.activeRoute) navigator.navigate(route);
    onNavigate?.();
  };

  const renderNode = (node: SitemapNode) => {
    const page = node.page;
    const isActive = Boolean(page && activeRoute === page.route);
    const canOpen = Boolean(page?.navigable && previewUrl && navigator);
    const row = (
      <>
        {page ? (
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <Folder className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        {page && !page.reachable ? (
          <span className="border-border text-muted-foreground shrink-0 rounded border px-1 text-[10px]">
            olänkad
          </span>
        ) : null}
        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
          {page ? page.label : node.path}
        </span>
      </>
    );
    const rowClass = cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
      isActive ? "bg-primary/10 text-foreground" : "text-muted-foreground",
    );
    return (
      <li key={node.path}>
        {page && canOpen ? (
          <button
            type="button"
            onClick={() => navigate(page.route)}
            aria-current={isActive ? "page" : undefined}
            title={`Visa ${page.label} i förhandsvisningen`}
            className={cn(
              rowClass,
              "hover:bg-muted hover:text-foreground focus-visible:ring-ring transition-colors focus-visible:ring-2 focus-visible:outline-none",
            )}
          >
            {row}
          </button>
        ) : (
          <div
            className={rowClass}
            title={
              page?.dynamic
                ? "Sidan har en dynamisk del och kan inte öppnas direkt"
                : undefined
            }
          >
            {row}
          </div>
        )}
        {node.children.length > 0 ? (
          <ul className="border-border/60 mt-0.5 ml-3.5 space-y-0.5 border-l pl-2">
            {node.children.map(renderNode)}
          </ul>
        ) : null}
      </li>
    );
  };

  if (!chatId || !versionId) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-xs leading-5">
        Sajtkartan visas när sajten har en första version.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="cube-sitemap">
      <div className="border-border/60 text-muted-foreground flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 text-[11px]">
        <span>
          {previewRoutes.length === 1 ? "1 sida" : `${previewRoutes.length} sidor`}
        </span>
        {previewRoutesLoading ? (
          <Loader2 className="size-3 animate-spin" aria-label="Läser sidor" />
        ) : null}
      </div>
      <nav aria-label="Sajtkarta" className="min-h-0 flex-1 overflow-y-auto p-2">
        {tree.length > 0 ? (
          <ul className="space-y-0.5">{tree.map(renderNode)}</ul>
        ) : previewRoutesLoading ? null : (
          <p className="text-muted-foreground p-4 text-center text-xs leading-5">
            Inga sidor hittades i den här versionen.
          </p>
        )}
      </nav>
    </div>
  );
}
