import { EventEmittingResponse } from "@/src/lib/event-emitter";
import { getPublicUrl } from "@/src/lib/url";

export const runtime = "nodejs";

async function handleMcpRequest(req: Request) {
  const publicUrl = getPublicUrl(req);

  // Replace this with your real MCP server / handler implementation.
  // The important integration pattern is to use the public URL when the
  // server needs to advertise its own externally reachable endpoint.
  return Response.json({
    ok: true,
    endpoint: publicUrl.toString(),
  });
}

export async function POST(req: Request) {
  const response = new EventEmittingResponse(undefined as never, (event) => {
    console.log(JSON.stringify(event));
  });

  response.startSession("HTTP", {
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  try {
    const body = await req.clone().json().catch(() => undefined);
    const method = typeof body?.method === "string" ? body.method : "unknown";

    response.requestReceived(method, body?.params);
    const result = await handleMcpRequest(req);
    response.requestCompleted(method);

    return result;
  } catch (error) {
    response.error(
      error instanceof Error ? error : String(error),
      "Unhandled MCP request error",
      "request"
    );

    return Response.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    response.endSession("HTTP");
  }
}
