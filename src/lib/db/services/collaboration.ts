import { desc, eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { versionComments, versionApprovals } from "@/lib/db/schema";
import { assertDbConfigured } from "./shared";

type CreateCommentParams = {
  versionId: string;
  chatId: string;
  userId?: string | null;
  authorName?: string | null;
  content: string;
};

export async function createComment(params: CreateCommentParams) {
  assertDbConfigured();
  const id = nanoid();
  const now = new Date();
  const [row] = await db
    .insert(versionComments)
    .values({
      id,
      versionId: params.versionId,
      chatId: params.chatId,
      userId: params.userId ?? null,
      authorName: params.authorName ?? null,
      content: params.content,
      resolved: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return row;
}

export async function getCommentsForVersion(versionId: string) {
  assertDbConfigured();
  return db
    .select()
    .from(versionComments)
    .where(eq(versionComments.versionId, versionId))
    .orderBy(desc(versionComments.createdAt));
}

export async function resolveComment(commentId: string) {
  assertDbConfigured();
  const [row] = await db
    .update(versionComments)
    .set({ resolved: true, updatedAt: new Date() })
    .where(eq(versionComments.id, commentId))
    .returning();
  return row ?? null;
}

export async function requestApproval(versionId: string, chatId: string, params?: { userId?: string | null; approverName?: string | null }) {
  assertDbConfigured();
  const id = nanoid();
  const [row] = await db
    .insert(versionApprovals)
    .values({
      id,
      versionId,
      chatId,
      userId: params?.userId ?? null,
      approverName: params?.approverName ?? null,
      status: "pending",
      comment: null,
    })
    .returning();
  return row;
}

type ApprovalStatus = "pending" | "approved" | "rejected" | "changes_requested";

export async function submitApproval(
  approvalId: string,
  status: ApprovalStatus,
  comment?: string | null,
) {
  assertDbConfigured();
  const [row] = await db
    .update(versionApprovals)
    .set({ status, comment: comment ?? null })
    .where(eq(versionApprovals.id, approvalId))
    .returning();
  return row ?? null;
}

export async function getApprovalStatus(versionId: string) {
  assertDbConfigured();
  const rows = await db
    .select()
    .from(versionApprovals)
    .where(eq(versionApprovals.versionId, versionId))
    .orderBy(desc(versionApprovals.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUnresolvedCommentCount(versionId: string): Promise<number> {
  assertDbConfigured();
  const rows = await db
    .select({ id: versionComments.id })
    .from(versionComments)
    .where(
      and(
        eq(versionComments.versionId, versionId),
        eq(versionComments.resolved, false),
      ),
    );
  return rows.length;
}

