/**
 * Tokenförbrukning per LLM-anrop — insamlingslagret.
 *
 * Problemet: bara own-engine:s codegen-ström loggade tokens
 * (`engine_generation_logs`/`generation_telemetry`). Deep Brief, verifier,
 * RepairGate, embeddings och klassificerarna kastade sin `usage`, så en körnings
 * verkliga kostnad gick inte att veta — bara gissa.
 *
 * Två regler styr designen:
 *
 * 1. **Aldrig blockerande.** `recordLlmUsage` är fire-and-forget och kastar
 *    aldrig. En trasig loggning får inte fälla en generering.
 * 2. **Inga nya parametrar genom hela kedjan.** Ägaren (`chatId`, `versionId`,
 *    `userId`, `runId`) sätts EN gång per request/körning med
 *    `runWithLlmUsageContext` och ärvs av alla nästlade anrop via
 *    `AsyncLocalStorage`. Callsites som redan har id:n kan skicka dem explicit —
 *    explicit vinner över kontexten.
 *
 * Tabellen ligger vid sidan av de befintliga codegen-tabellerna.
 * Backoffice Generation Cost läser den här som default.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { resolveConfiguredDbEnv } from "@/lib/db/env";
import type { CreateLlmUsageRecord } from "@/lib/db/services/llm-usage";

/** Pipeline-faser. Fritext i DB, men håll dig till listan så rollups blir jämförbara. */
export const LLM_PHASES = [
  "codegen",
  "planner",
  "brief",
  "verifier",
  "fixer",
  "embeddings",
  "classifier",
  "prompt_assist",
  "qa",
  "describe",
  "wizard",
  "audit",
  "analyze",
] as const;
export type LlmPhase = (typeof LLM_PHASES)[number];

export type LlmUsageContext = {
  runId?: string | null;
  chatId?: string | null;
  versionId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  modelTier?: string | null;
  /**
   * Unik nyckel för det yttersta scopet (en per request). Skrivs i `meta` och
   * används för att claima rader som skrevs innan `chat_id` fanns. Utan den
   * skulle två parallella init-strömmar som delar sessionscookie kunna stämpla
   * varandras brief-/embedding-rader.
   */
  claimKey?: string | null;
};

const storage = new AsyncLocalStorage<LlmUsageContext>();

/**
 * Kör `fn` med ägarkontext. Nästlade anrop ärver den och slår samman med sin
 * egen (yttre värden behålls när det inre inte anger något).
 */
export function runWithLlmUsageContext<T>(context: LlmUsageContext, fn: () => T): T {
  const parent = storage.getStore();
  const merged: LlmUsageContext = { ...(parent ?? {}), ...pruneUndefined(context) };
  // Yttersta scopet får en claim-nyckel; nästlade scope ärver samma.
  if (!merged.claimKey) merged.claimKey = randomUUID();
  return storage.run(merged, fn);
}

export function getLlmUsageContext(): LlmUsageContext {
  return storage.getStore() ?? {};
}

/**
 * Fyll i id:n som blir kända senare i samma scope (t.ex. `versionId`, som inte
 * finns förrän finalize skapat raden).
 *
 * Kontextobjektet muteras med avsikt: alternativet vore att tråda ids genom
 * varje mellanliggande funktion, vilket är precis vad kontexten finns för att
 * slippa. No-op utanför ett scope, så anrop utan `runWithLlmUsageContext` är
 * ofarliga.
 */
export function setLlmUsageContext(patch: LlmUsageContext): void {
  const store = storage.getStore();
  if (!store) return;
  Object.assign(store, pruneUndefined(patch));
}

function pruneUndefined(context: LlmUsageContext): LlmUsageContext {
  const out: LlmUsageContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined) out[key as keyof LlmUsageContext] = value as string | null;
  }
  return out;
}

// --------------------------------------------------------------------------- //
// Usage-normalisering
// --------------------------------------------------------------------------- //

export type NormalizedUsage = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
};

const EMPTY_USAGE: NormalizedUsage = {
  inputTokens: null,
  cachedInputTokens: null,
  cacheWriteTokens: null,
  outputTokens: null,
  reasoningTokens: null,
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNum(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = num(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function nested(source: unknown, key: string): Record<string, unknown> | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * Läs usage oavsett SDK-dialekt.
 *
 * Fyra format förekommer i repot: AI SDK 6 (`inputTokens`), äldre AI SDK
 * (`promptTokens`), OpenAI Chat Completions (`prompt_tokens` +
 * `prompt_tokens_details.cached_tokens`) och OpenAI Responses (`input_tokens`).
 * Embeddings rapporterar bara `tokens` — de räknas som input.
 */
export function normalizeUsage(raw: unknown): NormalizedUsage {
  if (!raw || typeof raw !== "object") return { ...EMPTY_USAGE };
  const usage = raw as Record<string, unknown>;
  const promptDetails = nested(usage, "prompt_tokens_details");
  const inputDetails = nested(usage, "input_tokens_details");
  const completionDetails = nested(usage, "completion_tokens_details");
  const outputDetails = nested(usage, "output_tokens_details");
  const aiSdkInputDetails = nested(usage, "inputTokenDetails");
  const aiSdkOutputDetails = nested(usage, "outputTokenDetails");
  const rawInputTokens = firstNum(usage.input_tokens, usage.prompt_tokens);
  const rawAnthropicCacheRead = firstNum(usage.cache_read_input_tokens);
  const rawAnthropicCacheWrite = firstNum(usage.cache_creation_input_tokens);
  const normalizedRawInputTokens =
    rawInputTokens !== null && (rawAnthropicCacheRead !== null || rawAnthropicCacheWrite !== null)
      ? rawInputTokens + (rawAnthropicCacheRead ?? 0) + (rawAnthropicCacheWrite ?? 0)
      : rawInputTokens;

  return {
    inputTokens: firstNum(
      usage.inputTokens,
      usage.promptTokens,
      normalizedRawInputTokens,
      // AI SDK `embed`/`embedMany`: { tokens }
      usage.tokens,
    ),
    cachedInputTokens: firstNum(
      aiSdkInputDetails?.cacheReadTokens,
      usage.cacheReadTokens,
      usage.cachedInputTokens,
      usage.cached_input_tokens,
      usage.cache_read_input_tokens,
      promptDetails?.cached_tokens,
      inputDetails?.cached_tokens,
    ),
    cacheWriteTokens: firstNum(
      aiSdkInputDetails?.cacheWriteTokens,
      usage.cacheWriteTokens,
      usage.cache_write_tokens,
      usage.cache_creation_input_tokens,
      promptDetails?.cache_write_tokens,
      inputDetails?.cache_write_tokens,
    ),
    outputTokens: firstNum(
      usage.outputTokens,
      usage.completionTokens,
      usage.output_tokens,
      usage.completion_tokens,
    ),
    reasoningTokens: firstNum(
      aiSdkOutputDetails?.reasoningTokens,
      usage.reasoningTokens,
      usage.reasoning_tokens,
      completionDetails?.reasoning_tokens,
      outputDetails?.reasoning_tokens,
    ),
  };
}

export function usageIsEmpty(usage: NormalizedUsage): boolean {
  return (
    usage.inputTokens === null &&
    usage.cachedInputTokens === null &&
    usage.cacheWriteTokens === null &&
    usage.outputTokens === null &&
    usage.reasoningTokens === null
  );
}

/**
 * Dela `openai/gpt-5.5` i provider + modell. Bara modell-id (own-engine-formen)
 * får provider härledd ur namnet, så rollups kan grupperas per leverantör.
 */
export function splitModelId(raw: string | null | undefined): {
  provider: string | null;
  model: string;
} {
  const value = String(raw ?? "").trim();
  if (!value) return { provider: null, model: "unknown" };
  const slash = value.indexOf("/");
  if (slash > 0) {
    const provider = value.slice(0, slash);
    return {
      // `anthropic-direct` är samma leverantör, annan transport.
      provider: provider === "anthropic-direct" ? "anthropic" : provider,
      model: value.slice(slash + 1),
    };
  }
  const lower = value.toLowerCase();
  if (lower.startsWith("claude")) return { provider: "anthropic", model: value };
  if (lower.startsWith("gpt") || lower.startsWith("o1") || lower.startsWith("text-embedding")) {
    return { provider: "openai", model: value };
  }
  return { provider: null, model: value };
}

// --------------------------------------------------------------------------- //
// Skrivning
// --------------------------------------------------------------------------- //

export type RecordLlmUsageInput = {
  phase: LlmPhase | string;
  model: string | null | undefined;
  /** Rå usage från SDK:et — normaliseras här. */
  usage?: unknown;
  workload?: string | null;
  durationMs?: number | null;
  ok?: boolean;
  errorCode?: string | null;
  meta?: Record<string, unknown> | null;
} & LlmUsageContext;

let warnedOnce = false;

/**
 * Billig grind före DB-lagret laddas.
 *
 * `@/lib/db/client` **kastar vid import** när ingen connection string finns, och
 * den här modulen importeras från hela pipelinen (inklusive tester och
 * kodvägar som inte rör databasen). Nyckellistan ägs av `@/lib/db/env`, som är
 * biverkningsfri — så vi frågar den först och importerar DB:n först när den
 * faktiskt är konfigurerad.
 */
function dbEnvPresent(): boolean {
  try {
    return Boolean(resolveConfiguredDbEnv(process.env)?.connectionString);
  } catch {
    return false;
  }
}

/**
 * Bygg raden som skulle skrivas. Exporterad för test — den innehåller all logik
 * utom själva insert:en.
 */
export function buildLlmUsageRecord(input: RecordLlmUsageInput): CreateLlmUsageRecord | null {
  const usage = normalizeUsage(input.usage);
  const failed = input.ok === false;
  // Ett lyckat anrop utan tokensiffror säger ingenting — då är en rad bara brus.
  // Ett MISSLYCKAT anrop är värt att spara även utan tokens (det förklarar en
  // lucka i förbrukningen).
  if (usageIsEmpty(usage) && !failed) return null;

  const context = getLlmUsageContext();
  const { provider, model } = splitModelId(input.model);
  return {
    phase: String(input.phase),
    model,
    provider,
    workload: input.workload ?? null,
    runId: input.runId ?? context.runId ?? context.claimKey ?? null,
    chatId: input.chatId ?? context.chatId ?? null,
    versionId: input.versionId ?? context.versionId ?? null,
    userId: input.userId ?? context.userId ?? null,
    sessionId: input.sessionId ?? context.sessionId ?? null,
    modelTier: input.modelTier ?? context.modelTier ?? null,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    durationMs: input.durationMs ?? null,
    ok: !failed,
    errorCode: input.errorCode ?? null,
    meta: context.claimKey
      ? { ...(input.meta ?? {}), claimKey: context.claimKey }
      : (input.meta ?? null),
  };
}

/**
 * Pågående skrivningar. Claim/stämpling är UPDATE:ar som matchar redan skrivna
 * rader — utan att vänta in dessa kan en UPDATE hinna före sin INSERT och lämna
 * raden permanent oattribuerad.
 */
const inFlightWrites = new Set<Promise<void>>();

/** Max antal rundor `flushPendingUsageWrites` väntar, så den inte kan snurra. */
const FLUSH_MAX_ROUNDS = 3;

/**
 * Håll invokeringen vid liv tills skrivningen landat.
 *
 * På serverless fryser funktionen så fort svaret/strömmen stängs, och en
 * odetacherad skrivning dör då tyst. Det är inte en teori: exakt det hände med
 * `preview_url` (chat 4314362f, 2026-07-02) och står dokumenterat i
 * `generation-stream-post-finalize.ts`. `after()` registrerar promisen hos
 * plattformen i stället, så raden hinner skrivas utan att fördröja svaret.
 *
 * Utanför en request-kontext (skript, tester) kastar `after()` — då räcker
 * fire-and-forget, för där finns ingen invokering som kan frysa.
 */
function keepWriteAlive(pending: Promise<void>): void {
  try {
    after(pending);
  } catch {
    void pending;
  }
}

/**
 * Skriv en förbrukningsrad. Fire-and-forget: returnerar direkt, kastar aldrig,
 * och sväljer alla fel med en varning. Anropas från LLM-callsites.
 */
export function recordLlmUsage(input: RecordLlmUsageInput): void {
  const pending = recordLlmUsageAsync(input);
  inFlightWrites.add(pending);
  void pending.finally(() => inFlightWrites.delete(pending));
  keepWriteAlive(pending);
}

/** Vänta in pågående skrivningar innan en UPDATE som ska matcha dem. */
export async function flushPendingUsageWrites(): Promise<void> {
  for (let round = 0; round < FLUSH_MAX_ROUNDS && inFlightWrites.size > 0; round += 1) {
    await Promise.allSettled([...inFlightWrites]);
  }
}

/** Samma sak men väntbar — för tester och för `after()`-kontexter. */
export async function recordLlmUsageAsync(input: RecordLlmUsageInput): Promise<void> {
  try {
    const record = buildLlmUsageRecord(input);
    if (!record || !dbEnvPresent()) return;
    const { dbConfigured } = await import("@/lib/db/client");
    if (!dbConfigured) return;
    const { createLlmUsageRecord } = await import("@/lib/db/services/llm-usage");
    const created = await createLlmUsageRecord(record);
    // En versionerad usage-rad kan även skrivas medan finalize fortfarande
    // pågår. Räkna därför bara om när finalize redan etablerat versionens
    // billing-rad; usage får aldrig själv skapa completion-markören eller
    // claima gratisgenereringen.
    if (created.version_id && created.chat_id) {
      try {
        const { settleExistingGenerationBillingIfPresent } =
          await import("@/lib/db/services/generation-billing");
        await settleExistingGenerationBillingIfPresent({
          chatId: created.chat_id,
          versionId: created.version_id,
          userId: created.user_id,
        });
      } catch (billingError) {
        console.error(
          "[generation-billing] Kunde inte räkna om sen usage:",
          billingError instanceof Error ? billingError.message : billingError,
        );
      }
    }
  } catch (error) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(
        "[llm-usage] Kunde inte spara tokenförbrukning (loggas en gång per process):",
        error instanceof Error ? error.message : error,
      );
    }
  }
}

/**
 * Slå upp ägar-id för loggningen utan att kunna fälla anroparen.
 *
 * Uppslaget går genom auth-lagret, och en route ska aldrig gå sönder för att
 * tokenloggningen inte kunde ta reda på vem användaren var. Sväljer även
 * synkrona fel (t.ex. ett testmock som saknar funktionen).
 */
export async function safeUsageOwnerId(
  lookup: () => Promise<string | null>,
): Promise<string | null> {
  try {
    return await lookup();
  } catch {
    return null;
  }
}

/**
 * Knyt sessionens tidigare anrop till chatten så snart den skapats.
 *
 * Init-flödet hinner köra brief och scaffold-embeddings innan chatten finns; utan
 * det här blir de raderna föräldralösa och faller ur både chat-export och
 * versionsstämplingen. Fire-and-forget som all annan loggning här.
 */
export function attachChatToPendingUsage(sessionId: string, chatId: string): void {
  const { claimKey } = getLlmUsageContext();
  keepWriteAlive(
    (async () => {
      try {
        if (!sessionId || !chatId || !dbEnvPresent()) return;
        await flushPendingUsageWrites();
        const { dbConfigured } = await import("@/lib/db/client");
        if (!dbConfigured) return;
        const { attachChatToUnassignedLlmUsage } = await import("@/lib/db/services/llm-usage");
        await attachChatToUnassignedLlmUsage(sessionId, chatId, { claimKey });
      } catch {
        // Claim är en förbättring, inte ett krav.
      }
    })(),
  );
}

/**
 * Knyt körningens tidigare anrop till versionen så snart den finns.
 *
 * Brief, scaffold-embeddings och klassificeraren hinner köra innan versionsraden
 * skapas. Utan det här hamnar de utanför körningens summa och kostnaden per
 * körning blir för låg. Fire-and-forget, som all annan loggning här.
 */
export async function attachVersionToPendingUsageAsync(
  chatId: string,
  versionId: string,
  claimKey?: string | null,
): Promise<void> {
  if (!chatId || !versionId || !dbEnvPresent()) return;
  await flushPendingUsageWrites();
  const { dbConfigured } = await import("@/lib/db/client");
  if (!dbConfigured) return;
  const { attachVersionToUnassignedLlmUsage } = await import("@/lib/db/services/llm-usage");
  await attachVersionToUnassignedLlmUsage(chatId, versionId, { claimKey });
}

export function attachVersionToPendingUsage(chatId: string, versionId: string): void {
  const { claimKey } = getLlmUsageContext();
  keepWriteAlive(
    attachVersionToPendingUsageAsync(chatId, versionId, claimKey).catch(() => {
      // Efterstämpling är en förbättring för observability-anropare. Den
      // väntbara varianten ovan används av billing när resultatet måste vara
      // komplett före slutdebitering.
    }),
  );
}

/** Nollställer engångsvarningen. Endast för tester. */
export function resetLlmUsageWarning(): void {
  warnedOnce = false;
}
