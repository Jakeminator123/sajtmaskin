import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { medusaFetch } from "../../../../lib/medusa";

const CART_COOKIE = "medusa_cart_id";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const cartId = cookieStore.get(CART_COOKIE)?.value;

  if (!cartId) {
    return NextResponse.json({ error: "Missing cart" }, { status: 400 });
  }

  const body = await request.json();
  const { variant_id, quantity } = body;

  if (!variant_id || !quantity) {
    return NextResponse.json({ error: "variant_id and quantity are required" }, { status: 400 });
  }

  const data = await medusaFetch<{ cart: unknown }>(`/store/carts/${cartId}/line-items`, {
    method: "POST",
    body: JSON.stringify({ variant_id, quantity }),
  });

  return NextResponse.json(data);
}
