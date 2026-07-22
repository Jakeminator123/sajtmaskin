import type { ShadcnRegistryItem } from "@/lib/shadcn/registry-types";
import { fetchRegistryItem, isUsableRegistryItem } from "@/lib/shadcn/registry-service";
import {
  buildPromptSourceMessage,
  type PromptBuildResult,
} from "@/lib/builder/prompt-builder";

/**
 * Insättnings-lane v1 ("Lägg till"-ytan → own-engine)
 * ====================================================
 *
 * Gör ett valt registry-kort (Bläddra-galleriet eller Beskriv-fliken)
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

/** Tak för best-effort-hydreringen av officiell registry-källkod (Codex P2). */
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
};

export type ShadcnInsertDeps = {
  /** Injicerbar för test — default är den befintliga registry-item-fetchen. */
  fetchItem?: (name: string) => Promise<ShadcnRegistryItem>;
};

/**
 * Bygg prompt-meddelande + promptSourceMeta för ett valt registry-kort.
 *
 * Officiella items hydreras best-effort med full källkod via den befintliga
 * `fetchRegistryItem` (proxy-routen i klienten). Misslyckad/oanvändbar hämtning
 * eller community-items degraderar till en metadata-prompt — aldrig ett kast
 * som stoppar insättningen.
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const item = await Promise.race([
        fetchItem(selection.name),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), HYDRATION_TIMEOUT_MS);
        }),
      ]);
      registryItem = item !== null && isUsableRegistryItem(item) ? item : null;
    } catch {
      registryItem = null;
    } finally {
      clearTimeout(timer);
    }
  }
  return buildPromptSourceMessage({
    kind: "shadcn-item",
    name: selection.name,
    registry: selection.registry,
    title: selection.title,
    description: selection.description,
    dependencies: selection.dependencies,
    registryDependencies: selection.registryDependencies,
    addCommand: selection.addCommand,
    registryItem,
  });
}
