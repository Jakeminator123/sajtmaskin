/**
 * Del 2: Anropar samma HTTP-endpoints som buildern (localhost) och sparar
 * request + response för brief och polish-chat.
 *
 * Kräver: `npm run dev` och API-nycklar i .env.local (servern använder dem).
 *
 *   npx tsx devtools/run_first_llm_live.ts --output-dir scripts/testning_scarf/output_first_llm_underlag/run_XXX
 */
import { config as loadEnv } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

type BuildIntent = "website" | "app" | "template";

function parseArgs(argv: string[]) {
  const out: {
    outputDir: string | null;
    prompt: string | null;
    promptFile: string | null;
    baseUrl: string;
    briefModel: string;
    polishModel: string;
    buildIntent: BuildIntent;
    skipBrief: boolean;
    skipPolish: boolean;
    imageGenerations: boolean;
  } = {
    outputDir: null,
    prompt: null,
    promptFile: null,
    baseUrl: process.env.FIRST_LLM_BASE_URL?.trim() || "http://localhost:3000",
    briefModel: "openai/gpt-5.2",
    polishModel: process.env.SAJTMASKIN_POLISH_MODEL?.trim() || "openai/gpt-5.3-codex",
    buildIntent: "website",
    skipBrief: false,
    skipPolish: false,
    imageGenerations: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--output-dir" && next) {
      out.outputDir = next;
      i++;
    } else if ((a === "--prompt" || a === "-p") && next) {
      out.prompt = next;
      i++;
    } else if (a === "--prompt-file" && next) {
      out.promptFile = next;
      i++;
    } else if (a === "--base-url" && next) {
      out.baseUrl = next.replace(/\/$/, "");
      i++;
    } else if (a === "--brief-model" && next) {
      out.briefModel = next;
      i++;
    } else if (a === "--polish-model" && next) {
      out.polishModel = next;
      i++;
    } else if (a === "--build-intent" && next) {
      const v = next as BuildIntent;
      if (v === "website" || v === "app" || v === "template") out.buildIntent = v;
      i++;
    } else if (a === "--skip-brief") out.skipBrief = true;
    else if (a === "--skip-polish") out.skipPolish = true;
    else if (a === "--no-image-generations") out.imageGenerations = false;
  }
  return out;
}

function wantsEnglish(prompt: string): boolean {
  return /\b(english|in english|på engelska|engelska)\b/i.test(prompt);
}

async function main() {
  const args = parseArgs(process.argv);
  const { buildPolishSystemPrompt } = await import("@/lib/builder/promptAssist");

  let prompt = args.prompt?.trim() || "";
  if (!prompt && args.promptFile) {
    prompt = await readFile(resolve(args.promptFile), "utf-8").then((s) => s.trim());
  }
  if (!prompt && args.outputDir) {
    try {
      prompt = await readFile(resolve(args.outputDir, "prompt_in.txt"), "utf-8").then((s) =>
        s.trim(),
      );
    } catch {
      /* ignore */
    }
  }
  if (!prompt) {
    console.error("Ange --prompt, --prompt-file, eller --output-dir med prompt_in.txt");
    process.exit(1);
  }
  if (!args.outputDir) {
    console.error("Ange --output-dir (mapp att skriva 10_* … 16_* i)");
    process.exit(1);
  }

  const outDir = resolve(args.outputDir);
  await mkdir(outDir, { recursive: true });

  const readme = [
    "# Del 2 — live LLM (via Next API)",
    "",
    `Bas-URL: ${args.baseUrl}`,
    "",
    "Detta speglar vad klienten skickar till `/api/ai/brief` respektive `/api/ai/chat`.",
    "För brief lägger servern till site-type-hint och en rad om bilder i det som skickas till modellen (se `src/app/api/ai/brief/route.ts`).",
    "",
  ].join("\n");
  await writeFile(resolve(outDir, "10_live_README.md"), readme, "utf-8");

  if (!args.skipBrief) {
    const briefBody = {
      prompt,
      provider: "gateway" as const,
      model: args.briefModel,
      temperature: 0.2,
      imageGenerations: args.imageGenerations,
    };
    await writeFile(
      resolve(outDir, "11_live_brief_request.json"),
      JSON.stringify(briefBody, null, 2) + "\n",
      "utf-8",
    );

    const briefUrl = `${args.baseUrl}/api/ai/brief`;
    const briefRes = await fetch(briefUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(briefBody),
    });
    const briefText = await briefRes.text();
    const briefHeaders: Record<string, string> = {};
    briefRes.headers.forEach((v, k) => {
      briefHeaders[k] = v;
    });
    await writeFile(
      resolve(outDir, "12_live_brief_response_meta.json"),
      JSON.stringify(
        {
          url: briefUrl,
          status: briefRes.status,
          statusText: briefRes.statusText,
          headers: briefHeaders,
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );
    await writeFile(resolve(outDir, "13_live_brief_response_body.json"), briefText + "\n", "utf-8");
  }

  if (!args.skipPolish) {
    const systemPrompt = buildPolishSystemPrompt({
      buildIntent: args.buildIntent,
      forceEnglish: wantsEnglish(prompt),
    });
    const chatBody = {
      provider: "gateway" as const,
      model: args.polishModel,
      temperature: 0.1,
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: prompt },
      ],
    };
    await writeFile(
      resolve(outDir, "14_live_polish_request.json"),
      JSON.stringify(chatBody, null, 2) + "\n",
      "utf-8",
    );

    const chatUrl = `${args.baseUrl}/api/ai/chat`;
    const chatRes = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatBody),
    });
    const streamed = await chatRes.text();
    const chatHeaders: Record<string, string> = {};
    chatRes.headers.forEach((v, k) => {
      chatHeaders[k] = v;
    });
    await writeFile(
      resolve(outDir, "15_live_polish_response_meta.json"),
      JSON.stringify(
        {
          url: chatUrl,
          status: chatRes.status,
          statusText: chatRes.statusText,
          headers: chatHeaders,
        },
        null,
        2,
      ) + "\n",
      "utf-8",
    );
    await writeFile(resolve(outDir, "16_live_polish_response_body.txt"), streamed + "\n", "utf-8");
  }

  console.log(`Live-spar klart i ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
