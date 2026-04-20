import { commerce } from "./commerce";
import { getCartCookieJson } from "./cookies";

export async function getInitialCart() {
  const cartCookie = await getCartCookieJson();

  if (!cartCookie?.id) {
    return { cart: null, cartId: null };
  }

  try {
    const cart = await commerce.cartGet({ cartId: cartCookie.id });
    return { cart: cart ?? null, cartId: cartCookie.id };
  } catch {
    return { cart: null, cartId: cartCookie.id };
  }
}
