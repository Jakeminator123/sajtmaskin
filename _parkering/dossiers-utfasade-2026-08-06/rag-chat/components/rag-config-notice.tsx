/**
 * Discreet notice rendered when RAG runs in demo mode (missing/placeholder
 * OPENAI_API_KEY or DATABASE_URL) and the chat streams a canned demo reply
 * (mock: canned). Keep it subtle — a small muted banner above the thread,
 * never a full-page error. Rewritable copy/styling.
 */
export function RagConfigNotice() {
  return (
    <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      RAG i demo-läge – assistenten visar exempelsvar. Koppla en OpenAI-nyckel
      och en pgvector-databas för riktiga svar från era dokument.
    </p>
  );
}
