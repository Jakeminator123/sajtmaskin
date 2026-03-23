/**
 * Loads `.env.local` (if present) and checks ANTHROPIC_API_KEY without printing it.
 * Optionally pings api.anthropic.com with a tiny request to verify the key works.
 *
 * Usage: node verify-anthropic-env.mjs
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env") });

const key = process.env.ANTHROPIC_API_KEY?.trim();
if (!key) {
  console.error("ANTHROPIC_API_KEY: saknas (sätt i .env.local)");
  process.exit(1);
}

console.log(`ANTHROPIC_API_KEY: satt (längd ${key.length} tecken)`);

const model =
  process.env.SAJTMASKIN_VERIFY_ANTHROPIC_MODEL?.trim() || "claude-opus-4-6";

try {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8,
      messages: [{ role: "user", content: "Say only: ok" }],
    }),
  });

  if (res.status === 401 || res.status === 403) {
    console.error(`API: nekad (${res.status}) — ogiltig eller spärrad nyckel.`);
    process.exit(1);
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`API: HTTP ${res.status}`);
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  console.log(`API: OK (modell ${model} accepterades för testanrop)`);
} catch (err) {
  console.error("API: nätverksfel eller fetch misslyckades:", err);
  process.exit(1);
}
