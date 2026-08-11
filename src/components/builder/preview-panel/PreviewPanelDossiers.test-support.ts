import { vi } from "vitest";
import type { DossierOverviewResponse } from "@/lib/builder/dossier-overview";
import type { DossierCatalogResponse } from "@/lib/builder/dossier-catalog";

export function wiredResponse(overrides: Partial<DossierOverviewResponse> = {}): DossierOverviewResponse {
  return {
    success: true,
    projectId: "proj_1",
    versionId: "ver_1",
    lifecycleStage: "design",
    versionFilesAvailable: true,
    counts: { total: 0, hard: 0, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 0, planned: 0 },
    dossiers: [],
    ...overrides,
  };
}

export function catalogResponse(overrides: Partial<DossierCatalogResponse> = {}): DossierCatalogResponse {
  return {
    success: true,
    total: 3,
    groups: [
      {
        id: "commerce",
        label: "Betalning & handel",
        dossiers: [
          {
            id: "stripe-checkout",
            label: "Stripe Checkout",
            capability: "payments",
            class: "hard",
            summary: "Stripe-baserad checkout.",
            envVarCount: 2,
            requiresF3: true,
            mock: "visual",
            groupId: "commerce",
            groupLabel: "Betalning & handel",
          },
          {
            // Kopplad MEN F2-klar (feature-runtime-nycklar, inga serverfiler)
            // — beviset för att hard/soft inte kan härledas till F2/F3.
            id: "klarna-checkout",
            label: "Klarna Checkout",
            capability: "payments",
            class: "hard",
            summary: "Klarna-baserad checkout.",
            envVarCount: 1,
            requiresF3: false,
            mock: "visual",
            groupId: "commerce",
            groupLabel: "Betalning & handel",
          },
        ],
      },
      {
        id: "media",
        label: "Media & galleri",
        dossiers: [
          {
            id: "gallery-lightbox",
            label: "Bildgalleri med lightbox",
            capability: "gallery-lightbox",
            class: "soft",
            summary: "Click-to-enlarge image gallery.",
            summarySv: "Bildgalleri där bilder kan förstoras.",
            envVarCount: 0,
            requiresF3: false,
            groupId: "media",
            groupLabel: "Media & galleri",
          },
        ],
      },
    ],
    ...overrides,
  };
}

export function stubFetch(options: {
  wired?: DossierOverviewResponse;
  catalog?: DossierCatalogResponse;
}) {
  const wired = options.wired ?? wiredResponse();
  const catalog = options.catalog ?? catalogResponse();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/dossiers/catalog")) {
      return Response.json(catalog);
    }
    if (url.includes("/dossiers")) {
      return Response.json(wired);
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

