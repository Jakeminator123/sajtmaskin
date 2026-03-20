#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

type RuntimeMode = "preview" | "sandbox";
type ScaffoldMode = "auto" | "manual" | "off";

type CliOptions = {
  prompt: string;
  buildIntent?: string;
  modelId?: string;
  runtimeMode?: RuntimeMode;
  scaffoldMode?: ScaffoldMode;
  scaffoldId?: string;
  thinking?: boolean;
  imageGenerations?: boolean;
  json?: boolean;
};

function printUsage(): void {
  console.log(`
Usage:
  npm run mcp:generate-site -- --prompt "Bygg en enkel frisorsida"
  npm run mcp:generate-site -- "Bygg en enkel frisorsida"
  npm run mcp:generate-site -- --prompt-file .\\prompt.txt --json

Options:
  --prompt <text>             Prompt text directly
  --prompt-file <path>        Read prompt from a file
  --build-intent <value>      website | app | template
  --model <id>                Builder model tier/profile id
  --runtime-mode <mode>       preview | sandbox
  --scaffold-mode <mode>      auto | manual | off
  --scaffold-id <id>          Scaffold id when scaffold-mode=manual
  --no-thinking               Disable extra reasoning
  --no-images                 Disable image generations
  --json                      Print raw JSON result
  --help                      Show this help
`);
}

function readPromptFile(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  return fs.readFileSync(resolved, "utf-8").trim();
}

function parseArgs(argv: string[]): CliOptions | "help" {
  let prompt = "";
  let promptFile: string | null = null;
  let buildIntent: string | undefined;
  let modelId: string | undefined;
  let runtimeMode: RuntimeMode | undefined;
  let scaffoldMode: ScaffoldMode | undefined;
  let scaffoldId: string | undefined;
  let thinking = true;
  let imageGenerations = true;
  let json = false;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--help":
      case "-h":
        return "help";
      case "--prompt":
        if (!next) throw new Error("--prompt requires a value");
        prompt = next;
        i++;
        break;
      case "--prompt-file":
        if (!next) throw new Error("--prompt-file requires a path");
        promptFile = next;
        i++;
        break;
      case "--build-intent":
        if (!next) throw new Error("--build-intent requires a value");
        buildIntent = next;
        i++;
        break;
      case "--model":
        if (!next) throw new Error("--model requires a value");
        modelId = next;
        i++;
        break;
      case "--runtime-mode":
        if (!next || (next !== "preview" && next !== "sandbox")) {
          throw new Error("--runtime-mode must be preview or sandbox");
        }
        runtimeMode = next;
        i++;
        break;
      case "--scaffold-mode":
        if (!next || (next !== "auto" && next !== "manual" && next !== "off")) {
          throw new Error("--scaffold-mode must be auto, manual, or off");
        }
        scaffoldMode = next;
        i++;
        break;
      case "--scaffold-id":
        if (!next) throw new Error("--scaffold-id requires a value");
        scaffoldId = next;
        i++;
        break;
      case "--no-thinking":
        thinking = false;
        break;
      case "--no-images":
        imageGenerations = false;
        break;
      case "--json":
        json = true;
        break;
      default:
        positional.push(arg);
        break;
    }
  }

  if (!prompt && promptFile) {
    prompt = readPromptFile(promptFile);
  }
  if (!prompt && positional.length > 0) {
    prompt = positional.join(" ").trim();
  }
  if (!prompt) {
    throw new Error("A prompt is required. Use --prompt, --prompt-file, or a positional prompt.");
  }

  return {
    prompt,
    buildIntent,
    modelId,
    runtimeMode,
    scaffoldMode,
    scaffoldId,
    thinking,
    imageGenerations,
    json,
  };
}

async function main(): Promise<number> {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed === "help") {
      printUsage();
      return 0;
    }

    const { generateSiteFromPrompt } = await import("../src/lib/mcp/generate-site");
    const result = await generateSiteFromPrompt({
      prompt: parsed.prompt,
      buildIntent: parsed.buildIntent,
      modelId: parsed.modelId,
      runtimeMode: parsed.runtimeMode,
      scaffoldMode: parsed.scaffoldMode,
      scaffoldId: parsed.scaffoldId,
      thinking: parsed.thinking,
      imageGenerations: parsed.imageGenerations,
    });

    if (parsed.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    console.log("Generate site completed.");
    console.log(`- Project: ${result.projectId}`);
    console.log(`- Chat: ${result.chatId}`);
    console.log(`- Version: ${result.versionId}`);
    console.log(`- Message: ${result.messageId}`);
    console.log(`- Scaffold: ${result.scaffoldId ?? "none"}`);
    console.log(`- Runtime mode: ${result.runtimeMode}`);
    console.log(`- Files: ${result.filesCount}`);
    console.log(`- Preview URL: ${result.previewUrl ?? "none"}`);
    console.log(`- Runtime URL: ${result.runtimeUrl ?? "none"}`);
    if (result.sandboxId) {
      console.log(`- Sandbox ID: ${result.sandboxId}`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mcp:generate-site] ${message}`);
    return 1;
  }
}

void main().then((code) => {
  process.exitCode = code;
});