import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { guestUsage } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

export async function getOrCreateGuestUsage(sessionId: string) {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(guestUsage)
    .where(eq(guestUsage.session_id, sessionId))
    .limit(1);

  if (rows[0]) return rows[0];

  const now = new Date();
  const created = await db
    .insert(guestUsage)
    .values({
      session_id: sessionId,
      generations_used: 0,
      refines_used: 0,
      created_at: now,
      updated_at: now,
    })
    .returning();

  return created[0];
}

export async function incrementGuestUsage(sessionId: string, type: "generate" | "refine") {
  assertDbConfigured();
  const now = new Date();
  const updateFields =
    type === "generate"
      ? { generations_used: sql`${guestUsage.generations_used} + 1` }
      : { refines_used: sql`${guestUsage.refines_used} + 1` };

  const rows = await db
    .insert(guestUsage)
    .values({
      session_id: sessionId,
      generations_used: type === "generate" ? 1 : 0,
      refines_used: type === "refine" ? 1 : 0,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: guestUsage.session_id,
      set: {
        ...updateFields,
        updated_at: now,
      },
    })
    .returning();

  return rows[0];
}
