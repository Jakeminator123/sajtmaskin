import { pgTable, text, timestamp, uuid, vector, index } from 'drizzle-orm/pg-core';

// RAG infrastructure schema — keep verbatim. Lives under `lib/rag/db` (not
// `lib/db`) so it does not collide with the app-domain `database` dossier when
// both RAG chat and postgres-drizzle/neon are selected (Codex P1 dossier-batch).
// `documents` holds source records; `document_chunks` holds embedded slices.
// The embedding dimension (1536) MUST match text-embedding-3-small AND
// `lib/rag-migrations.sql`.
export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  source: text('source'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('document_chunks_document_id_idx').on(table.documentId)],
);

export type InsertDocument = typeof documents.$inferInsert;
export type SelectDocument = typeof documents.$inferSelect;
export type InsertDocumentChunk = typeof documentChunks.$inferInsert;
export type SelectDocumentChunk = typeof documentChunks.$inferSelect;
