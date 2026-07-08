/**
 * Static fallback content used when the database is NOT configured (design
 * preview or missing MONGODB_URI). Server code branches on `isDbConfigured()`
 * from `@/lib/mongodb`: configured → query via `getMongoDb()`, not configured
 * → render this seed data with a discreet `<DbConfigNotice />`.
 *
 * REWRITE TARGET: mirror the app's real collections and domain here (same
 * shape as the documents the queries would return, with `_id` already
 * stringified) so the design preview looks realistic.
 */
export interface SeedDocument {
  id: string;
  name: string;
  description: string;
}

export const seedData: SeedDocument[] = [
  {
    id: "seed-1",
    name: "Exempeldokument ett",
    description: "Statisk exempeldata som visas när databasen inte är konfigurerad.",
  },
  {
    id: "seed-2",
    name: "Exempeldokument två",
    description: "Ersätt dokumenten med domänriktig exempeldata för appen.",
  },
  {
    id: "seed-3",
    name: "Exempeldokument tre",
    description: "Samma form som databasens riktiga dokument, så designen kan förhandsgranskas.",
  },
];
