import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";

/** @deprecated Compat stub — V0 Platform integration removed. Returns 501. */
const GONE =
  "V0 Platform Vercel project linking is removed. Connect projects via the Sajtmaskin builder and Vercel deploy flow.";

/** @deprecated Compat stub — returns 501. */
export async function GET(req: Request) {
  return withRateLimit(req, "integrations:vercel:projects:find", async () => {
    return NextResponse.json({ error: GONE }, { status: 501 });
  });
}

/** @deprecated Compat stub — returns 501. */
export async function POST(req: Request) {
  return withRateLimit(req, "integrations:vercel:projects:create", async () => {
    return NextResponse.json({ error: GONE }, { status: 501 });
  });
}
