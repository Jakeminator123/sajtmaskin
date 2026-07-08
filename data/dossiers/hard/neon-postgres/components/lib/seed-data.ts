/**
 * Static fallback content used when the database is NOT configured (design
 * preview or missing DATABASE_URL). Server code branches on `isDbConfigured()`
 * from `@/lib/db`: configured → query via `getSql()`, not configured → render
 * this seed data with a discreet `<DbConfigNotice />`.
 *
 * REWRITE TARGET: mirror the app's real tables and domain here (same shape as
 * the rows the SQL queries would return) so the design preview looks realistic.
 */
export interface SeedItem {
  id: number;
  name: string;
  description: string;
}

export const seedData: SeedItem[] = [
  {
    id: 1,
    name: 'Exempelpost ett',
    description: 'Statisk exempeldata som visas när databasen inte är konfigurerad.',
  },
  {
    id: 2,
    name: 'Exempelpost två',
    description: 'Ersätt raderna med domänriktig exempeldata för appen.',
  },
  {
    id: 3,
    name: 'Exempelpost tre',
    description: 'Samma form som databasens riktiga rader, så designen kan förhandsgranskas.',
  },
];
