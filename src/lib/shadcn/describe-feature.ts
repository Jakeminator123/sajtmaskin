import { isAffirmativeEnvValue, sanitizeEnvString } from "@/lib/env-affirmative";

/**
 * "Beskriv"-discovery-lager (Fas 1 av plan
 * `docs/plans/active/2026-07-22-shadcn-registry-beskriv-komposition.md`).
 *
 * Default AV — opt-in via `NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE`. Reversibel:
 * flagga av = `POST /api/shadcn/describe` svarar 404 och ingen ny kodväg körs
 * (noll beteendeändring). Routen skriver aldrig något till användarsajten — den
 * översätter en fritext-beskrivning till registry-sökfrågor, söker officiella +
 * community-register och returnerar rankade, verkliga kandidater.
 */
export function isShadcnDescribeEnabled(): boolean {
  const raw = sanitizeEnvString(
    process.env.NEXT_PUBLIC_SAJTMASKIN_SHADCN_DESCRIBE,
  )?.toLowerCase();
  return raw ? isAffirmativeEnvValue(raw) : false;
}
