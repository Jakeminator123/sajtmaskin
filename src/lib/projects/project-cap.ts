/**
 * Projekttaket när ett projekt får sin första chatt (SM-133).
 *
 * Tomma projekt räknas inte när ett nytt projekt skapas, så taket måste hålla
 * där ett projekt får sitt första bygge: vid första chatten i varje väg som
 * skapar en (bygget i `create-chat-stream-post.ts`, importen i
 * `/api/engine/chats/init` och mallen i `/api/template`).
 *
 * Regeln: ett konto kan aldrig bygga i fler projekt än taket.
 * - Ett projekt som redan HAR en chatt passerar alltid: en ny chatt i ett byggt
 *   projekt gör det inte till ett nytt projekt.
 * - Ett projekt utan chatt prövas mot taket, oavsett vilket annat innehåll det
 *   har (företagsuppgifter, miljövariabler, uppladdningar). Annars kunde ett
 *   konto fylla nio tomma projekt med inställningar och sedan bygga i alla.
 * - Mot taket räknas ägarens BYGGDA projekt utom det här
 *   (`builtProjectCondition`). Eget innehåll utan bygge räknas inte, så ett
 *   konto som har byggt i färre projekt än taket nekas aldrig.
 *
 * - `checkProjectCapForFirstChat` är den snabba kontrollen innan något dyrt
 *   görs (brief, krediter, nedladdning). Den låser inget.
 * - `createFirstChatWithinProjectCap` gör kontrollen och chattens INSERT i samma
 *   transaktion, under ett advisory-lås per ägare, och nollar ägarens
 *   `/projects`-cache efter commit. Två flikar som startar samtidigt köas därför
 *   på låset, och den andra ser den förstas chatt.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { engineChats } from "@/lib/db/schema";
import { canCreateProject } from "./project-cleanup";
import { invalidateProjectListCache } from "./project-list-cache";
import type { ProjectCapCheck, ProjectCapOwner, ProjectLimitDenial } from "./project-limit";

type ReadDatabase = Pick<typeof db, "select">;
type ChatWriteDatabase = Pick<typeof db, "select" | "insert">;

async function hasChat(projectId: string, database: ReadDatabase): Promise<boolean> {
  const rows = await database
    .select({ id: engineChats.id })
    .from(engineChats)
    .where(eq(engineChats.projectId, projectId))
    .limit(1);
  return rows.length > 0;
}

/**
 * Får `projectId` sin första chatt utan att ägaren bygger i fler projekt än
 * taket? `null` betyder att vägen skapar ett nytt projekt.
 */
export async function checkProjectCapForFirstChat(
  projectId: string | null,
  owner: ProjectCapOwner,
  database: ReadDatabase = db,
): Promise<ProjectCapCheck> {
  if (projectId && (await hasChat(projectId, database))) return { allowed: true };
  // Ägarens byggda projekt utom det här. Samma gräns och samma besked som när
  // ett projekt skapas.
  const cap = await canCreateProject(owner.userId, owner.sessionId, owner.isPaidUser, database, {
    counted: "built",
    excludeProjectId: projectId,
  });
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
 * chatten genom den. Efter commit nollas ägarens listcache, eftersom projektet
 * nu syns i `/projects`.
 */
export async function createFirstChatWithinProjectCap<T>(params: {
  projectId: string;
  owner: ProjectCapOwner;
  createChat: (database: ChatWriteDatabase) => Promise<T>;
}): Promise<{ status: "created"; chat: T } | { status: "project_limit"; denial: ProjectLimitDenial }> {
  const lockKey = ownerLockKey(params.owner);
  const result = await db.transaction(async (tx) => {
    if (lockKey) {
      // Håller bara under transaktionen: kontroll + INSERT, inget annat.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    }
    const check = await checkProjectCapForFirstChat(params.projectId, params.owner, tx);
    if (!check.allowed) return { status: "project_limit" as const, denial: check };
    return { status: "created" as const, chat: await params.createChat(tx) };
  });
  if (result.status === "created") {
    // Efter commit, för alla tre vägarna. Fire-and-forget: deleteCache kastar
    // aldrig och anroparen väntar inte på Redis.
    void invalidateProjectListCache(params.owner.userId, params.owner.sessionId);
  }
  return result;
}
