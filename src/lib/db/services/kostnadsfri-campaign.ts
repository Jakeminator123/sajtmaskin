import { and, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import {
  appProjects,
  engineChats,
  generationBillings,
  kostnadsfriCampaignEntitlements,
  kostnadsfriPages,
} from "@/lib/db/schema";
import {
  isPageAccessible,
  kostnadsfriPasswordSlugs,
  pickKostnadsfriPageForSlug,
} from "@/lib/kostnadsfri";
import { verifyKostnadsfriCampaignReceipt } from "@/lib/kostnadsfri/campaign-receipt";
import { assertDbConfigured } from "./shared";

export type KostnadsfriCampaignPhase = "initial" | "followup";
export type KostnadsfriCampaignRequestedPhase = KostnadsfriCampaignPhase | "continuation";

export type KostnadsfriCampaignBenefit = {
  entitlementId: string;
  phase: KostnadsfriCampaignPhase;
};

export type KostnadsfriCampaignPolicy = {
  entitlementId: string;
  benefit: KostnadsfriCampaignBenefit | null;
};

export function resolveKostnadsfriCampaignPhase(input: {
  requestedPhase: KostnadsfriCampaignRequestedPhase;
  chatId?: string | null;
  initialChatId?: string | null;
  initialVersionId?: string | null;
}): KostnadsfriCampaignPhase | null {
  const phase: KostnadsfriCampaignPhase =
    input.requestedPhase === "continuation"
      ? input.initialVersionId
        ? "followup"
        : "initial"
      : input.requestedPhase;
  if (phase === "initial") {
    if (input.initialVersionId) return null;
    return input.chatId
      ? input.initialChatId === input.chatId
        ? "initial"
        : null
      : input.initialChatId
        ? null
        : "initial";
  }
  return input.chatId && input.initialChatId === input.chatId && input.initialVersionId
    ? "followup"
    : null;
}

export type KostnadsfriCampaignReservedSlot = {
  phase: KostnadsfriCampaignPhase;
  versionId: string;
  chatId: string;
};

export type KostnadsfriCampaignRestoredSlots = {
  initialChatId: string | null;
  initialVersionId: string | null;
  followupVersionId: string | null;
};

/**
 * A successful finalize writes the campaign completion marker before
 * settlement can copy version ids onto the entitlement. Later benefit
 * checks must treat that marker as the consumed init/follow-up so a
 * retry of settlement cannot spend a second init or hide the follow-up.
 */
export function restoreKostnadsfriCampaignSlotsFromMarkers(input: {
  initialChatId?: string | null;
  initialVersionId?: string | null;
  followupVersionId?: string | null;
  reservedSlots: KostnadsfriCampaignReservedSlot[];
}): KostnadsfriCampaignRestoredSlots {
  const initialMarker = input.reservedSlots.find((slot) => slot.phase === "initial");
  const followupMarker = input.reservedSlots.find((slot) => slot.phase === "followup");
  return {
    initialChatId: input.initialChatId ?? initialMarker?.chatId ?? null,
    initialVersionId: input.initialVersionId ?? initialMarker?.versionId ?? null,
    followupVersionId: input.followupVersionId ?? followupMarker?.versionId ?? null,
  };
}

export function decideKostnadsfriCampaignBenefit(input: {
  entitlementId: string;
  requestedPhase: KostnadsfriCampaignRequestedPhase;
  chatId?: string | null;
  initialChatId?: string | null;
  initialVersionId?: string | null;
  followupVersionId?: string | null;
  reservedSlots: KostnadsfriCampaignReservedSlot[];
}): {
  restored: KostnadsfriCampaignRestoredSlots;
  needsRestore: boolean;
  phase: KostnadsfriCampaignPhase | null;
  benefit: KostnadsfriCampaignBenefit | null;
} {
  const restored = restoreKostnadsfriCampaignSlotsFromMarkers({
    initialChatId: input.initialChatId,
    initialVersionId: input.initialVersionId,
    followupVersionId: input.followupVersionId,
    reservedSlots: input.reservedSlots,
  });
  const needsRestore =
    restored.initialChatId !== (input.initialChatId ?? null) ||
    restored.initialVersionId !== (input.initialVersionId ?? null) ||
    restored.followupVersionId !== (input.followupVersionId ?? null);
  const phase = resolveKostnadsfriCampaignPhase({
    requestedPhase: input.requestedPhase,
    chatId: input.chatId,
    initialChatId: restored.initialChatId,
    initialVersionId: restored.initialVersionId,
  });
  if (!phase) {
    return { restored, needsRestore, phase: null, benefit: null };
  }
  if (input.reservedSlots.some((slot) => slot.phase === phase)) {
    return { restored, needsRestore, phase, benefit: null };
  }
  if (phase === "followup" && restored.followupVersionId) {
    return { restored, needsRestore, phase, benefit: null };
  }
  return {
    restored,
    needsRestore,
    phase,
    benefit: { entitlementId: input.entitlementId, phase },
  };
}

/**
 * Pins the invitation to the chat created by the admitted initial request.
 * This is a retry binding, not consumption: the initial slot is claimed only
 * when settlement records a successful version.
 */
export async function bindKostnadsfriCampaignInitialChat(input: {
  entitlementId: string;
  projectId: string;
  userId: string;
  chatId: string;
}): Promise<boolean> {
  assertDbConfigured();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(kostnadsfriCampaignEntitlements)
      .where(eq(kostnadsfriCampaignEntitlements.id, input.entitlementId))
      .limit(1)
      .for("update");
    const entitlement = rows[0];
    if (
      !entitlement ||
      entitlement.project_id !== input.projectId ||
      entitlement.user_id !== input.userId ||
      entitlement.initial_version_id ||
      (entitlement.initial_chat_id && entitlement.initial_chat_id !== input.chatId)
    ) {
      return false;
    }

    const chats = await tx
      .select({ projectId: engineChats.projectId })
      .from(engineChats)
      .where(eq(engineChats.id, input.chatId))
      .limit(1);
    if (chats[0]?.projectId !== input.projectId) return false;

    if (!entitlement.initial_chat_id) {
      await tx
        .update(kostnadsfriCampaignEntitlements)
        .set({ initial_chat_id: input.chatId, updated_at: new Date() })
        .where(eq(kostnadsfriCampaignEntitlements.id, entitlement.id));
    }
    return true;
  });
}

type Entitlement = typeof kostnadsfriCampaignEntitlements.$inferSelect;

function canReuseBinding(
  entitlement: Entitlement,
  input: { projectId: string; userId: string | null; sessionId: string },
): boolean {
  if (entitlement.project_id !== input.projectId) return false;
  if (entitlement.user_id) return entitlement.user_id === input.userId;
  return entitlement.session_id === input.sessionId;
}

/**
 * Redeems a password verification for one project. The signed receipt is
 * scoped to the anonymous session; source/slug values from the browser never
 * create an entitlement on their own.
 */
export async function bindVerifiedKostnadsfriCampaign(input: {
  receipt: string | null;
  invitationSlug: string;
  projectId: string;
  userId: string | null;
  sessionId: string;
}): Promise<KostnadsfriCampaignBenefit | null> {
  assertDbConfigured();
  if (
    !verifyKostnadsfriCampaignReceipt(input.receipt, {
      slug: input.invitationSlug,
      sessionId: input.sessionId,
    })
  ) {
    return null;
  }

  return db.transaction(async (tx) => {
    const projectRows = await tx
      .select()
      .from(appProjects)
      .where(eq(appProjects.id, input.projectId))
      .limit(1)
      .for("update");
    const project = projectRows[0];
    const ownsProject = project?.user_id
      ? project.user_id === input.userId
      : project?.session_id === input.sessionId;
    if (!project || !ownsProject) return null;

    const pageRows = await tx
      .select()
      .from(kostnadsfriPages)
      .where(inArray(kostnadsfriPages.slug, kostnadsfriPasswordSlugs(input.invitationSlug)));
    const page = pickKostnadsfriPageForSlug(pageRows, input.invitationSlug);
    if (page && !isPageAccessible(page).accessible) return null;

    const existingRows = await tx
      .select()
      .from(kostnadsfriCampaignEntitlements)
      .where(eq(kostnadsfriCampaignEntitlements.invitation_slug, input.invitationSlug))
      .limit(1)
      .for("update");
    let entitlement = existingRows[0] ?? null;

    if (!entitlement) {
      const insertedRows = await tx
        .insert(kostnadsfriCampaignEntitlements)
        .values({
          id: nanoid(),
          invitation_slug: input.invitationSlug,
          kostnadsfri_page_id: page?.id ?? null,
          project_id: input.projectId,
          user_id: project.user_id ?? null,
          session_id: input.sessionId,
        })
        .onConflictDoNothing({ target: kostnadsfriCampaignEntitlements.invitation_slug })
        .returning();
      entitlement = insertedRows[0] ?? null;
      if (!entitlement) {
        const racedRows = await tx
          .select()
          .from(kostnadsfriCampaignEntitlements)
          .where(eq(kostnadsfriCampaignEntitlements.invitation_slug, input.invitationSlug))
          .limit(1)
          .for("update");
        entitlement = racedRows[0] ?? null;
      }
    }

    if (!entitlement || !canReuseBinding(entitlement, input)) return null;
    if (!entitlement.user_id && project.user_id) {
      const updatedRows = await tx
        .update(kostnadsfriCampaignEntitlements)
        .set({ user_id: project.user_id, updated_at: new Date() })
        .where(
          and(
            eq(kostnadsfriCampaignEntitlements.id, entitlement.id),
            isNull(kostnadsfriCampaignEntitlements.user_id),
          ),
        )
        .returning();
      entitlement = updatedRows[0] ?? entitlement;
    }

    return { entitlementId: entitlement.id, phase: "initial" };
  });
}

/**
 * Returns a policy for every campaign-bound project, including exhausted or
 * wrong-chat slots. That distinction prevents the account's general first-free
 * entitlement from being spent as an accidental third campaign generation.
 */
export async function getKostnadsfriCampaignPolicy(input: {
  projectId: string;
  userId: string;
  sessionId?: string | null;
  phase: KostnadsfriCampaignRequestedPhase;
  chatId?: string | null;
}): Promise<KostnadsfriCampaignPolicy | null> {
  assertDbConfigured();
  return db.transaction(async (tx) => {
    const projects = await tx
      .select({ userId: appProjects.user_id })
      .from(appProjects)
      .where(eq(appProjects.id, input.projectId))
      .limit(1);
    if (projects[0]?.userId !== input.userId) return null;

    const rows = await tx
      .select()
      .from(kostnadsfriCampaignEntitlements)
      .where(eq(kostnadsfriCampaignEntitlements.project_id, input.projectId))
      .limit(1)
      .for("update");
    let entitlement = rows[0];
    if (!entitlement) return null;
    const unavailablePolicy = (): KostnadsfriCampaignPolicy => ({
      entitlementId: entitlement.id,
      benefit: null,
    });
    if (entitlement.user_id && entitlement.user_id !== input.userId) {
      return unavailablePolicy();
    }
    if (!entitlement.user_id) {
      if (!input.sessionId || entitlement.session_id !== input.sessionId) {
        return unavailablePolicy();
      }
      const claimed = await tx
        .update(kostnadsfriCampaignEntitlements)
        .set({ user_id: input.userId, updated_at: new Date() })
        .where(
          and(
            eq(kostnadsfriCampaignEntitlements.id, entitlement.id),
            isNull(kostnadsfriCampaignEntitlements.user_id),
          ),
        )
        .returning();
      entitlement = claimed[0] ?? entitlement;
    }

    const reservedRows = await tx
      .select({
        phase: generationBillings.campaign_phase,
        versionId: generationBillings.version_id,
        chatId: generationBillings.chat_id,
      })
      .from(generationBillings)
      .where(eq(generationBillings.campaign_entitlement_id, entitlement.id));
    const reservedSlots = reservedRows.filter(
      (row): row is KostnadsfriCampaignReservedSlot =>
        row.phase === "initial" || row.phase === "followup",
    );
    const decision = decideKostnadsfriCampaignBenefit({
      entitlementId: entitlement.id,
      requestedPhase: input.phase,
      chatId: input.chatId,
      initialChatId: entitlement.initial_chat_id,
      initialVersionId: entitlement.initial_version_id,
      followupVersionId: entitlement.followup_version_id,
      reservedSlots,
    });
    if (decision.needsRestore) {
      const now = new Date();
      const restoredRows = await tx
        .update(kostnadsfriCampaignEntitlements)
        .set({
          initial_chat_id: decision.restored.initialChatId,
          initial_version_id: decision.restored.initialVersionId,
          initial_claimed_at: decision.restored.initialVersionId
            ? (entitlement.initial_claimed_at ?? now)
            : entitlement.initial_claimed_at,
          followup_version_id: decision.restored.followupVersionId,
          followup_claimed_at: decision.restored.followupVersionId
            ? (entitlement.followup_claimed_at ?? now)
            : entitlement.followup_claimed_at,
          updated_at: now,
        })
        .where(eq(kostnadsfriCampaignEntitlements.id, entitlement.id))
        .returning();
      entitlement = restoredRows[0] ?? entitlement;
    }
    if (!decision.benefit) return unavailablePolicy();

    return {
      entitlementId: entitlement.id,
      benefit: decision.benefit,
    };
  });
}
