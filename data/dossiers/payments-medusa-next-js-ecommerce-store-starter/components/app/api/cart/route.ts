import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { medusaFetch } from "../../../lib/medusa";

const CART_COOKIE = "medusa_cart_id";

export async function POST() {
  const cookieStore = await cookies();
  const existingCartId = cookieStore.get(CART_COOKIE)?.value;

  if (existingCartId) {
    return NextResponse.json({ cartId: existingCartId });
  }

  const data = await medusaFetch<{ cart: { id: string } }>("/store/carts", {
    method: "POST",
    body: JSON.stringify({}),
  });

  cookieStore.set(CART_COOKIE, data.cart.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return NextResponse.json({ cartId: data.cart.id });
}
