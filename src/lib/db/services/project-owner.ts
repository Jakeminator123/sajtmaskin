import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

type OwnerDatabase = Pick<typeof db, "select" | "insert" | "update">;

export class ProjectOwnerNotFoundError extends Error {
  constructor() {
    super("Project owner account no longer exists");
    this.name = "ProjectOwnerNotFoundError";
  }
}

/** Hold through the project write: KEY SHARE conflicts with account DELETE /
 * FOR UPDATE, so an already-authenticated waiting request rechecks existence. */
export async function lockProjectOwner(tx: Pick<typeof db, "select">, userId: string) {
  const [owner] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("key share");
  if (!owner) throw new ProjectOwnerNotFoundError();
}

export async function withProjectOwner<T>(
  userId: string | null | undefined,
  write: (tx: OwnerDatabase) => Promise<T>,
): Promise<T> {
  if (userId == null || userId === "") return write(db);
  return db.transaction(async (tx) => {
    await lockProjectOwner(tx, userId);
    return write(tx);
  });
}
