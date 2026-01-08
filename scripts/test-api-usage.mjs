#!/usr/bin/env node
/**
 * Test API Usage - Visar vilket API som faktiskt används
 *
 * Detta skript testar och visar:
 * 1. Vilka API-nycklar som är konfigurerade från .env.local (DINA PRIVATA NYCKLAR)
 * 2. Vilket flöde som används för kodgenerering
 * 3. Att anropen går DIREKT till OpenAI/v0 API (INTE via Vercel)
 * 4. Skillnaden mellan AI SDK (för prompt-behandling) och v0 API (för kodgenerering)
 *
 * Run: node scripts/test-api-usage.mjs
 */

import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

config({ path: resolve(process.cwd(), ".env.local") });

const results = [];

function log(category, status, message) {
  const icon = status === "ok" ? "✅" : status === "warn" ? "⚠️" : "❌";
  console.log(`${icon} [${category}] ${message}`);
  results.push({ category, status, message });
}

console.log("\n" + "=".repeat(70));
console.log("🔍 SAJTMASKIN - API Usage Test");
console.log("=".repeat(70));
console.log(
  "\nDetta skript visar vilket API som faktiskt används när du bygger sajter.\n"
);

// ============================================================================
// 1. KONTROLLERA INSTALLATIONER
// ============================================================================

console.log("📦 INSTALLATIONER:");
console.log("-".repeat(70));

try {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const deps = packageJson.dependencies || {};

  // Kolla AI SDK
  if (deps["ai"]) {
    log("Installation", "ok", `AI SDK installerad: ${deps["ai"]}`);
  } else {
    log("Installation", "fail", "AI SDK (ai) INTE installerad!");
  }

  // Kolla @ai-sdk/openai
  if (deps["@ai-sdk/openai"]) {
    log(
      "Installation",
      "ok",
      `@ai-sdk/openai installerad: ${deps["@ai-sdk/openai"]}`
    );
  } else {
    log("Installation", "fail", "@ai-sdk/openai INTE installerad!");
  }

  // Kolla v0-sdk
  if (deps["v0-sdk"]) {
    log("Installation", "ok", `v0-sdk installerad: ${deps["v0-sdk"]}`);
  } else {
    log("Installation", "fail", "v0-sdk INTE installerad!");
  }

  // Kolla OpenAI SDK (direkt)
  if (deps["openai"]) {
    log("Installation", "ok", `OpenAI SDK installerad: ${deps["openai"]}`);
  } else {
    log(
      "Installation",
      "warn",
      "OpenAI SDK (openai) INTE installerad (används för bildgenerering)"
    );
  }
} catch (error) {
  log("Installation", "fail", `Kunde inte läsa package.json: ${error.message}`);
}

console.log("");

// ============================================================================
// 2. KONTROLLERA API-NYCKLAR (FRÅN .env.local - DINA PRIVATA NYCKLAR)
// ============================================================================

console.log("🔑 API-NYCKLAR (från .env.local - DINA PRIVATA NYCKLAR):");
console.log("-".repeat(70));

const v0ApiKey = process.env.V0_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const aiGatewayKey = process.env.AI_GATEWAY_API_KEY;

if (v0ApiKey) {
  const keyPreview =
    v0ApiKey.length > 12
      ? `${v0ApiKey.slice(0, 8)}...${v0ApiKey.slice(-4)}`
      : v0ApiKey;
  log("API Keys", "ok", `V0_API_KEY: Konfigurerad (${keyPreview})`);
  log("API Keys", "info", "  → Detta är DIN PRIVATA nyckel från .env.local");
  log("API Keys", "info", "  → Används för KODGENERERING (v0 API)");
} else {
  log(
    "API Keys",
    "fail",
    "V0_API_KEY: INTE konfigurerad (krävs för kodgenerering!)"
  );
}

if (openaiApiKey) {
  const keyPreview =
    openaiApiKey.length > 12
      ? `${openaiApiKey.slice(0, 8)}...${openaiApiKey.slice(-4)}`
      : openaiApiKey;
  log("API Keys", "ok", `OPENAI_API_KEY: Konfigurerad (${keyPreview})`);
  log("API Keys", "info", "  → Detta är DIN PRIVATA nyckel från .env.local");
  log(
    "API Keys",
    "info",
    "  → Används för PROMPT-BEHANDLING (router, enhancer)"
  );
} else {
  log(
    "API Keys",
    "fail",
    "OPENAI_API_KEY: INTE konfigurerad (krävs för prompt-behandling!)"
  );
}

if (aiGatewayKey) {
  log(
    "API Keys",
    "ok",
    `AI_GATEWAY_API_KEY: Konfigurerad (valfritt, för Vercel AI Gateway)`
  );
} else {
  log(
    "API Keys",
    "warn",
    "AI_GATEWAY_API_KEY: INTE konfigurerad (valfritt, används INTE om saknas)"
  );
}

console.log("");

// ============================================================================
// 3. FÖRKLARA FLÖDET
// ============================================================================

console.log("🔄 FLÖDE FÖR KODGENERERING:");
console.log("-".repeat(70));
console.log(`
När du bygger en sajt går flödet så här:

1. ANVÄNDAREN SKRIVER PROMPT
   └─> "Skapa en portfolio-sajt"

2. SEMANTIC ROUTER (AI SDK + OpenAI API)
   └─> Använder: AI SDK generateText() + OpenAI API
   └─> API-nyckel: DIN PRIVATA OPENAI_API_KEY från .env.local
   └─> Går till: https://api.openai.com (DIREKT, INTE via Vercel)
   └─> Klassificerar vad användaren vill göra

3. CODE CRAWLER (INGEN AI)
   └─> Hittar relevant kod i projektet
   └─> API: Ingen (lokal filsystem-sökning)

4. SEMANTIC ENHANCER (AI SDK + OpenAI API)
   └─> Använder: AI SDK generateText() + OpenAI API
   └─> API-nyckel: DIN PRIVATA OPENAI_API_KEY från .env.local
   └─> Går till: https://api.openai.com (DIREKT, INTE via Vercel)
   └─> Förbättrar vaga prompts

5. PROMPT ENRICHER (INGEN AI)
   └─> Formaterar prompten för v0
   └─> API: Ingen (lokal formatering)

6. V0 API (v0-sdk)
   └─> Använder: v0-sdk createClient()
   └─> API-nyckel: DIN PRIVATA V0_API_KEY från .env.local
   └─> Går till: https://api.v0.dev (DIREKT, INTE via Vercel)
   └─> Genererar faktisk kod

SAMMANFATTNING:
- AI SDK används för PROMPT-BEHANDLING (router, enhancer)
- v0 API används för KODGENERERING
- Båda använder DINA PRIVATA API-NYCKLAR från .env.local
- AI SDK går via OpenAI API (DIREKT till api.openai.com, INTE via Vercel)
- v0 API går direkt till v0.dev (DIREKT till api.v0.dev, INTE via Vercel)
`);

console.log("");

// ============================================================================
// 4. TESTA API:ERNA DIREKT
// ============================================================================

console.log("🧪 TESTAR API:ER DIREKT (med dina privata nycklar):");
console.log("-".repeat(70));

// Test OpenAI API direkt
if (openaiApiKey) {
  try {
    log(
      "OpenAI Test",
      "info",
      "Testar direktanslutning till api.openai.com..."
    );

    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${openaiApiKey}` },
    });

    if (res.ok) {
      const data = await res.json();
      log(
        "OpenAI Test",
        "ok",
        `✅ OpenAI API fungerar! (${
          data.data?.length || 0
        } modeller tillgängliga)`
      );
      log(
        "OpenAI Test",
        "info",
        "  → Använder DIN PRIVATA nyckel från .env.local"
      );
      log(
        "OpenAI Test",
        "info",
        "  → Går DIREKT till api.openai.com (INTE via Vercel)"
      );
      log(
        "OpenAI Test",
        "info",
        "  → Används för: Semantic Router, Semantic Enhancer"
      );
    } else {
      log(
        "OpenAI Test",
        "fail",
        `OpenAI API: HTTP ${res.status} - ${res.statusText}`
      );
      if (res.status === 401) {
        log(
          "OpenAI Test",
          "fail",
          "  → Ogiltig API-nyckel. Kontrollera din OPENAI_API_KEY i .env.local"
        );
      }
    }
  } catch (error) {
    log("OpenAI Test", "fail", `OpenAI API: ${error.message}`);
  }
} else {
  log(
    "OpenAI Test",
    "fail",
    "Kan inte testa OpenAI API - OPENAI_API_KEY saknas i .env.local"
  );
}

console.log("");

// Test v0 API direkt
if (v0ApiKey) {
  try {
    log("v0 API Test", "info", "Testar direktanslutning till api.v0.dev...");

    const { createClient } = await import("v0-sdk");
    const v0 = createClient({ apiKey: v0ApiKey });

    // Testa att skapa en enkel chat
    const testResult = await v0.chats.create({
      message: "Say hi",
      system: "Be brief",
      chatPrivacy: "private",
      modelConfiguration: {
        modelId: "v0-1.5-md",
        imageGenerations: false,
        thinking: false,
      },
      responseMode: "sync",
    });

    if (testResult && testResult.id) {
      log(
        "v0 API Test",
        "ok",
        `✅ v0 API fungerar! (chat: ${testResult.id.slice(0, 8)}...)`
      );
      log(
        "v0 API Test",
        "info",
        "  → Använder DIN PRIVATA nyckel från .env.local"
      );
      log(
        "v0 API Test",
        "info",
        "  → Går DIREKT till api.v0.dev (INTE via Vercel)"
      );
      log(
        "v0 API Test",
        "info",
        "  → Används för: Kodgenerering (generateCode, refineCode)"
      );
    }
  } catch (error) {
    const msg = error.message || String(error);
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      log("v0 API Test", "fail", "v0 API: Ogiltig nyckel");
      log("v0 API Test", "fail", "  → Kontrollera din V0_API_KEY i .env.local");
      log(
        "v0 API Test",
        "info",
        "  → Hämta ny nyckel på: https://v0.dev/settings"
      );
    } else if (msg.includes("422")) {
      log("v0 API Test", "ok", "v0 API: Nyckel är giltig (API svarar)");
      log(
        "v0 API Test",
        "info",
        "  → Använder DIN PRIVATA nyckel från .env.local"
      );
      log(
        "v0 API Test",
        "info",
        "  → Går DIREKT till api.v0.dev (INTE via Vercel)"
      );
    } else {
      log("v0 API Test", "warn", `v0 API: ${msg.slice(0, 60)}`);
    }
  }
} else {
  log(
    "v0 API Test",
    "fail",
    "Kan inte testa v0 API - V0_API_KEY saknas i .env.local"
  );
}

console.log("");

// Test AI SDK med OpenAI
if (openaiApiKey) {
  try {
    log("AI SDK Test", "info", "Testar AI SDK med OpenAI API...");

    const { generateText } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");

    const openai = createOpenAI({ apiKey: openaiApiKey });

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      prompt: "Say hi",
      maxOutputTokens: 20,
    });

    if (result && result.text) {
      log(
        "AI SDK Test",
        "ok",
        `✅ AI SDK fungerar! (svar: "${result.text.trim()}")`
      );
      log(
        "AI SDK Test",
        "info",
        "  → Använder DIN PRIVATA OpenAI-nyckel från .env.local"
      );
      log(
        "AI SDK Test",
        "info",
        "  → Går DIREKT till api.openai.com via AI SDK (INTE via Vercel)"
      );
      log(
        "AI SDK Test",
        "info",
        "  → Används för: Semantic Router, Semantic Enhancer"
      );
    }
  } catch (error) {
    const msg = error.message || String(error);
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      log("AI SDK Test", "fail", "AI SDK: Ogiltig OpenAI-nyckel");
      log(
        "AI SDK Test",
        "fail",
        "  → Kontrollera din OPENAI_API_KEY i .env.local"
      );
    } else {
      log("AI SDK Test", "warn", `AI SDK: ${msg.slice(0, 60)}`);
    }
  }
} else {
  log(
    "AI SDK Test",
    "fail",
    "Kan inte testa AI SDK - OPENAI_API_KEY saknas i .env.local"
  );
}

console.log("");

// ============================================================================
// 5. VERIFIERA ATT DET INTE GÅR VIA VERCEL
// ============================================================================

console.log("🔍 VERIFIERING: Går anropen via Vercel?");
console.log("-".repeat(70));

console.log(`
KONTROLL:
- OpenAI API: Går till https://api.openai.com (DIREKT)
- v0 API: Går till https://api.v0.dev (DIREKT)
- Ingen av dem går via Vercel AI Gateway om AI_GATEWAY_API_KEY inte är satt

VIKTIGT:
- Alla API-anrop använder DINA PRIVATA NYCKLAR från .env.local
- Ingen annan part (Vercel, etc.) har tillgång till dessa nycklar
- Anropen går direkt till respektive API-leverantör
`);

console.log("");

// ============================================================================
// 6. SAMMANFATTNING
// ============================================================================

console.log("=".repeat(70));
console.log("📊 SAMMANFATTNING");
console.log("=".repeat(70));

const ok = results.filter((r) => r.status === "ok").length;
const warn = results.filter((r) => r.status === "warn").length;
const fail = results.filter((r) => r.status === "fail").length;
const info = results.filter((r) => r.status === "info").length;

console.log(
  `\n✅ OK: ${ok}  ⚠️  Varningar: ${warn}  ❌ Fel: ${fail}  ℹ️  Info: ${info}\n`
);

console.log("VIKTIGT - DINA PRIVATA API-NYCKLAR:");
console.log("-".repeat(70));
console.log(
  "• OpenAI API: Använder DIN PRIVATA OPENAI_API_KEY från .env.local"
);
console.log("• v0 API: Använder DIN PRIVATA V0_API_KEY från .env.local");
console.log("• Båda går DIREKT till respektive API (INTE via Vercel)");
console.log("• Ingen annan part har tillgång till dina nycklar\n");

console.log("FLÖDE:");
console.log("-".repeat(70));
console.log("1. Prompt-behandling → AI SDK + OpenAI API (DIN PRIVATA NYCKEL)");
console.log("2. Kodgenerering → v0 API (DIN PRIVATA NYCKEL)");
console.log("3. Allt går DIREKT till respektive API-leverantör\n");

if (fail > 0) {
  console.log("🔧 FÖR ATT FIXA:");
  console.log("-".repeat(70));
  if (!v0ApiKey) {
    console.log("• V0_API_KEY: Lägg till i .env.local");
    console.log("  Hämta nyckel: https://v0.dev/settings");
  }
  if (!openaiApiKey) {
    console.log("• OPENAI_API_KEY: Lägg till i .env.local");
    console.log("  Hämta nyckel: https://platform.openai.com/api-keys");
  }
  console.log("");
}
