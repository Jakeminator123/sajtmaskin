import { NextResponse } from "next/server";
import { getAppProjectByIdForRequest } from "@/lib/tenant";
import { listChatsByProject } from "@/lib/db/chat-repository-pg";
import {
  buildSyncCreateChatPayload,
  parseSseEvents,
} from "@/lib/api/engine/chats/sync-create-from-sse";
import { handleCreateChatStreamPost } from "@/lib/api/engine/chats/create-chat-stream-post";

export async function handleEngineChatsGet(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ chats: [] });
    }
    const ownedProject = await getAppProjectByIdForRequest(req, projectId);
    if (!ownedProject) {
      return NextResponse.json({ chats: [] });
    }
    const chatList = await listChatsByProject(ownedProject.id);
    return NextResponse.json({ chats: chatList });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Sync JSON create — same own-engine pipeline as `POST .../stream`, consuming the SSE transcript server-side.
 */
export async function handleEngineChatsPostSync(req: Request): Promise<Response> {
  const streamResponse = await handleCreateChatStreamPost(req);
  const contentType = streamResponse.headers.get("content-type") || "";

  if (!contentType.includes("text/event-stream")) {
    return streamResponse;
  }

  const transcript = await streamResponse.text();
  const result = buildSyncCreateChatPayload(parseSseEvents(transcript));
  const response = NextResponse.json(result.body, { status: result.status });
  const setCookie = streamResponse.headers.get("Set-Cookie");
  if (setCookie) {
    response.headers.set("Set-Cookie", setCookie);
  }
  return response;
}
