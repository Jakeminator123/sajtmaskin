import { NextResponse } from "next/server";
import { getAppProjectByIdForRequest } from "@/lib/tenant";
import { listChatsByProject } from "@/lib/db/chat-repository-pg";

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
 * `POST /api/engine/chats` is not a codegen path.
 *
 * New-chat codegen is `POST /api/engine/chats/stream` (`maxDuration = 950`).
 * The previous sync handler ran that same pipeline without a duration budget,
 * so Vercel killed it with 504 after the platform default (~30s) while a
 * real generation takes 47–405s. This handler exists so a leftover caller
 * gets a fast, honest 405 instead of a second billed job that cannot finish.
 */
export async function handleEngineChatsPostNotCodegen(_req: Request): Promise<Response> {
  return NextResponse.json(
    {
      error:
        "POST /api/engine/chats is not a codegen path. Use POST /api/engine/chats/stream.",
      code: "use_streaming_create",
    },
    { status: 405, headers: { Allow: "GET" } },
  );
}
