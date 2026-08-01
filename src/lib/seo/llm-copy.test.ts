/**
 * The copy pass, and — more importantly — every way it is allowed to fail.
 *
 * A publish must never be worse off for having tried to improve its metadata,
 * so each failure mode has to land on "files unchanged, reason recorded".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const generateObjectMock = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateObject: generateObjectMock }));
vi.mock("@/lib/gen/models", () => ({ getOpenAIModel: (id: string) => ({ id }) }));
vi.mock("@/lib/observability/llm-usage", () => ({ recordLlmUsage: vi.fn() }));

const { improveSeoCopyWithLlm, replaceMetadataString } = await import("./llm-copy");
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
});

describe("replaceMetadataString", () => {
  it("escapes quotes so generated copy cannot break the literal", () => {
    // Swedish marketing copy contains quotes often enough that an unescaped
    // replacement would eventually ship a layout that does not parse.
    const out = replaceMetadataString(LAYOUT, "title", 'Vi kallar det "drop-in"');
    expect(out).toContain('title: "Vi kallar det \\"drop-in\\""');
    expect(out).not.toContain('title: "Vi kallar det "drop-in""');
  });

  it("returns the source unchanged when the key is absent", () => {
    expect(replaceMetadataString("const x = 1;", "title", "Ny")).toBe("const x = 1;");
  });

  it("replaces only the first occurrence", () => {
    const source = 'const a = { title: "one" };\nconst b = { title: "two" };';
    const out = replaceMetadataString(source, "title", "ny");
    expect(out).toContain('title: "ny"');
    expect(out).toContain('title: "two"');
  });
});
