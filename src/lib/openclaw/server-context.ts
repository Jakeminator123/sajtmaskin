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

/**
 * Verifies the REQUESTER owns a client-supplied chat/version before any
 * generated file/code context is fetched. Returns the ownership-verified ids to
 * read from (callers resolve these against the request session), or `null` when
 * the caller does not own them. Cross-tenant guard (Codex P1): `context.chatId`/
 * `context.activeVersionId` are client-supplied, so they must never drive a
 * file read without this check.
 */
export type OpenClawOwnershipVerifier = (
  chatId: string,
  versionId: string | null,
) => Promise<{ chatId: string; versionId: string | null } | null>;

type BuildOpenClawContextSystemMessageParams = {
  messages: OpenClawChatMessageLike[];
  context: Record<string, unknown>;
  currentCodeMaxChars?: number;
  fullCodeContextMaxChars?: number;
  manifestFileLimit?: number;
  fullFileLimit?: number;
  /** Debug-mode (OC_DEBUG): force full code context for the open chat. */
  debug?: boolean;
  /**
   * Ownership gate for generated file/code context. Generated files are fetched
   * ONLY for ids this verifier confirms the caller owns. Fail-closed: when it is
   * omitted (or returns `null`), no file/manifest context is injected, so a
   * forged chat/version id can never leak another tenant's generated files.
   */
  verifyOwnership?: OpenClawOwnershipVerifier;
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
    debug = false,
    verifyOwnership,
  } = params;

  const codeContextMode = decideOpenClawCodeContextMode({
    messages,
    page: context.page,
    chatId: context.chatId,
    currentCode: context.currentCode,
    debug,
  });

  let fileBlock: string | null = null;
  const chatId = typeof context.chatId === "string" ? context.chatId : "";
  const versionId = typeof context.activeVersionId === "string" ? context.activeVersionId : "";

  if (chatId && (codeContextMode === "manifest" || codeContextMode === "full")) {
    // Cross-tenant guard (Codex P1): never read generated files by a
    // client-supplied chat/version id without verifying the caller owns it.
    // Fail-closed — no verifier or an unowned id means no file context.
    const owned = verifyOwnership
      ? await verifyOwnership(chatId, versionId || null)
      : null;
    const fileContext = owned
      ? await resolveFileContext(owned.chatId, owned.versionId, {
          includeFullText: codeContextMode === "full",
          maxFullTextChars: fullCodeContextMaxChars,
          maxManifestFiles: codeContextMode === "full" ? fullFileLimit : manifestFileLimit,
        })
      : null;
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
