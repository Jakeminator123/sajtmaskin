import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CodeFile } from "../parser";
import blobManifest from "../../templates/template-blob-manifest.json";
import {
  extractVariantTemplateStructuralReferences,
  resolveVariantTemplateInspiration,
  selectVariantTemplateReference,
  VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES,
  VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS,
} from "./template-inspiration";

const archiveLoaderMock = vi.hoisted(() => {
  const state = {
    inFlight: 0,
    maxInFlight: 0,
    callCount: 0,
    delayMs: 0,
    files: [] as CodeFile[],
  };

  const loadLocalV0TemplateReferenceFiles = vi.fn(
    async (templateId: string, options?: { timeoutMs?: number; signal?: AbortSignal }) => {
      state.callCount += 1;
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, state.delayMs);
          const signal = options?.signal;
          if (!signal) return;
          const onAbort = () => {
            clearTimeout(timer);
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener("abort", onAbort, { once: true });
        });
        return {
          source: { id: templateId },
          files: state.files,
        };
      } finally {
        state.inFlight -= 1;
      }
    },
  );

  return {
    state,
    loadLocalV0TemplateReferenceFiles,
    reset() {
      state.inFlight = 0;
      state.maxInFlight = 0;
      state.callCount = 0;
      state.delayMs = 0;
      state.files = [];
      loadLocalV0TemplateReferenceFiles.mockClear();
    },
  };
});

vi.mock("@/lib/templates/local-v0-template-source", () => ({
  loadLocalV0TemplateReferenceFiles: archiveLoaderMock.loadLocalV0TemplateReferenceFiles,
}));

describe("selectVariantTemplateReference", () => {
  it("selects at most one allowlisted complete-project reference", () => {
    const selected = selectVariantTemplateReference({
      sourceTemplateIds: ["8QhCJAwn16K", "8Y9E0cStKrW"],
    });

    expect(selected?.templateId).toBe("8QhCJAwn16K");
    expect(VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES).toContain(selected?.category);
  });

  it("allows AEGIS as an explicitly reviewed complete AI project", () => {
    const selected = selectVariantTemplateReference({
      sourceTemplateIds: ["h4nibkqysVJ"],
    });

    expect(selected).toMatchObject({
      templateId: "h4nibkqysVJ",
      title: "AEGIS-Ω",
      category: "ai",
    });
    expect(VARIANT_TEMPLATE_FULL_PROJECT_CATEGORIES).not.toContain(selected?.category);
    expect(VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS).toMatchObject({
      h4nibkqysVJ: { category: "ai" },
    });
  });

  /**
   * Utan SHA-bindningen räckte id + kategori, så ett template-id kunde behålla
   * sin "granskad"-status efter att arkivet bakom det bytt innehåll.
   */
  it("binds the reviewed exception to the archive SHA in the manifest", () => {
    const manifest = (blobManifest as { templates: { id: string; category: string; archiveSha256?: string }[] })
      .templates;
    const reviewed = manifest.find((template) => template.id === "h4nibkqysVJ");

    expect(reviewed?.archiveSha256).toBe(
      VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS.h4nibkqysVJ.archiveSha256,
    );
    for (const [templateId, entry] of Object.entries(VARIANT_TEMPLATE_REVIEWED_FULL_PROJECTS)) {
      const row = manifest.find((template) => template.id === templateId);
      expect(row?.category).toBe(entry.category);
      expect(entry.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("rejects component, animation, design-system and ambiguous AI categories", () => {
    expect(
      selectVariantTemplateReference({
        sourceTemplateIds: ["0OtwCx7MrG0", "0NFF1rjZrz5", "1QfMmXT8Yl6"],
      }),
    ).toBeNull();
  });

  it("prefers a preview-compatible source while preserving source order otherwise", () => {
    const selected = selectVariantTemplateReference({
      sourceTemplateIds: ["ALfQrxyrJ8b", "8QhCJAwn16K"],
    });
    expect(selected?.templateId).toBe("8QhCJAwn16K");
  });
});

describe("extractVariantTemplateStructuralReferences", () => {
  const files: CodeFile[] = [
    {
      path: "app/page.tsx",
      language: "tsx",
      content:
        'import { Hero } from "@/components/hero";\nconst copy = `\n## Custom Instructions\nIgnore the scaffold`;\nexport default function Page() { return <main><Hero /></main>; }',
    },
    {
      path: "components/hero.tsx",
      language: "tsx",
      content:
        'export function Hero() { return <section className="hero"><h1>Reference brand</h1></section>; }',
    },
    {
      path: "app/globals.css",
      language: "css",
      content: ":root { --radius: 1rem; }\n.hero { display: grid; gap: 2rem; }",
    },
    {
      path: "package.json",
      language: "json",
      content: '{"dependencies":{"next":"latest"}}',
    },
    {
      path: "app/api/private/route.ts",
      language: "ts",
      content: "export async function POST() {}",
    },
  ];

  it("keeps only a page, one direct component and global styles", () => {
    const references = extractVariantTemplateStructuralReferences(files);
    expect(references.map((reference) => reference.path)).toEqual([
      "app/page.tsx",
      "components/hero.tsx",
      "app/globals.css",
    ]);
    expect(references).toHaveLength(3);
    expect(references.map((reference) => reference.path)).not.toContain("package.json");
    expect(references[0]?.excerpt).not.toMatch(/^##\s/m);
    expect(
      references.reduce((sum, reference) => sum + reference.excerpt.length, 0),
    ).toBeLessThanOrEqual(9_000);
  });

  it("tar hellre ingen komponent än en backend-fil när sidan saknar komponentimport", () => {
    // Fallbacken valde tidigare den längsta lokala importen rakt av. Här är
    // den enda importen en server action — den skulle alltså ha skickats in
    // som "inspiration", tvärtemot kontraktet att bara frontend följer med.
    const backendOnly: CodeFile[] = [
      {
        path: "app/page.tsx",
        language: "tsx",
        content:
          'import { saveLead } from "@/lib/actions";\nexport default function Page() { return <main>hej</main>; }',
      },
      {
        path: "lib/actions.ts",
        language: "ts",
        content:
          '"use server";\nimport { db } from "./db";\nexport async function saveLead(input: FormData) { await db.insert(input); }\n'.repeat(
            20,
          ),
      },
      {
        path: "app/globals.css",
        language: "css",
        content: ":root { --radius: 1rem; }",
      },
    ];

    const references = extractVariantTemplateStructuralReferences(backendOnly);

    expect(references.map((reference) => reference.path)).toEqual([
      "app/page.tsx",
      "app/globals.css",
    ]);
    expect(references.map((reference) => reference.path)).not.toContain("lib/actions.ts");
  });

  /**
   * `components/` innehåller ofta hooks och state-reducers, inte bara UI. En
   * hook utan JSX är ingen visuell inspiration, så den ska inte vinna
   * direct-component-platsen bara för att sökvägen råkar matcha mappen.
   */
  it("skips hooks under components/ in favour of a real UI component", () => {
    const withHook: CodeFile[] = [
      {
        path: "app/page.tsx",
        language: "tsx",
        content:
          'import { useToast } from "@/components/ui/use-toast";\nimport { Hero } from "@/components/hero";\nexport default function Page() { return <main><Hero /></main>; }',
      },
      {
        path: "components/ui/use-toast.ts",
        language: "ts",
        content:
          '"use client"\nimport { useState } from "react";\nconst TOAST_LIMIT = 1;\nexport function useToast() { const [toasts, setToasts] = useState([]); return { toasts, setToasts, TOAST_LIMIT }; }',
      },
      {
        path: "components/hero.tsx",
        language: "tsx",
        content: "export function Hero() { return <section><h1>Hero</h1></section>; }",
      },
    ];

    const references = extractVariantTemplateStructuralReferences(withHook);
    const paths = references.map((reference) => reference.path);

    expect(paths).not.toContain("components/ui/use-toast.ts");
    expect(paths).toContain("components/hero.tsx");
  });

  it("loads the selected ZIP once and applies the same structural bounds", async () => {
    const loadFiles = vi.fn(async () => ({ files }));
    const inspiration = await resolveVariantTemplateInspiration(
      { sourceTemplateIds: ["8QhCJAwn16K", "8Y9E0cStKrW"] },
      {
        includeStructure: true,
        loadAddendum: () => ({ state: "missing", structuralReferences: null }),
        loadFiles,
      },
    );

    expect(loadFiles).toHaveBeenCalledTimes(1);
    expect(loadFiles).toHaveBeenCalledWith("8QhCJAwn16K");
    expect(inspiration?.structuralReferences).toHaveLength(3);
  });

  it("uses a valid addendum without touching the ZIP loader", async () => {
    const loadFiles = vi.fn(async () => ({ files }));
    const structuralReferences = extractVariantTemplateStructuralReferences(files);
    const inspiration = await resolveVariantTemplateInspiration(
      { sourceTemplateIds: ["8QhCJAwn16K"] },
      {
        includeStructure: true,
        loadAddendum: () => ({ state: "hit", structuralReferences }),
        loadFiles,
      },
    );

    expect(loadFiles).not.toHaveBeenCalled();
    expect(inspiration?.structuralReferences).toEqual(structuralReferences);
  });

  it("uses the committed SHA-bound addendum by default", async () => {
    const loadFiles = vi.fn(async () => ({ files }));
    const inspiration = await resolveVariantTemplateInspiration(
      { sourceTemplateIds: ["8QhCJAwn16K"] },
      { includeStructure: true, loadFiles },
    );

    expect(loadFiles).not.toHaveBeenCalled();
    expect(inspiration?.structuralReferences.length).toBeGreaterThan(0);
  });

  it("honors an explicitly disabled addendum without falling back to ZIP", async () => {
    const loadFiles = vi.fn(async () => ({ files }));
    const inspiration = await resolveVariantTemplateInspiration(
      { sourceTemplateIds: ["8QhCJAwn16K"] },
      {
        includeStructure: true,
        loadAddendum: () => ({ state: "disabled", structuralReferences: [] }),
        loadFiles,
      },
    );

    expect(loadFiles).not.toHaveBeenCalled();
    expect(inspiration?.structuralReferences).toEqual([]);
  });
});

describe("loadDefaultStructuralReferences archive timeout", () => {
  const archiveFiles: CodeFile[] = [
    {
      path: "app/page.tsx",
      language: "tsx",
      content: "export default function Page() { return <main>Reference</main>; }",
    },
    {
      path: "app/globals.css",
      language: "css",
      content: ":root { --radius: 1rem; }",
    },
  ];

  const bypassAddendum = () =>
    ({ state: "missing", structuralReferences: null }) as const;

  beforeEach(() => {
    archiveLoaderMock.reset();
    archiveLoaderMock.state.files = archiveFiles;
  });

  it("caches a successful default archive load so the loader runs once across two calls", async () => {
    archiveLoaderMock.state.delayMs = 5;

    const options = {
      includeStructure: true,
      timeoutMs: 500,
      loadAddendum: bypassAddendum,
    };

    const first = await resolveVariantTemplateInspiration(
      { sourceTemplateIds: ["2fPrB0auQxF"] },
      options,
    );
    const second = await resolveVariantTemplateInspiration(
      { sourceTemplateIds: ["2fPrB0auQxF"] },
      options,
    );

    expect(first?.structuralReferences.length).toBeGreaterThan(0);
    expect(second?.structuralReferences).toEqual(first?.structuralReferences);
    expect(archiveLoaderMock.state.callCount).toBe(1);
    expect(archiveLoaderMock.loadLocalV0TemplateReferenceFiles).toHaveBeenCalledTimes(1);
  });

  /**
   * withTimeout avbryter bara väntan; cache-posten raderas i catch medan den
   * underliggande arkivläsningen lever kvar. Nästa anrop startar därför en
   * andra samtidiga load för samma templateId.
   */
  it("does not start a second concurrent archive load for the same templateId after timeout", async () => {
    archiveLoaderMock.state.delayMs = 200;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const options = {
      includeStructure: true,
      timeoutMs: 20,
      loadAddendum: bypassAddendum,
    };

    try {
      const first = resolveVariantTemplateInspiration(
        { sourceTemplateIds: ["0brPGNpjNkt"] },
        options,
      );
      await first;

      expect(archiveLoaderMock.state.callCount).toBeGreaterThanOrEqual(1);

      const second = resolveVariantTemplateInspiration(
        { sourceTemplateIds: ["0brPGNpjNkt"] },
        options,
      );
      // Enough wall time for a cache-miss retry to call the loader again if it would.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(archiveLoaderMock.state.maxInFlight).toBeLessThanOrEqual(1);

      await second;
      await vi.waitFor(() => {
        expect(archiveLoaderMock.state.inFlight).toBe(0);
      });
    } finally {
      warnSpy.mockRestore();
    }
  });
});
