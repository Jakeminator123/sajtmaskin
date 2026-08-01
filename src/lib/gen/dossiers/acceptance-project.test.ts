import { describe, expect, it } from "vitest";
import {
  isBuiltinPackage,
  parseManifestDependencySpec,
  resolveExportableVersion,
} from "@/lib/gen/autofix/dep-completer";
import { getAllDossiers, getDossierFileContent } from "./registry";
import { mapDossierPathToOutput } from "./output-path";
import { buildDossierAcceptanceProject } from "./acceptance-project";

describe("keyless dossier acceptance project", () => {
  it("materializes every hard dossier with exact files and deterministic dependencies", () => {
    const hardDossiers = getAllDossiers().filter((dossier) => dossier.class === "hard");
    expect(hardDossiers.length).toBeGreaterThan(0);

    for (const dossier of hardDossiers) {
      const project = buildDossierAcceptanceProject(dossier.id);
      const byPath = new Map(project.files.map((file) => [file.path, file.content]));
      expect(byPath.has("package.json"), dossier.id).toBe(true);
      for (const component of ["badge", "button", "card", "separator"]) {
        expect(
          byPath.has(`components/ui/${component}.tsx`),
          `${dossier.id}: landing-page scaffold needs ${component}`,
        ).toBe(true);
      }
      expect(byPath.get(".env.local"), `${dossier.id} must use preview placeholders`).toContain(
        "placeholder .env.local for local development (not production secrets)",
      );

      for (const declared of dossier.files ?? []) {
        const outputPath = mapDossierPathToOutput(declared.path);
        expect(byPath.get(outputPath), `${dossier.id}/${outputPath}`).toBe(
          getDossierFileContent(dossier.class, dossier.id, declared.path),
        );
      }

      const packageJson = JSON.parse(byPath.get("package.json")!) as {
        dependencies?: Record<string, string>;
      };
      for (const raw of dossier.dependencies ?? []) {
        const { pkg } = parseManifestDependencySpec(raw);
        if (!pkg || isBuiltinPackage(pkg)) continue;
        expect(packageJson.dependencies?.[pkg], `${dossier.id}: ${pkg}`).toBe(
          resolveExportableVersion(pkg),
        );
      }
    }
  });

  it("rejects soft dossiers because the scheduled matrix is provider-coupled only", () => {
    expect(() => buildDossierAcceptanceProject("gallery-lightbox")).toThrow(
      /requires a hard dossier/,
    );
  });
});
