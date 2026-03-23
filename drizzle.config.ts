import { config } from "dotenv";
import { resolveMigrationsDbEnv } from "./src/lib/db/env";

// Load .env.local for local development
config({ path: ".env.local" });

const resolved = resolveMigrationsDbEnv(process.env);

const drizzleConfig = {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: resolved?.connectionString || process.env.POSTGRES_URL || "",
  },
};

export default drizzleConfig;
