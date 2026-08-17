/**
 * Shared Swedish vocabulary for the THREE independent dossier axes.
 *
 * The system's most common misreading is that these three answer each other.
 * They do not — a Kopplad (hard) dossier can be fully usable in F2, and the
 * demo mode says nothing about whether F3 is required:
 *
 * | Axel | Fråga | Ägare (kanonisk) |
 * |---|---|---|
 * | Kopplad/Fristående | Har implementationen en deklarerad provider-/integrationskoppling? | mappen `data/dossiers/{hard,soft}/` |
 * | Demoläge (`mock`) | Hur beter sig ytan i F2/designläget utan livekonfiguration? | manifestfältet `mock` |
 * | Kräver F3 | Måste den riktiga integrationen byggas i ett eget steg? | `dossierRequiresF3()` (build-nyckel ELLER serverfil) |
 *
 * Every user-facing surface that shows a dossier reads its labels here so the
 * builder panel, the catalog tab and the docs cannot drift into three
 * vocabularies. The backoffice list (Python) consumes the same words via the
 * generated `labelsSv` projection in `capability-map.json` — it does not keep
 * its own copy.
 *
 * Canonical contract: `docs/contracts/dossier-system.md` § Tre oberoende axlar.
 */

import type {
  DossierEnvVarEnforcement,
  DossierMockMode,
} from "@/lib/gen/dossiers/types";

export interface DossierAxisDescriptor {
  /** Short badge/chip label. */
  label: string;
  /** Longer tooltip text — always says what the user actually gets. */
  hint: string;
}

/** Short UI labels for the manifest's per-key enforcement contract. */
export const DOSSIER_ENV_ENFORCEMENT_LABELS: Record<DossierEnvVarEnforcement, string> = {
  build: "krävs",
  "feature-runtime": "vid användning",
  "warn-only": "valfri",
};

/**
 * Demo-mode labels. Projected into `capability-map.json` (`labelsSv.mock`) for
 * non-TypeScript consumers — do not re-copy these strings into Python.
 */
const MOCK_MODE_LABELS: Record<DossierMockMode, string> = {
  canned: "Fabricerat demo-svar",
  seed: "Medskickad demo-data",
  success: "Fejkad success + demo-notis",
  visual: "Full yta, ärlig demo-notis",
  none: "Ingen demo-yta",
};

const MOCK_MODE_HINTS: Record<DossierMockMode, string> = {
  canned:
    "Servern svarar med ett trovärdigt påhittat svar (chatten streamar ett förberett svar) tills en riktig nyckel sparas.",
  seed: "Data-lagret använder medskickad exempeldata och en diskret notis tills en riktig databas kopplas in.",
  success:
    "Formuläret går igenom och svarar med en ärlig demo-notis — inget mejl och ingen prenumeration skickas på riktigt.",
  visual:
    "Ytan renderas fullt ut, men handlingen öppnar en ärlig demo-notis i stället för en riktig betalning eller inloggning.",
  none: "Ingen användarsynlig demo-yta — komponenten stänger av sig själv eller visar en konfigurationsnotis.",
};

/**
 * Axis 1 — does the manifest declare a provider/integration coupling?
 * Deliberately says nothing about env keys, F2 materialization, mock behavior
 * or F3: those are independent contracts. Keyless public resources alone do
 * not make a dossier hard; hard manifests declare `providers`.
 */
export function describeDossierClass(dossierClass: "hard" | "soft"): DossierAxisDescriptor {
  if (dossierClass === "hard") {
    return {
      label: "Kopplad",
      hint: "Har en deklarerad koppling till en extern provider/tjänst eller dess integrations-/runtimekontrakt. Kan använda nycklar, SDK eller serverkod; demoläge och behov av extra bygge avgörs separat.",
    };
  }
  return {
    label: "Fristående",
    hint: "Har ingen deklarerad extern provider eller hemlig nyckel. Kan använda npm-paket, lokala filer och publika nyckelfria resurser.",
  };
}

/**
 * Axis 2 — how the surface behaves in F2/preview without live configuration. An
 * omitted manifest field means `none`, exactly like runtime reads it.
 */
export function describeDossierMockMode(
  mock: DossierMockMode | null | undefined,
): DossierAxisDescriptor {
  const mode: DossierMockMode = mock ?? "none";
  return {
    label: MOCK_MODE_LABELS[mode] ?? MOCK_MODE_LABELS.none,
    hint: MOCK_MODE_HINTS[mode] ?? MOCK_MODE_HINTS.none,
  };
}

/**
 * Axis 3 — the one that actually decides when the user gets the real thing.
 * Derived server-side from `dossierRequiresF3()`; never re-derived in the UI.
 */
export function describeF3Requirement(requiresF3: boolean): DossierAxisDescriptor {
  if (requiresF3) {
    return {
      label: "Kräver integrationsbygge",
      hint: 'Den riktiga funktionen skapas när du kör "Bygg integrationer". Innan dess kan ytan visas som demo.',
    };
  }
  return {
    label: "Klar utan extra bygge",
    hint: 'Fungerar färdigt redan i designläget — ingen "Bygg integrationer"-runda behövs.',
  };
}
