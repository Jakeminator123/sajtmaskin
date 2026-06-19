import { NextResponse } from "next/server";

/**
 * Native-backed preview adapter for the ported studio.
 *
 * `siteId` == engine chatId. Locally we serve the static-HTML compatibility
 * shim (`/api/preview-render`, enabled via SAJTMASKIN_SHIM_PREVIEW_DISABLED=false)
 * so the studio iframe can render the generated site without the tier-2 Fly VM.
 * In an environment with a preview-host configured, this can be upgraded to the
 * native preview-session.
 */
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await ctx.params;
  if (!siteId) {
    return NextResponse.json({ error: "siteId krävs." }, { status: 400 });
  }
  const url = `/api/preview-render?chatId=${encodeURIComponent(siteId)}`;
  return NextResponse.json({
    url,
    status: "ready",
    kind: "shim",
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await ctx.params;
  return NextResponse.json({
    url: `/api/preview-render?chatId=${encodeURIComponent(siteId)}`,
    status: "ready",
    kind: "shim",
  });
}
