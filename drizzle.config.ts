import { config } from "dotenv";

// Load .env.local for local development
config({ path: ".env.local" });

const drizzleConfig = {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.DATABASE_URL ||
      "",
  },
};

export default drizzleConfig;
