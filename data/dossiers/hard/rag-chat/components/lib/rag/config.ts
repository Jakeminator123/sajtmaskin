import 'server-only';

/**
 * Demo/mock detection (mock: canned). A value counts as NOT real when it is
 * missing OR a preview stub — F2 seeds `sk-placeholder-preview-not-real` /
 * `postgresql://preview:preview@127.0.0.1:5432/preview` style values so the
 * project boots without crashing. Mirrors the shared stub vocabulary
 * (`placeholder` / `not_real` / `dummy` / `changeme` / `your_...`) plus the
 * `preview` marker used by the tier-3 DATABASE_URL loopback stub.
 */
function isPlaceholderValue(value: string | undefined | null): boolean {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return true;
  return /placeholder|not[_-]?a?[_-]?real|dummy|changeme|preview|^your[_-]/i.test(trimmed);
}

/**
 * True only when BOTH a real OpenAI key and a real pgvector-capable Postgres
 * URL are configured. Server code (the chat route, ingestion, retrieval) MUST
 * branch on this before touching OpenAI or the database: when it returns
 * false, stream the canned demo reply and render the discreet
 * `<RagConfigNotice />` — never crash the page, never surface raw errors, and
 * never return a 500 for a missing env var. Placeholder guards apply to EVERY
 * key: a real OPENAI_API_KEY with a stubbed DATABASE_URL (or vice versa) still
 * takes the demo path — a half-configured RAG must not fire real calls against
 * fabricated config.
 */
export function isRagConfigured(): boolean {
  return (
    !isPlaceholderValue(process.env.OPENAI_API_KEY) &&
    !isPlaceholderValue(process.env.DATABASE_URL)
  );
}
