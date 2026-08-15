import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";

/**
 * "Lägg till"-ytan (tabbad panel: Block / Bläddra / Beskriv).
 *
 * Default AV — opt-in via `NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL`. Reversibel:
 * flagga av = exakt dagens Composer-beteende (bar palette, "Composer"-knapp,
 * ingen registry-fetch). Flagga på = tabbad "Lägg till"-panel där "Block"-fliken
 * visar åtta kuraterade `@shadcnblocks/*`-snabbval (own-engine-insättning),
 * "Bläddra" visar shadcn/ui + Marknadsblock, och "Beskriv" är funktionell när även
 * `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE` är på (annars platshållare).
 * Lokala JSX-snippets i `page-blocks-catalog.ts` lever kvar bara när flaggan är av.
 *
 * Del av plan: `docs/plans/avklarat/2026-07-22-shadcn-registry-beskriv-komposition.md`
 * (Fas 2 v1 + Fas 3).
 *
 * OBS för konsumenter i klientkomponenter: `NEXT_PUBLIC_*` inlineas vid build men
 * läs flaggan hydrat-säkert (t.ex. `useSyncExternalStore` med server-snapshot
 * `false`, eller useEffect → state med initialt `false`) för att undvika
 * SSR/CSR-mismatch — samma mönster som `inspect-bridge-feature.ts`.
 */
export function isAddPanelEnabled(): boolean {
  const raw = sanitizeEnvString(process.env.NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL)?.toLowerCase();
  return raw ? isAffirmativeEnvValue(raw) : false;
}
