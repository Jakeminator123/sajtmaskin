import { NextResponse } from "next/server";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
import { getVersionFiles, getLatestVersionFiles } from "@/lib/gen/version-manager";
import { buildPreviewHtml } from "@/lib/gen/preview";
import { repairGeneratedFiles } from "@/lib/gen/repair-generated-files";
import { getChat, getVersionById } from "@/lib/db/chat-repository-pg";
import { getProjectByIdForRequest } from "@/lib/tenant";

export const runtime = "nodejs";

/**
 * Serves a self-contained HTML preview of generated code.
 * Used by the own engine path to provide instant preview
 * without waiting for a @vercel/sandbox to boot.
 *
 * Query params:
 *   chatId    — required
 *   versionId — optional (uses latest version if omitted)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const chatId = searchParams.get("chatId");
  const versionId = searchParams.get("versionId");
  const routePath = searchParams.get("route");

  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }

  if (shouldUseV0Fallback()) {
    return NextResponse.json(
      { error: "Preview render is only available with the own engine" },
      { status: 400 },
    );
  }

  const chat = await getChat(chatId);
  if (!chat) {
    return new Response(
      errorPage("Chat hittades inte", "Chatten kunde inte verifieras för preview-rendering."),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (!chat.project_id || !(await getProjectByIdForRequest(req, chat.project_id))) {
    return new Response(
      errorPage("Ingen åtkomst", "Du har inte åtkomst till den här preview-versionen."),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  if (versionId) {
    const version = await getVersionById(versionId);
    if (!version || version.chat_id !== chatId) {
      return new Response(
        errorPage("Version hittades inte", "Versionen tillhör inte den valda chatten."),
        { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }
  }

  const files = versionId
    ? await getVersionFiles(versionId)
    : await getLatestVersionFiles(chatId);

  if (!files || files.length === 0) {
    return new Response(
      errorPage("Inga filer hittades", "Version saknar genererade filer."),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  const repairedFiles = repairGeneratedFiles(files).files;
  const html = buildPreviewHtml(repairedFiles, routePath);

  if (!html) {
    return new Response(
      errorPage(
        "Ingen renderbar komponent",
        "Kunde inte hitta en React-komponent att rendera bland filerna.",
      ),
      { status: 422, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Preview-Source": "own-engine",
    },
  });
}

function errorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
           font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #a3a3a3; }
    .card { text-align: center; max-width: 420px; padding: 2rem; }
    h1 { font-size: 1.25rem; color: #ef4444; margin: 0 0 0.75rem; }
    p { font-size: 0.875rem; line-height: 1.5; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
