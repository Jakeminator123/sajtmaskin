import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { domainOrders } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

export async function saveDomainOrder(order: {
  id: string;
  project_id: string;
  domain: string;
  order_id: string | null;
  customer_price: number;
  vercel_cost: number;
  currency: string;
  status: string;
  years: number;
  domain_added_to_project: boolean;
}): Promise<void> {
  assertDbConfigured();
  const now = new Date();
  await db.insert(domainOrders).values({
    ...order,
    created_at: now,
    updated_at: now,
  });
}

export async function updateDomainOrderStatus(
  orderId: string,
  status: string,
  vercelOrderId?: string,
  domainAdded?: boolean,
): Promise<void> {
  assertDbConfigured();
  await db
    .update(domainOrders)
    .set({
      status,
      order_id: vercelOrderId ?? null,
      domain_added_to_project: domainAdded ?? false,
      updated_at: new Date(),
    })
    .where(eq(domainOrders.id, orderId));
}
