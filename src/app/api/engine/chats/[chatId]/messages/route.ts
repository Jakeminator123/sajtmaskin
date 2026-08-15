import { NextResponse } from "next/server";

/**
 * `POST /api/engine/chats/[chatId]/messages` is not a codegen path.
 *
 * Follow-up codegen is `POST /api/engine/chats/[chatId]/stream` (`maxDuration = 950`).
 * The previous handler ran that same pipeline without a duration budget,
 * so Vercel killed it with 504 after the platform default (~30s) while a
 * real follow-up takes 47–405s. Leftover callers get a fast, honest 405
 * instead of a second billed job that cannot finish.
 */
export async function POST(_req: Request): Promise<Response> {
  return NextResponse.json(
    {
      error:
        "POST /api/engine/chats/[chatId]/messages is not a codegen path. Use POST /api/engine/chats/[chatId]/stream.",
      code: "use_streaming_send",
    },
    { status: 405 },
  );
}
