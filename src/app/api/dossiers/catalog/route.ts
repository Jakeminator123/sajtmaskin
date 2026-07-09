/**
 * Full dossier CATALOG (as opposed to the per-chat overview in
 * `/api/engine/chats/[chatId]/dossiers`) — every dossier in the
 * server-side registry (`src/lib/gen/dossiers/registry.ts`), grouped by the
 * same presentation-only capability buckets as the wired-dossier overview
 * (`dossier-groups.ts`). Backs the Byggblock-panelens "Bläddra katalog"-tab
 * so the user can browse ALL available building blocks (e.g. Betalningar ->
 * Stripe/Klarna), not only the ones already wired into the current version.
 *
 * No chat/version scoping and no auth-sensitive data — this is static
 * filesystem data (manifests under `data/dossiers/{hard,soft}/`), so the
 * route needs no rate limit / tenant lookup and is cache-friendly.
 */
import { NextResponse } from "next/server";
import { getAllDossiers } from "@/lib/gen/dossiers/registry";
import { DOSSIER_GROUP_ORDER, resolveDossierGroup } from "@/lib/builder/dossier-groups";
import type {
  DossierCatalogEntry,
  DossierCatalogGroup,
  DossierCatalogResponse,
} from "@/lib/builder/dossier-catalog";

export const runtime = "nodejs";
// Static filesystem-backed data (manifests only change on deploy) — cheap to
// cache at the edge/CDN for a few minutes.
export const revalidate = 300;

export async function GET() {
  const entries: DossierCatalogEntry[] = getAllDossiers().map((entry) => {
    const group = resolveDossierGroup(entry.capability);
    return {
      id: entry.id,
      label: entry.label,
      capability: entry.capability,
      class: entry.class,
      summary: entry.summary,
      envVarCount: (entry.envVars ?? []).length,
      groupId: group.id,
      groupLabel: group.label,
    };
  });

  const groups: DossierCatalogGroup[] = DOSSIER_GROUP_ORDER.map((group) => ({
    id: group.id,
    label: group.label,
    dossiers: entries
      .filter((entry) => entry.groupId === group.id)
      .sort((a, b) => a.label.localeCompare(b.label, "sv")),
  })).filter((group) => group.dossiers.length > 0);

  const response: DossierCatalogResponse = {
    success: true,
    total: entries.length,
    groups,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
  });
}
