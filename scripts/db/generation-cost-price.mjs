/**
 * Tokenvolym → USD med samma regler som `src/lib/billing/model-cost.ts`.
 *
 * `inputTokens` är totalt (inkl. cache). Cache read/write dras av innan
 * ordinarie input prissätts. Reasoning räknas redan i output och läggs inte på.
 */
export function normalizeModelId(raw) {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  const slash = value.lastIndexOf("/");
  return slash >= 0 ? value.slice(slash + 1) : value;
}

function tokens(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export function usd(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

export function resolvePriceModel(pricing, rawModel) {
  const models = pricing?.models ?? {};
  const model = normalizeModelId(rawModel);
  if (!model) return null;
  const candidates = Object.entries(models).flatMap(([key, entry]) => {
    const matchList = Array.isArray(entry?.match) && entry.match.length ? entry.match : [key];
    return matchList.map((match) => ({ key, entry, match: String(match).toLowerCase() }));
  });
  candidates.sort((a, b) => b.match.length - a.match.length);
  const found = candidates.find(({ match }) => model === match || model.startsWith(`${match}-20`));
  return found ? { key: found.key, entry: found.entry } : null;
}

export function ratesForModel(pricing, rawModel, tier = "standard") {
  const resolved = resolvePriceModel(pricing, rawModel);
  if (!resolved) return null;
  const tiers = resolved.entry.tiers ?? {};
  const rates = tiers[tier] ?? tiers.standard ?? null;
  if (!rates) return null;
  return { key: resolved.key, entry: resolved.entry, rates };
}

/**
 * @param {object} row
 * @param {string} [row.model]
 * @param {number} [row.inputTokens]
 * @param {number} [row.cachedInputTokens]
 * @param {number} [row.cacheWriteTokens]
 * @param {number} [row.outputTokens]
 * @param {number} [row.rows]
 */
export function priceUsageRow(pricing, row, tier = "standard", options = {}) {
  const applyLongContext = options.applyLongContext !== false;
  const p = ratesForModel(pricing, row.model, tier);
  const cachedInputTokens = tokens(row.cachedInputTokens);
  const cacheWriteTokens = tokens(row.cacheWriteTokens);
  const suppliedInputTokens = tokens(row.inputTokens);
  const inputTotal = Math.max(suppliedInputTokens, cachedInputTokens + cacheWriteTokens);
  const uncachedInputTokens = Math.max(0, inputTotal - cachedInputTokens - cacheWriteTokens);
  const outputTokens = tokens(row.outputTokens);
  const reasoningTokens = tokens(row.reasoningTokens);
  const rows = tokens(row.rows);

  if (!p) {
    return {
      model: row.model,
      phase: row.phase ?? null,
      matched: null,
      priced: false,
      rows,
      promptTokens: inputTotal,
      uncachedInputTokens,
      cachedInputTokens,
      cacheWriteTokens,
      completionTokens: outputTokens,
      reasoningTokens,
      inputUsd: 0,
      cachedUsd: 0,
      cacheWriteUsd: 0,
      outputUsd: 0,
      totalUsd: 0,
    };
  }

  const threshold = p.entry.contextThreshold;
  const longContext = Boolean(
    applyLongContext && threshold && inputTotal > Number(threshold.inputTokens || 0),
  );
  const inputMultiplier = longContext ? Number(threshold?.aboveMultiplier?.input ?? 1) : 1;
  const outputMultiplier = longContext ? Number(threshold?.aboveMultiplier?.output ?? 1) : 1;
  const inputRate = (Number(p.rates.input) || 0) * inputMultiplier;
  const cachedInputRate = (Number(p.rates.cachedInput ?? p.rates.input) || 0) * inputMultiplier;
  const cacheWriteInputRate =
    (Number(p.rates.cacheWriteInput ?? (p.rates.input == null ? 0 : Number(p.rates.input) * 1.25)) ||
      0) * inputMultiplier;
  const outputRate = (Number(p.rates.output) || 0) * outputMultiplier;

  const inputUsd = usd((uncachedInputTokens / 1e6) * inputRate);
  const cachedUsd = usd((cachedInputTokens / 1e6) * cachedInputRate);
  const cacheWriteUsd = usd((cacheWriteTokens / 1e6) * cacheWriteInputRate);
  const outputUsd = usd((outputTokens / 1e6) * outputRate);

  return {
    model: row.model,
    phase: row.phase ?? null,
    matched: p.key,
    label: p.entry.label ?? p.key,
    estimated: Boolean(p.entry.estimated),
    priced: true,
    longContext,
    rows,
    promptTokens: inputTotal,
    uncachedInputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    completionTokens: outputTokens,
    reasoningTokens,
    inputUsd,
    cachedUsd,
    cacheWriteUsd,
    outputUsd,
    totalUsd: usd(inputUsd + cachedUsd + cacheWriteUsd + outputUsd),
  };
}

/**
 * Kostnadsgrund för en period.
 *
 * `cost_microusd` skrivs per anrop och bär long-context-påslaget. Token-priset
 * räknas om från SUMMERADE tokens och kan därför aldrig veta om ett enskilt
 * anrop gick över tröskeln — det underskattar systematiskt så snart någon
 * körning gjorde det. Ledgern är alltså sanningen när den täcker perioden;
 * token-priset finns kvar som uppskattning så FX och `pricing.json` går att
 * justera i efterhand.
 *
 * **Ingen blandning.** Antingen täcker ledgern varje anrop — då är den totalen —
 * eller så är hela perioden en token-uppskattning med ledgersumman redovisad
 * bredvid. En proportionerlig utfyllnad av de otäckta anropen vore lockande men
 * är inte invariant under gruppering: samma data ger olika svar beroende på om
 * man räknar per modell, per fas eller per dag. Två ärliga lägen slår en
 * blandning som inte går att summera.
 *
 * Basen bestäms EN gång för hela rapporten och skickas till varje tabell via
 * {@link groupCostUsd}, så modell-, fas- och dagsvyerna alltid summerar till
 * rubriken.
 *
 * @param {Array<{rows?: number, ledgerRows?: number, ledgerUsd?: number, pricedUsd?: number, totalUsd?: number}>} groups
 */
export function resolveCostBasis(groups) {
  let ledgerUsd = 0;
  let estimateUsd = 0;
  let rows = 0;
  let ledgerRows = 0;

  for (const group of groups ?? []) {
    const groupRows = tokens(group.rows);
    rows += groupRows;
    ledgerRows += Math.min(groupRows, tokens(group.ledgerRows));
    ledgerUsd = usd(ledgerUsd + (Number(group.ledgerUsd) || 0));
    estimateUsd = usd(estimateUsd + (Number(group.pricedUsd ?? group.totalUsd) || 0));
  }

  const rowsWithoutLedger = Math.max(0, rows - ledgerRows);
  const basis = rows > 0 && rowsWithoutLedger === 0 ? "ledger" : ledgerRows > 0 ? "partial" : "estimate";

  return {
    basis,
    totalUsd: basis === "ledger" ? ledgerUsd : estimateUsd,
    ledgerUsd,
    estimateUsd,
    rows,
    ledgerRows,
    rowsWithoutLedger,
  };
}

/**
 * En grupps bidrag till totalen under en redan bestämd bas. Ren summering, så
 * vilken partition som helst (modell, fas, dag) summerar till samma tal.
 */
export function groupCostUsd(group, basis) {
  return usd(
    basis === "ledger"
      ? Number(group?.ledgerUsd) || 0
      : Number(group?.pricedUsd ?? group?.totalUsd) || 0,
  );
}

export function resolveCostSource(raw) {
  const value = String(raw ?? "usage").trim().toLowerCase();
  if (value === "telemetry") return "telemetry";
  if (value === "logs" || value === "generation_logs" || value === "engine_generation_logs") {
    return "logs";
  }
  return "usage";
}

export function sourceTableName(source) {
  if (source === "telemetry") return "generation_telemetry";
  if (source === "logs") return "engine_generation_logs";
  return "llm_usage";
}
