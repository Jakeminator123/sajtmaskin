import type { ShadcnRegistryItem } from "@/lib/shadcn/registry-types";
import { fetchRegistryItem, isUsableRegistryItem } from "@/lib/shadcn/registry-service";
import { fetchCommunityRegistryItem } from "@/lib/shadcn/community-registry-client";
import { SHADCNBLOCKS_NAMESPACE } from "@/lib/shadcn/community-registry-catalog";
import {
  buildPromptSourceMessage,
  type PromptBuildResult,
} from "@/lib/builder/prompt-builder";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";

/**
 * Insättnings-lane v1 ("Lägg till"-ytan → own-engine)
 * ====================================================
 *
 * Gör ett valt registry-kort (Bläddra-galleriet, Block-snabbval eller Beskriv)
 * FUNKTIONELLT i användarsajten: kandidatens metadata + (när möjligt) hämtad
 * registry-källkod byggs till ett välformat prompt-meddelande som skickas
 * genom den BEFINTLIGA sendMessage/AI-fallback-vägen. Own-engine genererar +
 * verifierar (Normalize → RepairGate → RenderGate) → ny version + preview.
 *
 * KÄRNPRINCIP (plan 2026-07-22-shadcn-registry-beskriv-komposition.md):
 * insättning är ALDRIG en rå filpatch — den går alltid genom own-engine-turnens
 * verify-kedja så att blocket kompilerar och renderar i den genererade sajten.
 *
 * SEAM (Fas 2 v2 — utanför v1-scope): en deterministisk lane
 * (getRegistryItems → rewriteRegistryImports → dep-completer →
 * recipe-injektion i own-engine-turn) kan senare ersätta prompt-vägen här,
 * med samma `ShadcnInsertSelection` som ingång.
 */

/** Officiellt registry-namespace (klienten kan hämta item-kod via proxy-routen). */
export const OFFICIAL_SHADCN_REGISTRY = "@shadcn";

/** Tak för best-effort-hydreringen av registry-källkod (Codex P2). */
const HYDRATION_TIMEOUT_MS = 8_000;

/** Valt registry-kort — gemensam payload för Bläddra- och Beskriv-valen. */
export type ShadcnInsertSelection = {
  /** Registry-lokalt item-namn, t.ex. `login-03` eller `hero1`. */
  name: string;
  /** Registry-namespace, t.ex. `@shadcn` eller `@shadcnblocks`. */
  registry: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  /** `shadcn add`-kommando från describe-kandidaten (referens, körs aldrig). */
  addCommand?: string;
  /** Var valet gjordes. Styr inte prompt-innehållet — bara telemetri/copy. */
  origin: "browse" | "describe";
  /**
   * Placeringsankare från drag-and-drop eller klick-placeringsläge mot previewn
   * (`nearestInsertionPoint` / `handlePlacementClick`): t.ex. `top`, `bottom`,
   * `after-hero`. Saknas → prompten får dagens default ("Längst ner").
   */
  placement?: string;
  /** Svensk placeringslabel för prompt-kuvertet, t.ex. "Efter Hero". */
  placementLabel?: string;
  /** Label på den detekterade ankarsektionen (om droppen/klicket träffade en). */
  anchorSectionLabel?: string;
};

/**
 * Ankare som klick-placeringsläget returnerar innan insättningen skickas.
 * `null` = användaren avbröt (Esc/klick utanför) → default "Längst ner".
 */
export type ShadcnPlacementAnchor = {
  placement: string;
  placementLabel: string;
  anchorSectionLabel?: string;
};

/**
 * Utfall från placeringspickern:
 * - ankare → insättning med placeringsfält,
 * - `null` → placeringsläget kunde inte visas (ingen inspector/preview) →
 *   insättning med dagens default ("Längst ner"),
 * - `"aborted"` → användaren avbröt (Esc/klick utanför) eller kontextbyte
 *   (chatt-/versionsbyte, unmount) → INGEN insättning alls (bugbot-fynd: en
 *   oavsiktlig generation får aldrig starta från ett avbrutet val).
 */
export type ShadcnPlacementPickResult = ShadcnPlacementAnchor | null | "aborted";

/**
 * Aktiverar befintligt placeringsläge mot previewn. Resolvar med ankare vid
 * klick i previewn, `null` när läget inte kan visas, `"aborted"` vid
 * avbrott/kontextbyte.
 */
export type ShadcnPlacementPicker = (
  selection: ShadcnInsertSelection,
) => Promise<ShadcnPlacementPickResult>;

/**
 * Insättningshandler genom hela kedjan (`onShadcnItemInsert` →
 * `onInsertShadcnItem` → `onInsertItem`). Returnerar `sendMessage`s utfall så
 * kort och toaster bara kan lova "Skickat" när en generation faktiskt startade
 * — före utfallskontraktet (BB#shadcn-lane1) resolvade hanterade avslag
 * (409 stale base, 412 tier-3-env) tyst och kortet markerades ändå skickat.
 * Pre-send-guards (ingen chat, buildern upptagen, chattbyte) kastar fortfarande.
 */
export type ShadcnInsertHandler = (
  selection: ShadcnInsertSelection,
) => Promise<SendMessageOutcome>;

// ============================================================================
// DRAG-AND-DROP (Bläddra-/Beskriv-kort → preview-overlay)
// ============================================================================

/**
 * DataTransfer-MIME för registry-kort som dras till Composer-overlayn.
 * Skiljer sig från `PAGE_BLOCK_DND_TYPE` (Composer-blockens id-payload) —
 * payloaden här är en JSON-serialiserad {@link ShadcnInsertSelection} utan
 * placeringsfält (placering räknas ut vid drop).
 */
export const SHADCN_ITEM_DND_TYPE = "application/x-sajtmaskin-shadcn-item";

/** Serialisera kortets metadata för `dataTransfer.setData`. */
export function serializeShadcnDragPayload(selection: ShadcnInsertSelection): string {
  return JSON.stringify(selection);
}

/**
 * Parse:a drop-payloaden. Returnerar null för tom/trasig data (t.ex. en drag
 * från en annan källa) — droppen ska då ignoreras, aldrig kasta.
 */
export function parseShadcnDragPayload(raw: string): ShadcnInsertSelection | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ShadcnInsertSelection> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.name !== "string" || !parsed.name.trim()) return null;
    if (typeof parsed.registry !== "string" || !parsed.registry.trim()) return null;
    if (parsed.origin !== "browse" && parsed.origin !== "describe") return null;
    return parsed as ShadcnInsertSelection;
  } catch {
    return null;
  }
}

export type ShadcnInsertDeps = {
  /** Injicerbar för test — default är den befintliga registry-item-fetchen. */
  fetchItem?: (name: string) => Promise<ShadcnRegistryItem>;
  /** Injicerbar community-fetch (default: `/api/shadcn/community/item`). */
  fetchCommunityItem?: (
    registry: string,
    name: string,
  ) => Promise<ShadcnRegistryItem | null>;
};

async function hydrateWithTimeout(
  promise: Promise<ShadcnRegistryItem | null>,
): Promise<ShadcnRegistryItem | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const item = await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), HYDRATION_TIMEOUT_MS);
      }),
    ]);
    return item !== null && isUsableRegistryItem(item) ? item : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bygg prompt-meddelande + promptSourceMeta för ett valt registry-kort.
 *
 * Officiella items hydreras best-effort med full källkod via den befintliga
 * `fetchRegistryItem` (proxy-routen i klienten). `@shadcnblocks` hydreras via
 * community-item-proxyn (Bearer server-side). Misslyckad/oanvändbar hämtning
 * eller övriga community-items degraderar till en metadata-prompt — aldrig ett
 * kast som stoppar insättningen.
 */
export async function buildShadcnInsertMessage(
  selection: ShadcnInsertSelection,
  deps: ShadcnInsertDeps = {},
): Promise<PromptBuildResult> {
  let registryItem: ShadcnRegistryItem | null = null;
  if (selection.registry === OFFICIAL_SHADCN_REGISTRY) {
    const fetchItem = deps.fetchItem ?? fetchRegistryItem;
    // Hydreringen är best-effort: en proxy/upstream som HÄNGER (i stället för
    // att avvisa) får inte hålla kvar kortet i "Skickar…" och det globala
    // in-flight-låset — degradera till metadata-prompt efter timeouten.
    registryItem = await hydrateWithTimeout(fetchItem(selection.name));
  } else if (selection.registry === SHADCNBLOCKS_NAMESPACE) {
    const fetchCommunity = deps.fetchCommunityItem ?? fetchCommunityRegistryItem;
    registryItem = await hydrateWithTimeout(
      fetchCommunity(selection.registry, selection.name),
    );
  }
  return buildPromptSourceMessage(
    {
      kind: "shadcn-item",
      name: selection.name,
      registry: selection.registry,
      title: selection.title,
      description: selection.description,
      dependencies: selection.dependencies,
      registryDependencies: selection.registryDependencies,
      addCommand: selection.addCommand,
      registryItem,
      // Drag-and-drop-placering (om satt): samma placement-kuvert som
      // Composer-blockens AI-fallback. Klick-insättning lämnar fälten tomma
      // → oförändrad default-copy.
      placement: selection.placement,
    },
    {
      placementLabel: selection.placementLabel,
      anchorLabel: selection.anchorSectionLabel ?? null,
    },
  );
}
