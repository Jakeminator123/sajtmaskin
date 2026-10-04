import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isBuiltinPackage,
  parseManifestDependencySpec,
  resolveExportableVersion,
} from "@/lib/gen/autofix/dep-completer";
import { getAllDossiers, getDossierFileContent } from "./registry";
import * as registry from "./registry";
import { mapDossierPathToOutput } from "./output-path";
import { buildDossierAcceptanceProject } from "./acceptance-project";
import type { DossierEntry } from "./types";

function mockAcceptanceDossier(paths: string[]): void {
  const dossier: DossierEntry = {
    class: "soft",
    id: "synthetic-acceptance",
    label: "Synthetic acceptance",
    capability: "synthetic-acceptance",
    codeFidelity: "rewritable",
    complexity: "simple",
    defaultForCapability: false,
    summary: "Synthetic dossier for acceptance path-conflict tests.",
    files: paths.map((path) => ({ path, role: "shared" as const })),
    lastVerified: "2026-01-01",
  };
  vi.spyOn(registry, "getDossierById").mockReturnValue(dossier);
  vi.spyOn(registry, "getDossierFileContent").mockImplementation(
    (_class, _id, path) => `export const source = ${JSON.stringify(path)};`,
  );
}

describe("keyless dossier acceptance project", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("allows an exact literal scaffold overlay", () => {
    mockAcceptanceDossier(["app/page.tsx"]);
    const project = buildDossierAcceptanceProject("synthetic-acceptance");
    expect(project.files.find((file) => file.path === "app/page.tsx")?.content).toContain(
      '"app/page.tsx"',
    );
  });

  it("rejects a portable scaffold alias before overwriting it", () => {
    mockAcceptanceDossier(["app/Page.tsx"]);
    expect(() => buildDossierAcceptanceProject("synthetic-acceptance")).toThrow(
      "acceptance-output-conflict",
    );
  });

  it.each(["components", "components/site-header.tsx/child.ts"])(
    "rejects scaffold file/directory conflict %s",
    (path) => {
      mockAcceptanceDossier([path]);
      expect(() => buildDossierAcceptanceProject("synthetic-acceptance")).toThrow(
        "acceptance-output-conflict",
      );
    },
  );

  it("rejects a file/directory conflict with an already materialized dossier file", () => {
    mockAcceptanceDossier(["components/cache", "components/cache/item.ts"]);
    expect(() => buildDossierAcceptanceProject("synthetic-acceptance")).toThrow(
      "acceptance-output-conflict",
    );
  });

  it("allows a scaffold prefix sibling without a slash boundary", () => {
    mockAcceptanceDossier(["components/site-header.tsx-extra"]);
    expect(() => buildDossierAcceptanceProject("synthetic-acceptance")).not.toThrow();
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

  it("keeps the MapLibre v6 worker URL before map construction", () => {
    const project = buildDossierAcceptanceProject("maplibre-map");
    const mapDisplay = project.files.find((file) => file.path === "components/map-display.tsx");
    expect(mapDisplay).toBeDefined();

    const workerSetup = mapDisplay!.content.indexOf("maplibregl.setWorkerUrl(");
    const mapConstruction = mapDisplay!.content.indexOf("new maplibregl.Map(");
    expect(workerSetup).toBeGreaterThan(-1);
    expect(mapConstruction).toBeGreaterThan(workerSetup);
    expect(mapDisplay!.content).toContain("maplibre-gl-worker.mjs");
  });
});
