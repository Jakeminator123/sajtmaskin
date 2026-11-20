/**
 * Projekttaket när ett tomt projekt får sin första chatt (SM-133).
 *
 * Tomma projekt räknas inte mot taket (`startedProjectCondition`), så taket
 * måste hålla där ett tomt projekt blir startat: vid första chatten i varje
 * väg som skapar en (bygget i `create-chat-stream-post.ts`, importen i
 * `/api/engine/chats/init` och mallen i `/api/template`). Utan det kunde ett
 * gratiskonto med 7 av 8 öppna flera builder-flikar och bygga i alla.
 *
 * - `checkProjectCapForFirstChat` är den snabba kontrollen innan något dyrt
 *   görs (brief, krediter, nedladdning). Den låser inget.
 * - `createFirstChatWithinProjectCap` gör kontrollen och chattens INSERT i samma
 *   transaktion, under ett advisory-lås per ägare. Två flikar som startar
 *   samtidigt köas därför på låset, och den andra ser den förstas chatt.
 *
 * Ett projekt som redan är startat passerar alltid: en ny chatt i ett befintligt
 * projekt gör det inte till ett nytt projekt.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appProjects } from "@/lib/db/schema";
import { startedProjectCondition } from "@/lib/db/services/project-started";
import { canCreateProject } from "./project-cleanup";
import type { ProjectCapCheck, ProjectCapOwner, ProjectLimitDenial } from "./project-limit";

type ReadDatabase = Pick<typeof db, "select">;
type ChatWriteDatabase = Pick<typeof db, "select" | "insert">;

async function isStartedProject(projectId: string, database: ReadDatabase): Promise<boolean> {
  const rows = await database
    .select({ id: appProjects.id })
    .from(appProjects)
    .where(and(eq(appProjects.id, projectId), startedProjectCondition()))
    .limit(1);
  return rows.length > 0;
}

/**
 * Får `projectId` sin första chatt utan att ägaren går över taket? `null` betyder
 * att vägen skapar ett nytt projekt, som då räknas som tomt.
 */
export async function checkProjectCapForFirstChat(
  projectId: string | null,
  owner: ProjectCapOwner,
  database: ReadDatabase = db,
): Promise<ProjectCapCheck> {
  if (projectId && (await isStartedProject(projectId, database))) return { allowed: true };
  // Det tomma projektet räknas inte själv, så `current` är ägarens startade
  // projekt utöver det här. Samma regel och samma besked som vid skapande.
  const cap = await canCreateProject(owner.userId, owner.sessionId, owner.isPaidUser, database);
  if (cap.allowed) return { allowed: true };
  return {
    allowed: false,
    reason: cap.reason ?? "Projektgränsen har nåtts.",
    limit: cap.limit,
    current: cap.current,
  };
}

function ownerLockKey(owner: ProjectCapOwner): string | null {
  if (owner.userId) return `project-cap:user:${owner.userId}`;
  if (owner.sessionId) return `project-cap:session:${owner.sessionId}`;
  return null;
}

/**
 * Skapar projektets första chatt bara om taket tillåter det, i samma
 * transaktion som kontrollen. `createChat` får transaktionen och ska skriva
 * chatten genom den.
 */
export async function createFirstChatWithinProjectCap<T>(params: {
  projectId: string;
  owner: ProjectCapOwner;
  createChat: (database: ChatWriteDatabase) => Promise<T>;
}): Promise<{ status: "created"; chat: T } | { status: "project_limit"; denial: ProjectLimitDenial }> {
  const lockKey = ownerLockKey(params.owner);
  return db.transaction(async (tx) => {
    if (lockKey) {
      // Håller bara under transaktionen: kontroll + INSERT, inget annat.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    }
    const check = await checkProjectCapForFirstChat(params.projectId, params.owner, tx);
    if (!check.allowed) return { status: "project_limit" as const, denial: check };
    return { status: "created" as const, chat: await params.createChat(tx) };
  });
}
