import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("materializes every file-shipping dossier (hard + soft) with exact files and deterministic dependencies", () => {
    const fileShippingDossiers = getAllDossiers().filter(
      (dossier) => (dossier.files ?? []).length > 0,
    );
    expect(fileShippingDossiers.length).toBeGreaterThan(0);
    expect(
      fileShippingDossiers.some((dossier) => dossier.class === "soft"),
      "soft dossiers with files must be covered — maplibre-map's broken verbatim import rotted unnoticed under the former hard-only matrix",
    ).toBe(true);

    for (const dossier of fileShippingDossiers) {
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

  it("rejects file-less dossiers because there is nothing to build", () => {
    const fileless = getAllDossiers().find((dossier) => (dossier.files ?? []).length === 0);
    expect(fileless, "expected at least one instructions-only dossier in the pool").toBeDefined();
    expect(() => buildDossierAcceptanceProject(fileless!.id)).toThrow(
      /requires a dossier with declared files/,
    );
  });

  it("materializes openai-chat with the AI SDK ranges used by the warm typecheck", () => {
    const project = buildDossierAcceptanceProject("openai-chat");
    const packageFile = project.files.find((file) => file.path === "package.json");
    expect(packageFile).toBeDefined();
    const chatRoute = project.files.find((file) => file.path === "app/api/chat/route.ts");
    expect(chatRoute?.content).toContain("await convertToModelMessages(messages)");

    const generated = JSON.parse(packageFile!.content) as {
      dependencies?: Record<string, string>;
    };
    const platform = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const warmCacheDependencies = {
      ...(platform.dependencies ?? {}),
      ...(platform.devDependencies ?? {}),
    };

    for (const dependency of ["ai", "@ai-sdk/openai", "@ai-sdk/react"] as const) {
      expect(
        generated.dependencies?.[dependency],
        `${dependency}: generated VM range must match the platform declaration behind the warm-cache node_modules`,
      ).toBe(warmCacheDependencies[dependency]);
    }
    expect(generated.dependencies?.ai).not.toMatch(/^\^?7(?:\.|$)/);
  });
});
