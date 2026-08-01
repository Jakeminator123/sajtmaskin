/**
 * The copy pass, and — more importantly — every way it is allowed to fail.
 *
 * A publish must never be worse off for having tried to improve its metadata,
 * so each failure mode has to land on "files unchanged, reason recorded".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const generateObjectMock = vi.hoisted(() => vi.fn());
const createDirectModelMock = vi.hoisted(() => vi.fn((id: string) => ({ id })));

vi.mock("ai", () => ({ generateObject: generateObjectMock }));
vi.mock("@/lib/builder/direct-model", () => ({ createDirectModel: createDirectModelMock }));
vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage: vi.fn() }));

const { improveSeoCopyWithLlm } = await import("./llm-copy");
const { auditProjectSeo } = await import("./audit");

const LAYOUT = `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hem",
  description: "Frisör.",
};

export default function RootLayout() { return null; }
`;

function project() {
  return [
    { name: "app/layout.tsx", content: LAYOUT },
    { name: "app/page.tsx", content: "<h1>Klippoteket i Uppsala</h1><p>Drop-in varje dag.</p>" },
  ];
}

function auditOf(files: ReturnType<typeof project>) {
  return auditProjectSeo(files.map((f) => ({ path: f.name, content: f.content })));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENAI_API_KEY = "sk-test";
});

describe("improveSeoCopyWithLlm", () => {
  it("rewrites title and description and reports both as llm-made", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        title: "Klippoteket — frisör i Uppsala med drop-in",
        description:
          "Boka klippning, färgning och styling hos Klippoteket i centrala Uppsala. Drop-in varje vardag.",
      },
      usage: {},
    });
    const files = project();
    const result = await improveSeoCopyWithLlm(files, auditOf(files), { modelId: "openai/x" });

    const layout = result.files.find((f) => f.name === "app/layout.tsx");
    expect(layout?.content).toContain("Klippoteket — frisör i Uppsala med drop-in");
    expect(result.improvements).toHaveLength(2);
    expect(result.improvements.every((i) => i.by === "llm")).toBe(true);
    expect(result.skippedReason).toBeNull();
  });

  it("builds the model through the provider-aware factory", async () => {
    // The manifest stores `openai/gpt-5.2`. `getOpenAIModel` would forward
    // that verbatim as a model NAME, so every call would fail and the pass
    // would silently degrade to no rewrite — invisible unless asserted here.
    generateObjectMock.mockResolvedValue({
      object: { title: "En tillräckligt lång sidtitel här", description: "En beskrivning som är lagom lång för att passera granskningens minimikrav på antal tecken." },
      usage: {},
    });
    const files = project();
    await improveSeoCopyWithLlm(files, auditOf(files), { modelId: "openai/gpt-5.2" });
    expect(createDirectModelMock).toHaveBeenCalledWith("openai/gpt-5.2");
  });

  it("does nothing when the audit found no copy problem", async () => {
    const good = [
      {
        name: "app/layout.tsx",
        content: LAYOUT.replace('"Hem"', '"Klippoteket — frisör i Uppsala med drop-in"').replace(
          '"Frisör."',
          '"Boka klippning, färgning och styling hos Klippoteket i centrala Uppsala. Drop-in varje vardag."',
        ),
      },
    ];
    const result = await improveSeoCopyWithLlm(good, auditOf(good), { modelId: "openai/x" });
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(result.improvements).toEqual([]);
  });

  it("skips without an API key instead of throwing", async () => {
    delete process.env.OPENAI_API_KEY;
    const files = project();
    const result = await improveSeoCopyWithLlm(files, auditOf(files), { modelId: "openai/x" });
    expect(result.skippedReason).toBe("no_api_key");
    expect(result.files).toBe(files);
  });

  it("keeps the deterministic result when the provider errors", async () => {
    generateObjectMock.mockRejectedValue(new Error("429"));
    const files = project();
    const result = await improveSeoCopyWithLlm(files, auditOf(files), { modelId: "openai/x" });
    expect(result.skippedReason).toBe("llm_error");
    expect(result.improvements).toEqual([]);
    expect(result.files[0].content).toBe(LAYOUT);
  });

  it("ignores an empty reply rather than writing blank metadata", async () => {
    generateObjectMock.mockResolvedValue({ object: { title: "  ", description: "" }, usage: {} });
    const files = project();
    const result = await improveSeoCopyWithLlm(files, auditOf(files), { modelId: "openai/x" });
    expect(result.skippedReason).toBe("empty_copy");
    expect(result.files[0].content).toBe(LAYOUT);
  });

  it("behåller den ena halvan när bara den andra kom tillbaka tom", async () => {
    // Schemat frågar alltid efter båda fälten, så ett svar kan vara helt rätt
    // för det granskningen flaggade och tomt för det andra. Att kasta hela
    // svaret då tappar en verklig fix.
    generateObjectMock.mockResolvedValue({
      object: { title: "Klippoteket — frisör i Uppsala med drop-in", description: "" },
      usage: {},
    });
    const files = project();
    const result = await improveSeoCopyWithLlm(files, auditOf(files), { modelId: "openai/x" });

    expect(result.skippedReason).toBeNull();
    expect(result.improvements).toHaveLength(1);
    expect(result.improvements[0].findingId).toContain("title");
    const layout = result.files.find((f) => f.name === "app/layout.tsx")!;
    expect(layout.content).toContain("Klippoteket — frisör i Uppsala med drop-in");
    // Den tomma halvan rör inte den befintliga beskrivningen.
    expect(layout.content).toContain('description: "Frisör."');
  });
});

describe("språkstyrning", () => {
  const longEnough = {
    title: "Klippoteket — frisör i Uppsala med drop-in",
    description:
      "Boka klippning, färgning och styling hos Klippoteket i centrala Uppsala. Drop-in varje vardag.",
  };

  function systemPrompt() {
    return String(generateObjectMock.mock.calls[0][0].system);
  }

  it("ber om sajtens eget språk när varumärket har en annan locale", async () => {
    // Regression: `<html lang>` följde brand.locale medan prompten var
    // hårdkodat svensk, så en engelsk sajt fick lang="en-US" och svensk titel.
    generateObjectMock.mockResolvedValue({ object: longEnough, usage: {} });
    const files = project();
    await improveSeoCopyWithLlm(files, auditOf(files), {
      modelId: "openai/x",
      brand: { locale: "en_US" },
    });
    expect(systemPrompt()).toContain("en-US");
    expect(systemPrompt()).not.toContain("för en svensk webbplats");
  });

  it("faller tillbaka på svenska när ingen locale är satt", async () => {
    generateObjectMock.mockResolvedValue({ object: longEnough, usage: {} });
    const files = project();
    await improveSeoCopyWithLlm(files, auditOf(files), { modelId: "openai/x" });
    expect(systemPrompt()).toContain("sv");
  });
});

describe("modellsvar som inte får bli syntaxfel", () => {
  it("skriver in en radbrytning som escape i stället för att bryta literalen", async () => {
    // Detta är buggen: en radbrytning i svaret splitsades in rått och
    // avslutade stränglitteralen, så layouten inte längre kompilerade.
    generateObjectMock.mockResolvedValue({
      object: {
        title: 'Klippoteket\n"Uppsala"',
        description:
          "Boka klippning, färgning och styling hos Klippoteket i centrala Uppsala. Drop-in varje vardag.",
      },
      usage: {},
    });
    const files = project();
    const result = await improveSeoCopyWithLlm(files, auditOf(files), { modelId: "openai/x" });
    const layout = result.files.find((f) => f.name === "app/layout.tsx")!;

    expect(layout.content).toContain('title: "Klippoteket\\n\\"Uppsala\\""');
    // Ingen ny fysisk rad: filen har exakt lika många rader som innan.
    expect(layout.content.split("\n")).toHaveLength(LAYOUT.split("\n").length);
  });
});
