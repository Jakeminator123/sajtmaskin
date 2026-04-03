import {
  decideOpenClawCodeContextMode,
  type OpenClawChatMessageLike,
  type OpenClawCodeContextMode,
} from "@/lib/openclaw/chat-context-policy";
import { resolveFileContext } from "@/lib/openclaw/resolve-file-context";

type BuildContextBlockOptions = {
  fileBlock?: string | null;
  includeCurrentCode?: boolean;
  fieldValueMaxChars?: number;
  recentMessageMaxChars?: number;
  currentCodeMaxChars?: number;
};

type BuildOpenClawContextSystemMessageParams = {
  messages: OpenClawChatMessageLike[];
  context: Record<string, unknown>;
  currentCodeMaxChars?: number;
  fullCodeContextMaxChars?: number;
  manifestFileLimit?: number;
  fullFileLimit?: number;
};

function normalizeContextText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeCodeSnippet(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function buildOpenClawContextBlock(
  ctx: Record<string, unknown>,
  options?: BuildContextBlockOptions,
): string {
  const fieldValueMaxChars = options?.fieldValueMaxChars ?? 2_200;
  const recentMessageMaxChars = options?.recentMessageMaxChars ?? 2_200;
  const currentCodeMaxChars = options?.currentCodeMaxChars ?? 16_000;
  const parts: string[] = ["[BUILDER-KONTEXT]"];

  if (ctx.page) parts.push(`Sida: ${ctx.page}`);
  if (ctx.companyName) parts.push(`Företag: ${normalizeContextText(ctx.companyName, 160)}`);
  if (ctx.activeEntryMode) parts.push(`Aktivt läge: ${ctx.activeEntryMode}`);
  if (typeof ctx.wizardOpen === "boolean") {
    parts.push(`Wizard öppen: ${ctx.wizardOpen ? "ja" : "nej"}`);
  }
  if (ctx.expandedSection) parts.push(`Öppen sektion: ${ctx.expandedSection}`);
  if (ctx.buildIntent) parts.push(`Byggintention: ${ctx.buildIntent}`);
  if (ctx.chatId) parts.push(`Chatt-ID: ${ctx.chatId}`);
  if (ctx.buildMethod) parts.push(`Byggmetod: ${ctx.buildMethod}`);
  if (ctx.activeVersionId) parts.push(`Aktiv version: ${ctx.activeVersionId}`);
  if (ctx.demoUrl) parts.push(`Demo-URL: ${ctx.demoUrl}`);
  if (ctx.auditUrl) parts.push(`Audit-URL: ${ctx.auditUrl}`);
  if (ctx.auditedUrl) parts.push(`Senast analyserad URL: ${ctx.auditedUrl}`);
  if (ctx.selectedModelLabel) parts.push(`Byggprofil: ${ctx.selectedModelLabel}`);
  if (ctx.promptAssistLabel) parts.push(`Förbättra-modell: ${ctx.promptAssistLabel}`);
  if (typeof ctx.promptAssistDeep === "boolean") {
    parts.push(`Deep brief: ${ctx.promptAssistDeep ? "på" : "av"}`);
  }
  if (ctx.scaffoldMode) parts.push(`Scaffold-läge: ${ctx.scaffoldMode}`);
  if (ctx.scaffoldId) parts.push(`Scaffold: ${ctx.scaffoldId}`);
  if (ctx.isStreaming) parts.push("(AI genererar just nu)");

  if (Array.isArray(ctx.recentMessages) && ctx.recentMessages.length > 0) {
    parts.push("\nSenaste meddelanden i buildern:");
    for (const message of ctx.recentMessages as { role: string; content: string }[]) {
      const role = normalizeContextText(message.role, 24);
      const content = normalizeContextText(message.content, recentMessageMaxChars);
      if (!role || !content) continue;
      parts.push(`  ${role}: ${content}`);
    }
  }

  if (Array.isArray(ctx.textFields) && ctx.textFields.length > 0) {
    parts.push("\n[SKRIVBARA TEXTFÄLT]");
    for (const field of ctx.textFields.slice(0, 6) as Array<Record<string, unknown>>) {
      const target = normalizeContextText(field.target, 160);
      if (!target) continue;
      const label = normalizeContextText(field.label, 160) || target;
      const kind = normalizeContextText(field.kind, 40) || "text";
      const placeholder = normalizeContextText(field.placeholder, 280);
      const value = normalizeContextText(field.value, fieldValueMaxChars);
      const canWrite = field.canWrite === false ? "nej" : "ja";
      parts.push(`- target: ${target}`);
      parts.push(`  label: ${label}`);
      parts.push(`  typ: ${kind}`);
      parts.push(`  skrivbar: ${canWrite}`);
      if (placeholder) parts.push(`  placeholder: ${placeholder}`);
      parts.push(`  värde: ${value || "(tomt)"}`);
    }
    parts.push("[/SKRIVBARA TEXTFÄLT]");
  }

  if (options?.fileBlock) {
    parts.push(`\n${options.fileBlock}`);
  } else if (options?.includeCurrentCode) {
    const currentCode = normalizeCodeSnippet(ctx.currentCode, currentCodeMaxChars);
    if (currentCode) {
      parts.push(`\nKodavsnitt (första ~${currentCodeMaxChars} tecken):\n\`\`\`\n${currentCode}\n\`\`\``);
    }
  }

  parts.push("[/BUILDER-KONTEXT]");
  return parts.join("\n");
}

export async function buildOpenClawContextSystemMessage(
  params: BuildOpenClawContextSystemMessageParams,
): Promise<{ codeContextMode: OpenClawCodeContextMode; content: string }> {
  const {
    messages,
    context,
    currentCodeMaxChars = 16_000,
    fullCodeContextMaxChars = 180_000,
    manifestFileLimit = 16,
    fullFileLimit = 24,
  } = params;

  const codeContextMode = decideOpenClawCodeContextMode({
    messages,
    page: context.page,
    chatId: context.chatId,
    currentCode: context.currentCode,
  });

  let fileBlock: string | null = null;
  const chatId = typeof context.chatId === "string" ? context.chatId : "";
  const versionId = typeof context.activeVersionId === "string" ? context.activeVersionId : "";

  if (chatId && (codeContextMode === "manifest" || codeContextMode === "full")) {
    const fileContext = await resolveFileContext(chatId, versionId || null, {
      includeFullText: codeContextMode === "full",
      maxFullTextChars: fullCodeContextMaxChars,
      maxManifestFiles: codeContextMode === "full" ? fullFileLimit : manifestFileLimit,
    });
    if (fileContext) {
      fileBlock =
        codeContextMode === "full" && fileContext.fullText
          ? `[GENERERADE FILER — ${fileContext.files.length} filer]\n${fileContext.fullText}\n[/GENERERADE FILER]`
          : `[FILMANIFEST — ${fileContext.files.length} filer, kompakt för tokenbudget]\n${fileContext.manifest}\n[/FILMANIFEST]`;
    }
  }

  return {
    codeContextMode,
    content: buildOpenClawContextBlock(context, {
      fileBlock,
      includeCurrentCode: codeContextMode === "light",
      currentCodeMaxChars,
    }),
  };
}
