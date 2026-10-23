import { NextResponse } from "next/server";
import { z } from "zod";
import { withRateLimit } from "@/lib/rate-limit";
import { getEngineChatByIdForRequest } from "@/lib/tenant";
import {
  appendAgentMessages,
  listAgentMessages,
  type AgentMessageInsert,
} from "@/lib/db/services/agent-messages";

export const runtime = "nodejs";

/**
 * Sajtagentens beständiga historik för EN builderchatt. Ägarkontroll via
 * `getEngineChatByIdForRequest` (samma grind som powers-routen): ett
 * klientlevererat chatt-id ger aldrig en annan hyresgästs rader. Routen är
 * fail-soft mot DB (service-lagret svarar tomt/false), så den gemensamma
 * chatten fungerar även innan `agent_messages` har applicerats.
 */

const MAX_MESSAGES_PER_POST = 20;
const MAX_CONTENT_CHARS = 20_000;

const messageSchema = z.object({
  id: z.string().min(1).max(120),
  role: z.enum(["user", "assistant"]),
  kind: z.enum(["chat", "internal"]).default("chat"),
  content: z.string().min(1).max(MAX_CONTENT_CHARS),
  timestamp: z.number().finite().optional(),
  meta: z
    .object({
      anchorBuilderMessageId: z.string().max(200).nullable().optional(),
      anchorBuilderMessageIndex: z.number().int().min(0).max(100_000).nullable().optional(),
      builderTarget: z
        .object({ chatId: z.string().min(1), versionId: z.string().min(1) })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(MAX_MESSAGES_PER_POST),
});

type RouteContext = { params: Promise<{ chatId: string }> };

async function resolveChatId(req: Request, context: RouteContext): Promise<string | null> {
  const { chatId } = await context.params;
  const trimmed = typeof chatId === "string" ? chatId.trim() : "";
  if (!trimmed) return null;
  const chat = await getEngineChatByIdForRequest(req, trimmed).catch(() => null);
  return chat ? trimmed : null;
}

export async function GET(req: Request, context: RouteContext) {
  return withRateLimit(req, "openclaw:agent-messages", async () => {
    const chatId = await resolveChatId(req, context);
    if (!chatId) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const rows = await listAgentMessages(chatId);
    return NextResponse.json({
      messages: rows.map((row) => ({
        id: row.id,
        role: row.role,
        kind: row.kind,
        content: row.content,
        meta: row.meta,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  });
}

export async function POST(req: Request, context: RouteContext) {
  return withRateLimit(req, "openclaw:agent-messages", async () => {
    const chatId = await resolveChatId(req, context);
    if (!chatId) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed" }, { status: 400 });
    }
    const rows: AgentMessageInsert[] = parsed.data.messages.map((message) => ({
      id: message.id,
      role: message.role,
      kind: message.kind,
      content: message.content,
      meta: message.meta ?? null,
      createdAt:
        typeof message.timestamp === "number" && message.timestamp > 0
          ? new Date(message.timestamp)
          : null,
    }));
    // En klient som har en nyare version av en builderchatt får aldrig smuggla
    // in ett annat chatt-id via builderTarget — målet speglas mot URL:ens chatt.
    for (const row of rows) {
      const target = row.meta?.builderTarget as { chatId?: unknown } | null | undefined;
      if (target && target.chatId !== chatId) {
        row.meta = { ...row.meta, builderTarget: null };
      }
    }
    const persisted = await appendAgentMessages(chatId, rows);
    return NextResponse.json({ persisted, count: rows.length });
  });
}
