import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";

/**
 * "Beskriv"-discovery-lager (Fas 1 + Fas 2 v1 av plan
 * `docs/plans/active/2026-07-22-shadcn-registry-beskriv-komposition.md`).
 *
 * Default AV — opt-in via `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE`. Reversibel:
 * flagga av = `POST /api/shadcn/describe` svarar 404, och "Beskriv"-fliken i
 * "Lägg till"-ytan visar "kommer snart"-platshållaren (noll beteendeändring).
 * Routen skriver aldrig något till användarsajten — den översätter en
 * fritext-beskrivning till registry-sökfrågor, söker officiella + community-
 * register och returnerar rankade, verkliga kandidater. Insättning av ett valt
 * kort går via own-engine-lanen (`src/lib/builder/shadcn-insert.ts`).
 *
 * OBS för konsumenter i klientkomponenter: läs flaggan EFTER mount
 * (useEffect → state, initialt `false`) för att undvika SSR/CSR-
 * hydratmismatch — samma mönster som `add-panel-feature.ts`.
 */
export function isShadcnDescribeEnabled(): boolean {
  const raw = sanitizeEnvString(
    process.env.NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE,
  )?.toLowerCase();
  return raw ? isAffirmativeEnvValue(raw) : false;
}
