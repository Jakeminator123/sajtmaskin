import { spawn } from "node:child_process";
import { config } from "dotenv";
import { assertSafeWriteTarget } from "./db-target-guard.mjs";

config({ path: ".env.local" });

assertSafeWriteTarget({ commandName: "db:push" });

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const child = spawn(command, ["drizzle-kit", "push"], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error("[db:push] Failed to start drizzle-kit:", error);
  process.exit(1);
});
