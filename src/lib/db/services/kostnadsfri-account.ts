import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  appProjects,
  kostnadsfriCampaignEntitlements,
  mediaLibrary,
  promptHandoffs,
  users,
} from "@/lib/db/schema";
import {
  KOSTNADSFRI_CAMPAIGN_CLAIMED_PROVIDER,
  KOSTNADSFRI_CAMPAIGN_PROVIDER,
} from "@/lib/kostnadsfri/campaign-account";
import { assertDbConfigured, type User } from "./shared";

/**
 * Hämtar eller skapar sidans kampanjkonto. Raden kan redan finnas med en annan
 * provider (sparad, eller i värsta fall en registrerad adress) — anroparen
 * loggar bara in när providern är `kostnadsfri`.
 *
 * Kontot får inga credits och ingen allmän första gratisgenerering: kampanjens
 * init + uppföljning är förmånen, och ett sparat konto får sin egen.
 */
export async function findOrCreateKostnadsfriCampaignUser(input: {
  email: string;
  companyName: string;
}): Promise<User> {
  assertDbConfigured();
  const now = new Date();
  await db
    .insert(users)
    .values({
      id: nanoid(),
      email: input.email,
      password_hash: null,
      name: input.companyName.trim() || null,
      provider: KOSTNADSFRI_CAMPAIGN_PROVIDER,
      diamonds: 0,
      free_generation_available: false,
      email_verified: false,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing({ target: users.email });
  const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  const user = rows[0];
  if (!user) throw new Error("Campaign account row missing after insert");
  return user;
}

export type CampaignAccountTransferResult =
  | { status: "transferred"; projects: number }
  | { status: "already_claimed" }
  | { status: "not_campaign" };

/**
 * Flyttar kampanjkontots projekt (och det som hör till dem) till kundens egna
 * konto och markerar kampanjkontot som sparat, så att länklösenordet slutar
 * logga in. Raden låses så att två samtidiga sparanden inte delar projekten.
 */
export async function transferKostnadsfriCampaignAccount(input: {
  campaignUserId: string;
  targetUserId: string;
}): Promise<CampaignAccountTransferResult> {
  assertDbConfigured();
  if (input.campaignUserId === input.targetUserId) return { status: "not_campaign" };
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ provider: users.provider })
      .from(users)
      .where(eq(users.id, input.campaignUserId))
      .limit(1)
      .for("update");
    const provider = rows[0]?.provider;
    if (provider === KOSTNADSFRI_CAMPAIGN_CLAIMED_PROVIDER) return { status: "already_claimed" };
    if (provider !== KOSTNADSFRI_CAMPAIGN_PROVIDER) return { status: "not_campaign" };

    const now = new Date();
    const moved = await tx
      .update(appProjects)
      .set({ user_id: input.targetUserId, updated_at: now })
      .where(eq(appProjects.user_id, input.campaignUserId))
      .returning({ id: appProjects.id });
    await tx
      .update(kostnadsfriCampaignEntitlements)
      .set({ user_id: input.targetUserId, updated_at: now })
      .where(eq(kostnadsfriCampaignEntitlements.user_id, input.campaignUserId));
    await tx
      .update(promptHandoffs)
      .set({ user_id: input.targetUserId })
      .where(eq(promptHandoffs.user_id, input.campaignUserId));
    await tx
      .update(mediaLibrary)
      .set({ user_id: input.targetUserId })
      .where(eq(mediaLibrary.user_id, input.campaignUserId));
    await tx
      .update(users)
      .set({ provider: KOSTNADSFRI_CAMPAIGN_CLAIMED_PROVIDER, updated_at: now })
      .where(eq(users.id, input.campaignUserId));
    return { status: "transferred", projects: moved.length };
  });
}
