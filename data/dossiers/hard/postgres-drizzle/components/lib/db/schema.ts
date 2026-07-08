import { integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

// REWRITE TARGET: replace this starter table with the generated app's real
// tables. It only demonstrates the schema conventions to follow (identity
// primary key, varchar lengths, timezone-aware timestamps, inferred types).
// Do not keep `items` unless the app genuinely needs it.
export const items = pgTable('items', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type InsertItem = typeof items.$inferInsert;
export type SelectItem = typeof items.$inferSelect;
