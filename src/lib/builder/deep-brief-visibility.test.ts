import { describe, expect, it } from "vitest";
import {
  attachBriefReasoningSummary,
  buildDeepBriefVisibility,
  extractGenerateObjectReasoning,
  formatDeepBriefBlueprint,
  mergeOpenAIBriefProviderOptions,
  omitBriefReasoningSummary,
  openaiBriefReasoningProviderOptions,
  readBriefReasoningSummary,
  readDeepBriefVisibilityFromMeta,
  supportsOpenAIReasoningSummary,
} from "./deep-brief-visibility";

describe("supportsOpenAIReasoningSummary", () => {
  it("accepts gpt-5 and o-series ids with or without provider prefix", () => {
    expect(supportsOpenAIReasoningSummary("gpt-5.6-sol")).toBe(true);
    expect(supportsOpenAIReasoningSummary("openai/gpt-5.6-sol")).toBe(true);
    expect(supportsOpenAIReasoningSummary("gpt-5.3-codex")).toBe(true);
    expect(supportsOpenAIReasoningSummary("o3")).toBe(true);
  });

  it("rejects Anthropic and non-reasoning OpenAI ids", () => {
    expect(supportsOpenAIReasoningSummary("anthropic/claude-opus-4.8")).toBe(false);
    expect(supportsOpenAIReasoningSummary("gpt-4.1")).toBe(false);
  });
});

describe("openai brief provider options", () => {
  it("requests detailed reasoning summaries", () => {
    expect(openaiBriefReasoningProviderOptions()).toEqual({
      openai: { reasoningSummary: "detailed" },
    });
  });

  it("keeps extra OpenAI options when merging", () => {
    expect(mergeOpenAIBriefProviderOptions({ openai: { strictJsonSchema: false } })).toEqual({
      openai: { reasoningSummary: "detailed", strictJsonSchema: false },
    });
  });
});

describe("extractGenerateObjectReasoning", () => {
  it("returns trimmed text and treats empty as absent", () => {
    expect(extractGenerateObjectReasoning({ reasoning: "  planera sajten  " })).toBe(
      "planera sajten",
    );
    expect(extractGenerateObjectReasoning({ reasoning: "   " })).toBeNull();
    expect(extractGenerateObjectReasoning({})).toBeNull();
  });
});

describe("brief reasoning field", () => {
  it("attaches, reads, and omits without dropping other keys", () => {
    const brief = { projectTitle: "Kafé", oneSentencePitch: "Fika i Malmö." };
    const withReasoning = attachBriefReasoningSummary(brief, "Tänker igenom sidorna.");
    expect(readBriefReasoningSummary(withReasoning)).toBe("Tänker igenom sidorna.");
    expect(omitBriefReasoningSummary(withReasoning)).toEqual(brief);
    expect(attachBriefReasoningSummary(brief, null)).toEqual(brief);
  });
});

describe("formatDeepBriefBlueprint", () => {
  it("renders pitch, pages, palette, and typography", () => {
    const text = formatDeepBriefBlueprint({
      oneSentencePitch: "Ett varmt kafé i Malmö.",
      pages: [
        {
          name: "Hem",
          path: "/",
          sections: [{ type: "hero", heading: "Välkommen" }, { type: "features" }],
        },
        { name: "Meny", path: "/meny", sections: [{ heading: "Kaffe" }] },
      ],
      visualDirection: {
        colorPalette: { primary: "#8B4513", background: "#FFF8F0", text: "#2B1B10" },
        typography: { headings: "Fraunces", body: "Source Sans 3" },
      },
    });

    expect(text).toContain("Pitch: Ett varmt kafé i Malmö.");
    expect(text).toContain("Sidor: Hem (/) — Välkommen, features; Meny (/meny) — Kaffe");
    expect(text).toContain("Palett: #8B4513 · #FFF8F0 · #2B1B10");
    expect(text).toContain("Typografi: rubriker Fraunces, brödtext Source Sans 3");
  });

  it("returns null when the brief has no visible key content", () => {
    expect(formatDeepBriefBlueprint({})).toBeNull();
    expect(formatDeepBriefBlueprint(null)).toBeNull();
  });
});

describe("buildDeepBriefVisibility", () => {
  it("prefers reasoning and falls back to the ritning", () => {
    expect(
      buildDeepBriefVisibility({
        oneSentencePitch: "Ett kafé.",
        reasoningSummary: "Jag planerar en enkelsida.",
      }),
    ).toEqual({
      reasoning: "Jag planerar en enkelsida.",
      blueprint: null,
    });

    expect(buildDeepBriefVisibility({ oneSentencePitch: "Ett kafé." })).toEqual({
      reasoning: null,
      blueprint: "Pitch: Ett kafé.",
    });

    expect(buildDeepBriefVisibility(null)).toEqual({ reasoning: null, blueprint: null });
  });
});

describe("readDeepBriefVisibilityFromMeta", () => {
  it("prefers reasoning over blueprint and ignores blanks", () => {
    expect(
      readDeepBriefVisibilityFromMeta({
        deepBriefReasoning: "  tänker  ",
        deepBriefBlueprint: "Pitch: x",
      }),
    ).toEqual({ reasoning: "tänker", blueprint: null });

    expect(
      readDeepBriefVisibilityFromMeta({
        deepBriefReasoning: "   ",
        deepBriefBlueprint: "Pitch: x",
      }),
    ).toEqual({ reasoning: null, blueprint: "Pitch: x" });
  });
});
