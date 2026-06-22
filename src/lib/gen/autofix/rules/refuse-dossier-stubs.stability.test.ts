import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CodeFile } from "@/lib/gen/parser";

/**
 * Grandmaster område 7 — A7-2 (false-green-härdning), flag-gated default-OFF.
 *
 * Källa (N#1):
 *   docs/plans/avklarat/grandmaster/aktiviteter/A7-2-refuse-dossier-stubs-flag.md
 *   docs/plans/avklarat/grandmaster/07-false-green-hardning.md
 *
 * Invariant som låses: `checkCrossFileImports` får ALDRIG tyst fabricera en
 * null-render-stub för en dossier-exponerad import NÄR `FEATURES.refuseDossierStubs`
 * är PÅ. Då lämnas importen oresolvad och en `refused: true`-fix signaleras, så
 * den befintliga nedströms-grinden `runProjectSanityChecks` (#1 "Unresolved local
 * import" → error / code_structure_failure) blockar i stället för att skeppa
 * false-green hollow output.
 *
 * DEFAULT-OFF-kontrakt (BUG-SWARM N#1: att vägra/degradera dossier-stubbar kan
 * flippa version-status röd): med flaggan AV är beteendet EXAKT som master —
 * stubben skapas tyst som idag och ingen `refused`-markör sätts. Detta test
 * låser båda lägena så att en framtida default-flipp eller en borttagen gren
 * upptäcks omedelbart.
 *
 * Rena enheter (ingen disk-dossierdata, ingen env, ingen live-pipeline):
 *  - checker-funktionen direkt
 *  - `FEATURES` mockas (partiellt) så flaggan kan togglas per fall
 *  - `getDossierExposesByImportPath` mockas (partiellt) → deterministisk match
 *  - `runProjectSanityChecks` (oskuggad) bevisar nedströms degrade/blocker
 */

const mockState = vi.hoisted(() => {
  const dossierImport = "@/integrations/payments-checkout";
  return {
    refuseDossierStubs: false,
    dossierImport,
    dossierMatch: {
      dossierId: "stripe-checkout",
      klass: "hard" as const,
      capability: "payments",
      importPath: dossierImport,
    },
  };
});

vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return {
    ...actual,
    FEATURES: {
      ...actual.FEATURES,
      get refuseDossierStubs() {
        return mockState.refuseDossierStubs;
      },
    },
  };
});

vi.mock("@/lib/gen/dossiers/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gen/dossiers/registry")>();
  return {
    ...actual,
    getDossierExposesByImportPath: (importPath: string) =>
      importPath === mockState.dossierImport ? mockState.dossierMatch : null,
  };
});

import { checkCrossFileImports } from "@/lib/gen/autofix/rules/cross-file-import-checker";
import { runProjectSanityChecks } from "@/lib/gen/validation/project-sanity";

const STUB_PATH = "integrations/payments-checkout.tsx";

function importerImportingDossierPath(): CodeFile {
  return {
    path: "app/page.tsx",
    language: "tsx",
    content: [
      `import { PaymentsCheckout } from "${mockState.dossierImport}";`,
      "",
      "export default function Page() {",
      "  return <PaymentsCheckout />;",
      "}",
    ].join("\n"),
  };
}

describe("A7-2 — autofix refuses dossier stubs (flag-gated, default-OFF)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockState.refuseDossierStubs = false;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("flag OFF (master default): fabricates the silent null-render stub exactly like today", () => {
    mockState.refuseDossierStubs = false;

    const result = checkCrossFileImports([importerImportingDossierPath()]);

    // Silent stub IS created → import resolves, build does not break.
    const stub = result.files.find((f) => f.path === STUB_PATH);
    expect(stub).toBeDefined();
    expect(stub?.content).toContain("PaymentsCheckout");

    const fix = result.fixes.find((f) => f.missingImport === mockState.dossierImport);
    expect(fix).toBeDefined();
    expect(fix?.stubFile).toBe(STUB_PATH);
    expect(fix?.dossierId).toBe(mockState.dossierMatch.dossierId);
    expect(fix?.capability).toBe(mockState.dossierMatch.capability);
    // Master must NOT mark the fix as refused.
    expect(fix?.refused).toBeUndefined();

    // Downstream parity: with the stub present the import resolves, so the
    // false-green guard does NOT flag it — identical to master behavior.
    const sanity = runProjectSanityChecks(result.files);
    expect(sanity.issues.some((i) => i.message.includes(mockState.dossierImport))).toBe(false);
  });

  it("flag ON: refuses the stub and emits a degrade/blocker signal instead", () => {
    mockState.refuseDossierStubs = true;

    // B05: the matched dossier WAS selected for this generation, so the gate
    // legitimately refuses the hollow stub.
    const result = checkCrossFileImports(
      [importerImportingDossierPath()],
      [mockState.dossierMatch.dossierId],
    );

    // No silent stub is fabricated → the dossier import stays unresolved.
    expect(result.files.some((f) => f.path === STUB_PATH)).toBe(false);

    const fix = result.fixes.find((f) => f.missingImport === mockState.dossierImport);
    expect(fix).toBeDefined();
    expect(fix?.refused).toBe(true);
    expect(fix?.dossierId).toBe(mockState.dossierMatch.dossierId);
    expect(fix?.capability).toBe(mockState.dossierMatch.capability);

    // Downstream blocker: the unresolved import is the signal the pipeline
    // already understands — runProjectSanityChecks (#1) raises an
    // error-severity code_structure_failure rather than false-green success.
    const sanity = runProjectSanityChecks(result.files);
    const blocker = sanity.issues.find(
      (i) =>
        i.message.includes(mockState.dossierImport) && i.category === "code_structure_failure",
    );
    expect(blocker).toBeDefined();
    expect(blocker?.severity).toBe("error");
  });

  it("flag ON but matched dossier NOT selected: creates the silent stub (B05 — no false-RED)", () => {
    mockState.refuseDossierStubs = true;

    // The import matches a dossier in the registry, but that dossier was NOT
    // selected for this generation. The gate must NOT refuse — otherwise a
    // registry-wide match blocks a legitimate build (false-RED) in prod.
    const result = checkCrossFileImports(
      [importerImportingDossierPath()],
      ["some-other-unrelated-dossier"],
    );

    // Silent stub IS created → import resolves, build does not break.
    const stub = result.files.find((f) => f.path === STUB_PATH);
    expect(stub).toBeDefined();
    expect(stub?.content).toContain("PaymentsCheckout");

    const fix = result.fixes.find((f) => f.missingImport === mockState.dossierImport);
    expect(fix).toBeDefined();
    expect(fix?.refused).toBeUndefined();

    // Downstream parity: with the stub present the import resolves, so the
    // false-green guard does NOT flag it.
    const sanity = runProjectSanityChecks(result.files);
    expect(sanity.issues.some((i) => i.message.includes(mockState.dossierImport))).toBe(false);
  });

  it("flag ON: leaves non-dossier cross-file stubs untouched (warning-only branch unchanged)", () => {
    mockState.refuseDossierStubs = true;

    const page: CodeFile = {
      path: "app/page.tsx",
      language: "tsx",
      content: [
        'import { TotallyMadeUpThing } from "@/components/totally-made-up-thing";',
        "export default function Page() { return <TotallyMadeUpThing />; }",
      ].join("\n"),
    };

    const result = checkCrossFileImports([page]);

    // A non-dossier missing import is still stubbed (no dossier match → flag
    // does not apply). This guards that the gate only touches the dossier branch.
    const stub = result.files.find((f) => f.path === "components/totally-made-up-thing.tsx");
    expect(stub).toBeDefined();
    const fix = result.fixes.find((f) => f.missingImport === "@/components/totally-made-up-thing");
    expect(fix?.refused).toBeUndefined();
  });
});
