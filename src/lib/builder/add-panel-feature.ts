import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";

/**
 * "Lägg till"-ytan (tabbad panel: Block / Bläddra / Beskriv).
 *
 * Default AV — opt-in via `NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL`. Reversibel:
 * flagga av = exakt dagens Composer-beteende (bar palette, "Composer"-knapp,
 * ingen registry-fetch). Flagga på = tabbad "Lägg till"-panel där "Block"-fliken
 * återanvänder dagens Composer-palette oförändrad, "Bläddra" väcker det vilande
 * shadcn-registry-galleriet, och "Beskriv" är en tom platshållare (senare fas).
 *
 * Del av plan: `docs/plans/active/2026-07-22-shadcn-registry-beskriv-komposition.md`
 * (Fas 3 — Bläddra).
 *
 * OBS för konsumenter i klientkomponenter: `NEXT_PUBLIC_*` inlineas vid build men
 * läs ändå flaggan EFTER mount (useEffect → state, initialt `false`) för att undvika
 * SSR/CSR-hydratmismatch — samma mönster som `inspect-bridge-feature.ts`.
 */
export function isAddPanelEnabled(): boolean {
  const raw = sanitizeEnvString(process.env.NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL)?.toLowerCase();
  return raw ? isAffirmativeEnvValue(raw) : false;
}
