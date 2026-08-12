import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const after = vi.hoisted(() => vi.fn());
const createLlmUsageRecord = vi.hoisted(() => vi.fn());
const attachVersionToUnassignedLlmUsage = vi.hoisted(() => vi.fn());
const attachChatToUnassignedLlmUsage = vi.hoisted(() => vi.fn());
const establishGenerationBilling = vi.hoisted(() => vi.fn());
const settleExistingGenerationBillingIfPresent = vi.hoisted(() => vi.fn());
const dbState = vi.hoisted(() => ({ configured: true }));

vi.mock("next/server", () => ({ after }));

vi.mock("@/lib/db/client", () => ({
  get dbConfigured() {
    return dbState.configured;
  },
}));

vi.mock("@/lib/db/services/llm-usage", () => ({
  createLlmUsageRecord,
  attachVersionToUnassignedLlmUsage,
  attachChatToUnassignedLlmUsage,
}));

vi.mock("@/lib/db/services/generation-billing", () => ({
  establishGenerationBilling,
  settleExistingGenerationBillingIfPresent,
}));

const {
  attachChatToPendingUsage,
  flushPendingUsageWrites,
  recordLlmUsage,
  attachVersionToPendingUsage,
  buildLlmUsageRecord,
  getLlmUsageContext,
  normalizeUsage,
  recordLlmUsageAsync,
  resetLlmUsageWarning,
  runWithLlmUsageContext,
  setLlmUsageContext,
  splitModelId,
  usageIsEmpty,
} = await import("./llm-usage");

async function settleRegisteredAfterTasks(): Promise<void> {
  const tasks = after.mock.calls
    .map(([task]) => task)
    .filter((task): task is Promise<unknown> => task instanceof Promise);
  await Promise.allSettled(tasks);
}

describe("normalizeUsage", () => {
  it("läser AI SDK 6-formatet", () => {
    expect(
      normalizeUsage({
        inputTokens: 100,
        outputTokens: 20,
        cachedInputTokens: 40,
        reasoningTokens: 5,
      }),
    ).toEqual({
      inputTokens: 100,
      cachedInputTokens: 40,
      cacheWriteTokens: null,
      outputTokens: 20,
      reasoningTokens: 5,
    });
  });

  it("läser äldre AI SDK-namn", () => {
    expect(normalizeUsage({ promptTokens: 7, completionTokens: 3 })).toMatchObject({
      inputTokens: 7,
      outputTokens: 3,
    });
  });

  it("läser OpenAI Chat Completions inkl. cachade och reasoning-tokens", () => {
    expect(
      normalizeUsage({
        prompt_tokens: 900,
        completion_tokens: 120,
        prompt_tokens_details: { cached_tokens: 512 },
        completion_tokens_details: { reasoning_tokens: 64 },
      }),
    ).toEqual({
      inputTokens: 900,
      cachedInputTokens: 512,
      cacheWriteTokens: null,
      outputTokens: 120,
      reasoningTokens: 64,
    });
  });

  it("läser OpenAI Responses-formatet", () => {
    expect(
      normalizeUsage({
        input_tokens: 50,
        output_tokens: 10,
        input_tokens_details: { cached_tokens: 8 },
      }),
    ).toMatchObject({ inputTokens: 50, outputTokens: 10, cachedInputTokens: 8 });
  });

  it("läser AI SDK:s separata cache read/write-detaljer", () => {
    expect(
      normalizeUsage({
        inputTokens: 100,
        inputTokenDetails: { cacheReadTokens: 40, cacheWriteTokens: 10 },
        outputTokens: 20,
        outputTokenDetails: { reasoningTokens: 7 },
      }),
    ).toEqual({
      inputTokens: 100,
      cachedInputTokens: 40,
      cacheWriteTokens: 10,
      outputTokens: 20,
      reasoningTokens: 7,
    });
  });

  it("normaliserar rå Anthropic-input till total inklusive cache", () => {
    expect(
      normalizeUsage({
        input_tokens: 70,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 10,
        output_tokens: 5,
      }),
    ).toMatchObject({
      inputTokens: 100,
      cachedInputTokens: 20,
      cacheWriteTokens: 10,
      outputTokens: 5,
    });
  });

  it("räknar embeddings-tokens som input", () => {
    expect(normalizeUsage({ tokens: 33 })).toMatchObject({ inputTokens: 33, outputTokens: null });
  });

  it("tål saknad, tom och felaktig usage", () => {
    for (const value of [undefined, null, "usage", 42, {}, { inputTokens: "nej" }]) {
      const usage = normalizeUsage(value);
      expect(usageIsEmpty(usage)).toBe(true);
    }
  });
});

describe("splitModelId", () => {
  it("delar provider-prefixade id:n", () => {
    expect(splitModelId("openai/gpt-5.5")).toEqual({ provider: "openai", model: "gpt-5.5" });
    // anthropic-direct är samma leverantör, annan transport.
    expect(splitModelId("anthropic-direct/claude-opus-4-8")).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-8",
    });
  });

  it("härleder provider ur bare model-id", () => {
    expect(splitModelId("gpt-5.3-codex").provider).toBe("openai");
    expect(splitModelId("claude-opus-4.8").provider).toBe("anthropic");
    expect(splitModelId("text-embedding-3-small").provider).toBe("openai");
    expect(splitModelId("nagon-annan-modell").provider).toBeNull();
  });

  it("faller tillbaka på unknown för tomt värde", () => {
    expect(splitModelId(null)).toEqual({ provider: null, model: "unknown" });
    expect(splitModelId("   ")).toEqual({ provider: null, model: "unknown" });
  });
});

describe("kontext", () => {
  it("ärvs av nästlade scope och kan fyllas i efterhand", () => {
    runWithLlmUsageContext({ sessionId: "sess_1", userId: "user_1" }, () => {
      expect(getLlmUsageContext()).toMatchObject({ sessionId: "sess_1", userId: "user_1" });
      setLlmUsageContext({ chatId: "chat_1" });
      runWithLlmUsageContext({ versionId: "ver_1" }, () => {
        // Inre scope ser både yttre värden och det som fyllts i senare.
        expect(getLlmUsageContext()).toMatchObject({
          sessionId: "sess_1",
          userId: "user_1",
          chatId: "chat_1",
          versionId: "ver_1",
        });
      });
      // Inre scope läcker inte ut.
      expect(getLlmUsageContext().versionId).toBeUndefined();
    });
  });

  it("är tom utanför ett scope och setLlmUsageContext blir en no-op", () => {
    expect(getLlmUsageContext()).toEqual({});
    expect(() => setLlmUsageContext({ chatId: "chat_x" })).not.toThrow();
    expect(getLlmUsageContext()).toEqual({});
  });
});

describe("buildLlmUsageRecord", () => {
  it("kombinerar kontext, modellsplit och usage", () => {
    runWithLlmUsageContext(
      { chatId: "chat_1", versionId: "ver_1", userId: "user_1", runId: "root", modelTier: "max" },
      () => {
        const record = buildLlmUsageRecord({
          phase: "verifier",
          model: "openai/gpt-5.4",
          usage: { inputTokens: 10, outputTokens: 2 },
          durationMs: 1234,
        });
        expect(record).toMatchObject({
          phase: "verifier",
          provider: "openai",
          model: "gpt-5.4",
          chatId: "chat_1",
          versionId: "ver_1",
          userId: "user_1",
          runId: "root",
          modelTier: "max",
          inputTokens: 10,
          outputTokens: 2,
          durationMs: 1234,
          ok: true,
        });
      },
    );
  });

  it("skriver scopets claim-nyckel i meta", () => {
    runWithLlmUsageContext({ sessionId: "sess_1" }, () => {
      const key = getLlmUsageContext().claimKey;
      const record = buildLlmUsageRecord({
        phase: "brief",
        model: "gpt-5.5",
        usage: { inputTokens: 1 },
        meta: { schema: "full" },
      });
      expect(record?.meta).toEqual({ schema: "full", claimKey: key });
    });
  });

  it("låter explicita fält vinna över kontexten", () => {
    runWithLlmUsageContext({ chatId: "chat_ctx" }, () => {
      const record = buildLlmUsageRecord({
        phase: "brief",
        model: "gpt-5.5",
        usage: { inputTokens: 1 },
        chatId: "chat_explicit",
      });
      expect(record?.chatId).toBe("chat_explicit");
    });
  });

  it("hoppar över lyckade anrop utan tokensiffror", () => {
    // En rad utan tokens säger ingenting — då är den bara brus.
    expect(buildLlmUsageRecord({ phase: "codegen", model: "gpt-5.5", usage: null })).toBeNull();
  });

  it("sparar misslyckade anrop även utan tokensiffror", () => {
    // Ett fel förklarar en lucka i förbrukningen och är värt en rad.
    const record = buildLlmUsageRecord({
      phase: "fixer",
      model: "gpt-5.5",
      usage: null,
      ok: false,
      errorCode: "insufficient_quota",
    });
    expect(record).toMatchObject({ ok: false, errorCode: "insufficient_quota" });
  });
});

describe("recordLlmUsageAsync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // DB-lagret laddas lazy och bara när env pekar på en databas.
    vi.stubEnv("POSTGRES_URL", "postgres://user:pass@localhost:5432/test");
    dbState.configured = true;
    establishGenerationBilling.mockResolvedValue(undefined);
    settleExistingGenerationBillingIfPresent.mockResolvedValue(null);
    resetLlmUsageWarning();
  });

  afterEach(async () => {
    await settleRegisteredAfterTasks();
    vi.unstubAllEnvs();
  });

  it("laddar inte DB-lagret när ingen databas är konfigurerad i env", async () => {
    vi.stubEnv("POSTGRES_URL", "");
    vi.stubEnv("POSTGRES_URL_NON_POOLING", "");
    vi.stubEnv("STORAGE_POSTGRES_URL", "");
    vi.stubEnv("STORAGE_POSTGRES_URL_NON_POOLING", "");
    vi.stubEnv("DATABASE_URL", "");
    await recordLlmUsageAsync({ phase: "codegen", model: "gpt-5.5", usage: { inputTokens: 1 } });
    expect(createLlmUsageRecord).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skriver raden när DB finns", async () => {
    createLlmUsageRecord.mockResolvedValue({});
    await recordLlmUsageAsync({
      phase: "embeddings",
      model: "text-embedding-3-small",
      usage: { tokens: 12 },
      chatId: "chat_1",
    });
    expect(createLlmUsageRecord).toHaveBeenCalledTimes(1);
    expect(createLlmUsageRecord.mock.calls[0][0]).toMatchObject({
      phase: "embeddings",
      provider: "openai",
      inputTokens: 12,
    });
  });

  it("settlar inte versionerad usage innan finalize har etablerat billing-markören", async () => {
    createLlmUsageRecord.mockResolvedValue({
      version_id: "version_pending",
      chat_id: "chat_1",
      user_id: "user_1",
    });
    settleExistingGenerationBillingIfPresent.mockResolvedValue(null);

    await recordLlmUsageAsync({
      phase: "verifier",
      model: "gpt-5.5",
      usage: { inputTokens: 10 },
      versionId: "version_pending",
      chatId: "chat_1",
    });

    expect(settleExistingGenerationBillingIfPresent).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "version_pending",
      userId: "user_1",
    });
    expect(establishGenerationBilling).not.toHaveBeenCalled();
  });

  it("räknar om sen usage efter att finalize har etablerat billing-markören", async () => {
    createLlmUsageRecord.mockResolvedValue({
      version_id: "version_complete",
      chat_id: "chat_1",
      user_id: "user_1",
    });
    settleExistingGenerationBillingIfPresent.mockResolvedValue({ status: "charged" });

    await recordLlmUsageAsync({
      phase: "verifier",
      model: "gpt-5.5",
      usage: { inputTokens: 10 },
      versionId: "version_complete",
      chatId: "chat_1",
    });

    expect(settleExistingGenerationBillingIfPresent).toHaveBeenCalledWith({
      chatId: "chat_1",
      versionId: "version_complete",
      userId: "user_1",
    });
  });

  it("gör ingenting utan DB", async () => {
    dbState.configured = false;
    await recordLlmUsageAsync({ phase: "codegen", model: "gpt-5.5", usage: { inputTokens: 1 } });
    expect(createLlmUsageRecord).not.toHaveBeenCalled();
  });

  it("sväljer DB-fel och varnar bara en gång", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createLlmUsageRecord.mockRejectedValue(new Error("relation llm_usage does not exist"));
    await expect(
      recordLlmUsageAsync({ phase: "codegen", model: "gpt-5.5", usage: { inputTokens: 1 } }),
    ).resolves.toBeUndefined();
    await recordLlmUsageAsync({ phase: "codegen", model: "gpt-5.5", usage: { inputTokens: 1 } });
    expect(createLlmUsageRecord).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("kastar aldrig även om usage är skräp", async () => {
    createLlmUsageRecord.mockResolvedValue({});
    await expect(
      recordLlmUsageAsync({ phase: "codegen", model: null, usage: Symbol("nej") }),
    ).resolves.toBeUndefined();
  });
});

describe("attachVersionToPendingUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("POSTGRES_URL", "postgres://user:pass@localhost:5432/test");
    dbState.configured = true;
  });

  afterEach(async () => {
    await settleRegisteredAfterTasks();
    vi.unstubAllEnvs();
  });

  it("efterstämplar chattens rader utan versionsid", async () => {
    attachVersionToUnassignedLlmUsage.mockResolvedValue(3);
    attachVersionToPendingUsage("chat_1", "ver_1");
    await vi.waitFor(() =>
      expect(attachVersionToUnassignedLlmUsage).toHaveBeenCalledWith("chat_1", "ver_1", {
        claimKey: undefined,
      }),
    );
  });

  it("gör ingenting när databasen inte är konfigurerad", async () => {
    dbState.configured = false;
    attachVersionToPendingUsage("chat_1", "ver_1");
    await settleRegisteredAfterTasks();
    expect(attachVersionToUnassignedLlmUsage).not.toHaveBeenCalled();
  });

  it("gör ingenting när chat eller version saknas", async () => {
    attachVersionToPendingUsage("", "ver_1");
    attachVersionToPendingUsage("chat_1", "");
    await settleRegisteredAfterTasks();
    expect(attachVersionToUnassignedLlmUsage).not.toHaveBeenCalled();
  });

  it("sväljer fel utan att kasta", async () => {
    attachVersionToUnassignedLlmUsage.mockRejectedValue(new Error("db nere"));
    expect(() => attachVersionToPendingUsage("chat_1", "ver_1")).not.toThrow();
    await vi.waitFor(() => expect(attachVersionToUnassignedLlmUsage).toHaveBeenCalled());
  });
});

describe("attachChatToPendingUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("POSTGRES_URL", "postgres://user:pass@localhost:5432/test");
    dbState.configured = true;
  });

  afterEach(async () => {
    await settleRegisteredAfterTasks();
    vi.unstubAllEnvs();
  });

  it("claimar sessionens rader som skrevs innan chatten fanns", async () => {
    // Brief och scaffold-embeddings körs före createChat på init.
    attachChatToUnassignedLlmUsage.mockResolvedValue(2);
    attachChatToPendingUsage("sess_1", "chat_1");
    await vi.waitFor(() =>
      expect(attachChatToUnassignedLlmUsage).toHaveBeenCalledWith("sess_1", "chat_1", {
        claimKey: undefined,
      }),
    );
  });

  it("skickar med scopets claim-nyckel så parallella strömmar inte krockar", async () => {
    attachChatToUnassignedLlmUsage.mockResolvedValue(1);
    const keys: Array<string | null | undefined> = [];
    for (const chatId of ["chat_a", "chat_b"]) {
      runWithLlmUsageContext({ sessionId: "sess_shared" }, () => {
        keys.push(getLlmUsageContext().claimKey);
        attachChatToPendingUsage("sess_shared", chatId);
      });
    }
    await settleRegisteredAfterTasks();
    expect(attachChatToUnassignedLlmUsage).toHaveBeenCalledTimes(2);
    // Två scope = två nycklar, så den ena claimen kan inte ta den andras rader.
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    expect(keys[0]).not.toBe(keys[1]);
    const passedKeys = attachChatToUnassignedLlmUsage.mock.calls.map(
      (call) => (call[2] as { claimKey?: string }).claimKey,
    );
    expect(passedKeys).toEqual(keys);
  });

  it("gör ingenting utan session eller chat", async () => {
    attachChatToPendingUsage("", "chat_1");
    attachChatToPendingUsage("sess_1", "");
    await settleRegisteredAfterTasks();
    expect(attachChatToUnassignedLlmUsage).not.toHaveBeenCalled();
  });

  it("sväljer fel utan att kasta", async () => {
    attachChatToUnassignedLlmUsage.mockRejectedValue(new Error("db nere"));
    expect(() => attachChatToPendingUsage("sess_1", "chat_1")).not.toThrow();
    await vi.waitFor(() => expect(attachChatToUnassignedLlmUsage).toHaveBeenCalled());
  });
});

describe("flushPendingUsageWrites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("POSTGRES_URL", "postgres://user:pass@localhost:5432/test");
    dbState.configured = true;
  });

  afterEach(async () => {
    await settleRegisteredAfterTasks();
    vi.unstubAllEnvs();
  });

  it("väntar in pågående skrivningar", async () => {
    // Utan detta kan en claim-UPDATE hinna före sin INSERT och lämna raden
    // permanent oattribuerad.
    const insertGate: { resolve: (() => void) | null } = { resolve: null };
    createLlmUsageRecord.mockImplementation(
      () => new Promise<void>((resolve) => (insertGate.resolve = () => resolve())),
    );
    recordLlmUsage({ phase: "brief", model: "gpt-5.5", usage: { inputTokens: 5 } });
    await vi.waitFor(() => expect(createLlmUsageRecord).toHaveBeenCalled());

    let flushed = false;
    const flush = flushPendingUsageWrites().then(() => {
      flushed = true;
    });
    expect(flushed).toBe(false);

    insertGate.resolve?.();
    await flush;
    expect(flushed).toBe(true);
  });

  it("returnerar direkt när inget är på gång", async () => {
    await expect(flushPendingUsageWrites()).resolves.toBeUndefined();
  });

  it("claimen väntar in skrivningen innan UPDATE", async () => {
    const order: string[] = [];
    const insertGate: { resolve: (() => void) | null } = { resolve: null };
    createLlmUsageRecord.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          insertGate.resolve = () => {
            order.push("insert");
            resolve();
          };
        }),
    );
    attachChatToUnassignedLlmUsage.mockImplementation(async () => {
      order.push("claim");
      return 1;
    });

    recordLlmUsage({ phase: "brief", model: "gpt-5.5", usage: { inputTokens: 5 } });
    await vi.waitFor(() => expect(createLlmUsageRecord).toHaveBeenCalled());
    attachChatToPendingUsage("sess_1", "chat_1");
    expect(attachChatToUnassignedLlmUsage).not.toHaveBeenCalled();

    insertGate.resolve?.();
    await settleRegisteredAfterTasks();
    expect(order).toEqual(["insert", "claim"]);
  });
});

describe("skrivningens livstid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("POSTGRES_URL", "postgres://user:pass@localhost:5432/test");
    dbState.configured = true;
    createLlmUsageRecord.mockResolvedValue({});
  });

  afterEach(async () => {
    await settleRegisteredAfterTasks();
    vi.unstubAllEnvs();
  });

  it("registrerar skrivningen med after() så serverless inte fryser bort den", async () => {
    // Precedens: en odetacherad skrivning dog tyst när strömmen stängdes
    // (preview_url, chat 4314362f 2026-07-02). after() håller invokeringen vid liv.
    recordLlmUsage({ phase: "codegen", model: "gpt-5.5", usage: { inputTokens: 1 } });
    expect(after).toHaveBeenCalledTimes(1);
    await expect(after.mock.calls[0][0]).resolves.toBeUndefined();
  });

  it("registrerar även claim och versionsstämpling", async () => {
    attachChatToPendingUsage("sess_1", "chat_1");
    attachVersionToPendingUsage("chat_1", "ver_1");
    expect(after).toHaveBeenCalledTimes(2);
  });

  it("faller tillbaka på fire-and-forget utanför en request-kontext", async () => {
    // after() kastar i skript och tester utan request — det får inte fälla loggningen.
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    expect(() =>
      recordLlmUsage({ phase: "codegen", model: "gpt-5.5", usage: { inputTokens: 1 } }),
    ).not.toThrow();
    await vi.waitFor(() => expect(createLlmUsageRecord).toHaveBeenCalled());
  });
});
