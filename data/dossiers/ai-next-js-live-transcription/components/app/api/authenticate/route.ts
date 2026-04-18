import { DeepgramError, createClient } from "@deepgram/sdk";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing DEEPGRAM_API_KEY" },
      { status: 500 }
    );
  }

  if (process.env.DEEPGRAM_ENV === "development") {
    return NextResponse.json({ key: apiKey });
  }

  const deepgram = createClient(apiKey);
  const { result, error } = await deepgram.auth.grantToken();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Failed to generate temporary token" },
      { status: 500 }
    );
  }

  if (!result) {
    return NextResponse.json(
      {
        error: new DeepgramError(
          "Failed to generate temporary token. Make sure the API key has Member scope or higher."
        ).message,
      },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ ...result, requestUrl: request.url });
  response.headers.set("Surrogate-Control", "no-store");
  response.headers.set(
    "Cache-Control",
    "s-maxage=0, no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  response.headers.set("Expires", "0");

  return response;
}
