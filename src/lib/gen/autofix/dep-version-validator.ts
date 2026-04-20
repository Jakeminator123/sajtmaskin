/**
 * Validerar och uppgraderar `package.json`-dependencies mot npm-registret.
 *
 * Roll i autofix-pipelinen: körs SIST efter `dep-completer` mergat in
 * upptäckta paket. Den här passen säkerställer att varken LLM:en eller vår
 * egen `KNOWN_PACKAGES`-tabell kan smita igenom med en versionsspec som
 * inte finns publicerad på npm. Om versionen inte är publicerad ersätter
 * vi den med `^<latest>` från registret.
 *
 * Säkerhetsnät:
 * - Är registret otillgängligt (offline / timeout) lämnas specen orörd.
 *   Vi vill aldrig förvärra en redan vettig spec bara för att vi inte
 *   nådde nätet.
 * - Aldrig downgrade. Om vi inte kan verifiera, behåll som är.
 * - Hanterar både `dependencies` och `devDependencies` separat.
 */

import { isVersionSpecValid, resolveLatestVersion } from "./npm-registry";

export interface DepCorrection {
  pkg: string;
  from: string;
  to: string;
  reason: string;
  field: "dependencies" | "devDependencies";
}

export interface DepValidationResult {
  /** Uppdaterad map över dependencies. */
  dependencies: Record<string, string>;
  /** Uppdaterad map över devDependencies. */
  devDependencies: Record<string, string>;
  /** Förändringar som faktiskt gjordes. Tom om inget behövde rättas. */
  corrections: DepCorrection[];
}

async function validateMap(
  field: "dependencies" | "devDependencies",
  input: Record<string, string>,
): Promise<{ next: Record<string, string>; corrections: DepCorrection[] }> {
  const next: Record<string, string> = { ...input };
  const corrections: DepCorrection[] = [];

  await Promise.all(
    Object.entries(input).map(async ([pkg, spec]) => {
      try {
        const valid = await isVersionSpecValid(pkg, spec);
        if (valid) return;
        const latest = await resolveLatestVersion(pkg);
        if (!latest) return;
        next[pkg] = latest;
        corrections.push({
          pkg,
          from: spec,
          to: latest,
          reason: `version ${spec} not published on npm; bumped to registry latest`,
          field,
        });
      } catch {
        // Best-effort; on any unexpected error keep the original spec.
      }
    }),
  );

  return { next, corrections };
}

/**
 * Validera och vid behov uppgradera dependencies/devDependencies.
 * Returnerar uppdaterade maps + lista över förändringar.
 */
export async function validateAndUpgradeDeps(input: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): Promise<DepValidationResult> {
  const deps = input.dependencies ?? {};
  const devDeps = input.devDependencies ?? {};

  const [depsResult, devDepsResult] = await Promise.all([
    validateMap("dependencies", deps),
    validateMap("devDependencies", devDeps),
  ]);

  return {
    dependencies: depsResult.next,
    devDependencies: devDepsResult.next,
    corrections: [...depsResult.corrections, ...devDepsResult.corrections],
  };
}
