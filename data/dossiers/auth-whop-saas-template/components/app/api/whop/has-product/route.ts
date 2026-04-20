import { NextRequest, NextResponse } from "next/server";
import { getWhopServerSdk } from "@/lib/get-user-sdk/server";
import { hasWhopProductAccess } from "@/lib/has-product";

export async function POST(req: NextRequest) {
  const { sdk } = await getWhopServerSdk();

  if (!sdk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const allowedProducts = body.allowedProducts ?? process.env.NEXT_PUBLIC_REQUIRED_PRODUCT ?? "";
  const membership = await hasWhopProductAccess(sdk as never, allowedProducts);

  return NextResponse.json({ membership });
}
