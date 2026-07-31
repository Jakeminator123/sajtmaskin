/**
 * Builder icon language (spår 03, Del E) — ETT ikonspråk för buildern.
 *
 * Bakgrund: previewverktygen i headern (`BuilderPreviewTools`) och lägesknapparna
 * i chattens verktygsrad (`ChatInterface`) blev ikon-only samtidigt. För att nästa
 * yta inte ska uppfinna en egen dialekt bor reglerna här.
 *
 * REGELN:
 *
 * 1. **Namn + tooltip.** En ikon-only-knapp bär alltid sitt namn i `aria-label`
 *    (skärmläsare) och en `title` som tooltip. Byts text mot ikon i en test-täckt
 *    yta uppdateras testet i samma ändring (matcha `aria-label`, inte synlig text).
 *
 * 2. **Storlek och avstånd.** Kvadratiska knappar, ikon centrerad.
 *    - Header-klustret (`BuilderPreviewTools`, luftigare rad): `h-8 w-8`, ikon
 *      `h-4 w-4`, mellanrum `gap-0.5` i det bordersatta klustret.
 *    - Chattens verktygsrad (`ChatInterface`, tätare rad): `h-7 w-7`, ikon
 *      `size-3`, mellanrum `gap-1.5`.
 *    Två densiteter, samma språk — den luftiga headern och den täta verktygsraden
 *    delar form (kvadrat + centrerad ikon), inte pixelmått.
 *
 * 3. **Aktivt läge (toggle).** Markeras med FÄRGAD RAM + FYLLD TONAD BAKGRUND, inte
 *    bara en nyansskiftning: `border-<ton>-500/60 bg-<ton>-900/50 text-<ton>-100`.
 *    Färgen är knapens egen (violett för composern, emerald för inspektorn) och
 *    bär av/på tillsammans med `aria-pressed`. Se {@link builderModeToggleClassName}.
 *
 * 4. **Tyngd via MÄTTNAD, inte bara nyans.** En tung/destruktiv åtgärd får inte se
 *    lika lätt ut som en ofarlig.
 *    - Tyngst (startar ett riktigt bygge, kostar diamonds): FYLLD solid knapp
 *      (`bg-violet-600 text-white`) — "Bygg integrationer".
 *    - Destruktiv men billig (river preview-sessionen): neutral i vila, RÖD ton
 *      på hover — "Rensa preview" ({@link BUILDER_DESTRUCTIVE_ICON_CLASS}).
 *    - Lätt/ofarlig (öppnar en flik): neutral i vila, SVAG ack-ton på hover
 *      ({@link BUILDER_LIGHT_ICON_CLASS}). Låg mättnad så den aldrig konkurrerar
 *      visuellt med den fyllda bygg-knappen.
 */

import { cn } from "@/lib/utils";

/** Kvadratisk ikonknapp i headerns previewkluster. Ikon `h-4 w-4`. */
export const BUILDER_HEADER_ICON_CLASS =
  "h-8 w-8 p-0";

/**
 * Lätt/ofarlig ikon-only-åtgärd i headern (t.ex. "Öppna i ny flik"): neutral i
 * vila, svag sky-ton på hover. Låg mättnad — får aldrig se lika tung ut som den
 * fyllda "Bygg integrationer"-knappen (regel 4).
 */
export const BUILDER_LIGHT_ICON_CLASS =
  "text-sky-300/80 hover:bg-sky-500/10 hover:text-sky-200";

/**
 * Destruktiv men billig ikon-only-åtgärd (t.ex. "Rensa preview" som river
 * sessionen): neutral i vila, röd ton på hover. Signalerar destruktivitet utan
 * att skrika (regel 4).
 */
export const BUILDER_DESTRUCTIVE_ICON_CLASS =
  "text-muted-foreground hover:bg-red-500/10 hover:text-red-300";

const MODE_TOGGLE_BASE =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-800/50 text-zinc-300 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-40";

const MODE_TOGGLE_ACTIVE: Record<"violet" | "emerald", string> = {
  violet: "border-violet-500/60 bg-violet-900/50 text-violet-100",
  emerald: "border-emerald-500/60 bg-emerald-900/50 text-emerald-100",
};

/**
 * Klassnamn för en ikon-only toggle-knapp i chattens verktygsrad (regel 2 + 3).
 * Aktivt läge bär färgad ram + fylld tonad bakgrund; `aria-pressed` bär det
 * programmatiskt. `tone` är knappens egen färg.
 */
export function builderModeToggleClassName(
  active: boolean,
  tone: "violet" | "emerald",
): string {
  return cn(MODE_TOGGLE_BASE, active && MODE_TOGGLE_ACTIVE[tone]);
}
