import { describe, expect, it } from "vitest";
import {
  chatFilterSkipReason,
  META_MAX_DEPTH,
  META_MAX_STRING,
  sanitizeLlmUsageMeta,
  truncateMetaStrings,
} from "./dump-logs-meta.mjs";

/** Bygger `{ a: { a: … { a: leaf } } }` med `depth` nivåer objekt runt `leaf`. */
function nest(leaf: unknown, depth: number): unknown {
  let current = leaf;
  for (let i = 0; i < depth; i += 1) current = { a: current };
  return current;
}

describe("truncateMetaStrings", () => {
  /**
   * R7:s nyttolast är hela poängen med att `meta` exporteras — den får inte
   * kapas.
   */
  it("lämnar R7:s missingByIntegration orörd", () => {
    const meta = {
      error: "tier3_env_not_ready",
      source: "finalize-design",
      missingByIntegration: [
        { key: "resend", name: "Resend", missing: ["RESEND_API_KEY", "EMAIL_FROM"] },
      ],
    };

    expect(truncateMetaStrings(meta)).toEqual(meta);
  });

  /**
   * `quality-gate:*-tooling` bär upp till 12 000 tecken rå build-output från ett
   * bygge som körts med användarens riktiga env-värden.
   */
  it("kapar build-output och säger hur mycket som togs bort", () => {
    const output = "x".repeat(12_000);

    const result = truncateMetaStrings({ failureKind: "tooling", output }) as {
      failureKind: string;
      output: string;
    };

    expect(result.failureKind).toBe("tooling");
    expect(result.output).toContain("[trunkerad, 12000 tecken]");
    expect(result.output.length).toBeLessThan(META_MAX_STRING + 60);
  });

  it("kapar även långa strängar nästlade i arrayer", () => {
    const result = truncateMetaStrings({ items: [{ log: "y".repeat(2_000) }] }) as {
      items: { log: string }[];
    };

    expect(result.items[0]?.log).toContain("[trunkerad, 2000 tecken]");
  });

  /**
   * Att lämna subträdet orört vid djupgränsen släppte igenom både okapade
   * strängar och obegränsat djup vidare till `JSON.stringify` i `dump-logs.mjs`
   * (Codex-fynd 2026-07-29).
   */
  it("ersätter för djupa subträd med en sentinel i stället för att släppa dem vidare", () => {
    const deep = nest({ log: "z".repeat(12_000) }, META_MAX_DEPTH);

    const serialized = JSON.stringify(truncateMetaStrings(deep));

    expect(serialized).not.toContain("z".repeat(META_MAX_STRING + 1));
    expect(serialized).toContain("trunkerat objekt");
    expect(serialized.length).toBeLessThan(500);
  });

  it("kapar strängar precis ovanför djupgränsen", () => {
    const atLimit = nest("w".repeat(2_000), META_MAX_DEPTH);

    expect(JSON.stringify(truncateMetaStrings(atLimit))).toContain("[trunkerad, 2000 tecken]");
  });

  it("släpper igenom null och primitiver oförändrade", () => {
    expect(truncateMetaStrings(null)).toBeNull();
    expect(truncateMetaStrings(undefined)).toBeUndefined();
    expect(truncateMetaStrings(42)).toBe(42);
    expect(truncateMetaStrings(true)).toBe(true);
  });
});

describe("sanitizeLlmUsageMeta", () => {
  it("behåller begärt och faktiskt värde utan att fylla luckor eller gissa", () => {
    expect(
      sanitizeLlmUsageMeta({
        requestedModelId: "openai/gpt-5.4",
        resolvedModelId: "openai/gpt-5.5",
        requestedReasoningEffort: "high",
        effectiveReasoningEffort: "medium",
        reasoningClampReason: "provider_cap",
      }),
    ).toEqual({
      requestedModelId: "openai/gpt-5.4",
      resolvedModelId: "openai/gpt-5.5",
      requestedReasoningEffort: "high",
      effectiveReasoningEffort: "medium",
      reasoningClampReason: "provider_cap",
    });

    expect(
      sanitizeLlmUsageMeta({
        resolvedModelId: "openai/gpt-5.5",
        effectiveReasoningEffort: "low",
      }),
    ).toEqual({
      resolvedModelId: "openai/gpt-5.5",
      effectiveReasoningEffort: "low",
    });

    expect(sanitizeLlmUsageMeta({ requestedReasoningEffort: "high" })).toEqual({
      requestedReasoningEffort: "high",
    });
    expect(sanitizeLlmUsageMeta({ requestedModelId: "null" })).toEqual({
      requestedModelId: "null",
    });
  });

  it("skiljer explicit null från saknad nyckel och returnerar null när inget tillåts", () => {
    expect(
      sanitizeLlmUsageMeta({
        requestedModelId: null,
        effectiveReasoningEffort: null,
        resolvedModelId: "openai/gpt-5.5",
      }),
    ).toEqual({
      requestedModelId: null,
      effectiveReasoningEffort: null,
      resolvedModelId: "openai/gpt-5.5",
    });

    const partial = sanitizeLlmUsageMeta({ resolvedModelId: "openai/gpt-5.5" });
    expect(partial).toEqual({ resolvedModelId: "openai/gpt-5.5" });
    expect(partial).not.toHaveProperty("requestedModelId");
    expect(partial).not.toHaveProperty("requestedReasoningEffort");
    expect(partial).not.toHaveProperty("effectiveReasoningEffort");
    expect(partial).not.toHaveProperty("reasoningClampReason");
    expect(partial).not.toHaveProperty("parentRunId");

    expect(sanitizeLlmUsageMeta(null)).toBeNull();
    expect(sanitizeLlmUsageMeta(undefined)).toBeNull();
    expect(sanitizeLlmUsageMeta({})).toBeNull();
    expect(sanitizeLlmUsageMeta([])).toBeNull();
    expect(sanitizeLlmUsageMeta('{"resolvedModelId":"openai/gpt-5.5"}')).toBeNull();
    expect(sanitizeLlmUsageMeta({ claimKey: "abc", runId: "run-1" })).toBeNull();
  });

  it("släpper nästlade värden, credentials och råa fält", () => {
    expect(
      sanitizeLlmUsageMeta({
        requestedModelId: { id: "openai/gpt-5.5" },
        resolvedModelId: ["openai/gpt-5.5"],
        requestedReasoningEffort: "sk-live-secret",
        effectiveReasoningEffort: "prefix sk_live suffix",
        reasoningClampReason: "Bearer eyJhbGciOi",
        parentRunId: { runId: "parent" },
        prompt: "rå prompt",
        reasoning: "chain of thought",
        errorMessage: "provider 401",
        error: "stack",
        authorization: "Bearer abc",
        cookie: "session=1",
        source: "raw file",
        claimKey: "uuid",
      }),
    ).toBeNull();

    expect(
      sanitizeLlmUsageMeta({
        requestedModelId: "openai/gpt-5.4",
        resolvedModelId: "SK-proj-abcdef",
        requestedReasoningEffort: null,
        effectiveReasoningEffort: { effort: "high" },
        reasoningClampReason: "provider_cap",
        prompt: "släpp",
        parentRunId: "run_parent_1",
      }),
    ).toEqual({
      requestedModelId: "openai/gpt-5.4",
      requestedReasoningEffort: null,
      reasoningClampReason: "provider_cap",
      parentRunId: "run_parent_1",
    });

    expect(
      sanitizeLlmUsageMeta({
        requestedModelId: 5,
        resolvedModelId: true,
        requestedReasoningEffort: 0,
      }),
    ).toBeNull();
  });

  it("behåller parentRunId bara när nyckeln finns", () => {
    const without = sanitizeLlmUsageMeta({ resolvedModelId: "openai/gpt-5.5" });
    expect(without).toEqual({ resolvedModelId: "openai/gpt-5.5" });
    expect(without).not.toHaveProperty("parentRunId");

    expect(
      sanitizeLlmUsageMeta({
        resolvedModelId: "openai/gpt-5.5",
        parentRunId: "parent-run",
      }),
    ).toEqual({
      resolvedModelId: "openai/gpt-5.5",
      parentRunId: "parent-run",
    });

    expect(
      sanitizeLlmUsageMeta({
        requestedModelId: "openai/gpt-5.4",
        parentRunId: null,
      }),
    ).toEqual({
      requestedModelId: "openai/gpt-5.4",
      parentRunId: null,
    });
  });

  it("kapar långa säkra strängar och muterar inte indata", () => {
    const long = `m${"o".repeat(META_MAX_STRING + 20)}`;
    const capped = sanitizeLlmUsageMeta({ resolvedModelId: long }) as {
      resolvedModelId: string;
    };
    expect(capped.resolvedModelId).toBe(long.slice(0, META_MAX_STRING));
    expect(capped.resolvedModelId).toHaveLength(META_MAX_STRING);

    expect(
      sanitizeLlmUsageMeta({
        reasoningClampReason: `${"a".repeat(META_MAX_STRING)} sk-secret`,
      }),
    ).toBeNull();

    const meta = {
      requestedModelId: "openai/gpt-5.4",
      resolvedModelId: { id: "openai/gpt-5.5" },
      prompt: "rå prompt",
      items: ["a"],
    };
    const before = JSON.stringify(meta);
    const frozen = Object.freeze({
      requestedModelId: meta.requestedModelId,
      resolvedModelId: Object.freeze(meta.resolvedModelId),
      prompt: meta.prompt,
      items: Object.freeze(meta.items),
    });
    expect(sanitizeLlmUsageMeta(frozen)).toEqual({ requestedModelId: "openai/gpt-5.4" });
    expect(JSON.stringify(meta)).toBe(before);
    expect(sanitizeLlmUsageMeta(meta)).not.toBe(meta);
  });
});

describe("chatFilterSkipReason", () => {
  it("hoppar över kinds utan chatt-kolumn när chat-id är satt", () => {
    // drain/openai har chatColumn null — tidigare gav de ofiltrerade rader.
    expect(chatFilterSkipReason({ chatColumn: null }, "chat-1")).toMatch(/ej chattfiltrerbar/);
    expect(chatFilterSkipReason({}, "chat-1")).toMatch(/ej chattfiltrerbar/);
  });

  it("kör kinden när den kan filtreras eller när inget chat-id finns", () => {
    expect(chatFilterSkipReason({ chatColumn: "chat_id" }, "chat-1")).toBeNull();
    expect(chatFilterSkipReason({ chatColumn: null }, null)).toBeNull();
    expect(chatFilterSkipReason({ chatColumn: null }, "")).toBeNull();
  });
});
