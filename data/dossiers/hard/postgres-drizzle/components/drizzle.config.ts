import { defineConfig } from 'drizzle-kit';

// Emitted at the project root; the schema is emitted at lib/db/schema.ts.
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
