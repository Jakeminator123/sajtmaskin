import { findProduct, products } from "./product-catalog";

export type CartItem = { id: string; quantity: number };
export const MAX_QUANTITY = 99;
// v1 contained starter-generated purchases and full product/price snapshots.
// Leave that unrelated legacy data untouched; v2 starts empty and stores only ids/quantities.
export const CART_STORAGE_KEY = "sajtmaskin-demo-cart:v2";

export function readCartStorage(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > products.length) return [];
    const seen = new Set<string>();
    for (const row of value) {
      if (
        !row ||
        typeof row !== "object" ||
        typeof row.id !== "string" ||
        !findProduct(row.id) ||
        !Number.isInteger(row.quantity) ||
        row.quantity < 1 ||
        row.quantity > MAX_QUANTITY ||
        seen.has(row.id)
      )
        return [];
      seen.add(row.id);
    }
    // Never trust browser-stored names or prices, even when the ids are valid.
    return value.map((row) => ({ id: row.id, quantity: row.quantity }));
  } catch {
    return [];
  }
}

export function changeCartQuantity(items: CartItem[], id: string, delta: number): CartItem[] {
  if (!findProduct(id) || !Number.isInteger(delta)) return items;
  const existing = items.find((item) => item.id === id);
  const quantity = Math.max(0, Math.min(MAX_QUANTITY, (existing?.quantity ?? 0) + delta));
  if (!existing) return quantity ? [...items, { id, quantity }] : items;
  return items.flatMap((item) => (item.id !== id ? [item] : quantity ? [{ id, quantity }] : []));
}

export function cartTotals(items: CartItem[]) {
  return items.reduce(
    (total, item) => ({
      count: total.count + item.quantity,
      priceMinor: total.priceMinor + (findProduct(item.id)?.priceMinor ?? 0) * item.quantity,
    }),
    { count: 0, priceMinor: 0 },
  );
}
