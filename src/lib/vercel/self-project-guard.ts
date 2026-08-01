import fs from "node:fs";
import path from "node:path";

/**
 * Guard so an admin action can never delete Sajtmaskin's OWN Vercel project.
 *
 * Background: the admin UI used to expose "MEGA CLEANUP" and "Rensa
 * Vercel-projekt", both of which listed every project the access token could see
 * and deleted all of them — including the project that hosts Sajtmaskin itself.
 * The bulk buttons are gone, and this guard makes the remaining per-project
 * delete path fail closed instead of relying on the operator picking the right row.
 *
 * **Fails closed on unknown identity** (Codex P1 on #611): when a Vercel token is
 * configured but the self project id cannot be resolved, every project would
 * otherwise be classified as "not self" — which reintroduces exactly the
 * production self-deletion this guard exists to prevent. In that state deletion
 * is refused entirely until the id can be resolved.
 *
 * Kept dependency-free so both API routes and tests can use it directly.
 */

export type SelfProjectIdSource = "env" | "vercel-link";

export interface SelfProjectIdentity {
  /** Sajtmaskin's own project id, or `null` when it cannot be determined. */
  id: string | null;
  /** Where the id came from — `null` when unresolved. */
  source: SelfProjectIdSource | null;
}

function readLinkedProjectId(): string | null {
  // Local, `vercel link`-ed checkouts keep the ids in a gitignored `.vercel/`
  // directory (see .cursor/rules/local-tooling-mcp.mdc). Absent in serverless runtimes, so this
  // is strictly a best-effort fallback — never a requirement.
  const candidates: { file: string; pick: (data: unknown) => string | null }[] = [
    {
      file: "project.json",
      pick: (data) => {
        const id = (data as { projectId?: unknown } | null)?.projectId;
        return typeof id === "string" && id.trim() ? id.trim() : null;
      },
    },
    {
      file: "repo.json",
      pick: (data) => {
        const projects = (data as { projects?: unknown } | null)?.projects;
        if (!Array.isArray(projects)) return null;
        for (const project of projects) {
          const id = (project as { id?: unknown } | null)?.id;
          if (typeof id === "string" && id.trim()) return id.trim();
        }
        return null;
      },
    },
  ];

  for (const candidate of candidates) {
    try {
      const filePath = path.join(process.cwd(), ".vercel", candidate.file);
      if (!fs.existsSync(filePath)) continue;
      const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const id = candidate.pick(parsed);
      if (id) return id;
    } catch {
      // Unreadable/!JSON — treat as "no id here" and keep looking.
    }
  }

  return null;
}

/** Resolve Sajtmaskin's own project id and where it was found. */
export function resolveSelfVercelProject(): SelfProjectIdentity {
  const fromEnv = process.env.VERCEL_PROJECT_ID?.trim();
  if (fromEnv) return { id: fromEnv, source: "env" };

  const linked = readLinkedProjectId();
  if (linked) return { id: linked, source: "vercel-link" };

  return { id: null, source: null };
}

/** The project id Sajtmaskin itself is deployed to, or `null` when unknown. */
export function getSelfVercelProjectId(): string | null {
  return resolveSelfVercelProject().id;
}

/**
 * True when `projectId` is Sajtmaskin's own project.
 *
 * Comparison is case-insensitive and trims whitespace so a copy-pasted id with a
 * trailing space cannot slip past the guard. Returns `false` when the self id is
 * unknown — callers must use {@link assertVercelProjectDeletable} for the
 * delete decision, which fails closed in that state.
 */
export function isSelfVercelProject(projectId: string | null | undefined): boolean {
  const self = getSelfVercelProjectId();
  if (!self) return false;
  const candidate = (projectId ?? "").trim();
  if (!candidate) return false;
  return candidate.toLowerCase() === self.toLowerCase();
}

export const SELF_PROJECT_DELETE_ERROR =
  "Det här är Sajtmaskins eget Vercel-projekt — det kan inte raderas härifrån.";

export const UNKNOWN_SELF_PROJECT_ERROR =
  "Radering är avstängd: appen kan inte avgöra vilket Vercel-projekt som är dess eget " +
  "(VERCEL_PROJECT_ID saknas). Sätt VERCEL_PROJECT_ID så att appens eget projekt kan skyddas.";

export const MISSING_PROJECT_ID_ERROR = "Inget projekt-id angavs — ingen radering utförd.";

export type VercelProjectDeleteDecision =
  | { allowed: true }
  | { allowed: false; reason: "self" | "unknown-self" | "missing-id"; error: string };

/**
 * The single decision point for "may this Vercel project be deleted?".
 *
 * Fails closed twice over: on the app's own project, and whenever the app's own
 * identity is unknown (an unknown identity cannot be excluded from a delete).
 */
export function assertVercelProjectDeletable(
  projectId: string | null | undefined,
): VercelProjectDeleteDecision {
  const self = resolveSelfVercelProject();

  if (!self.id) {
    return { allowed: false, reason: "unknown-self", error: UNKNOWN_SELF_PROJECT_ERROR };
  }

  const candidate = (projectId ?? "").trim();
  if (!candidate) {
    // An id the guard cannot reason about must never come back as "allowed".
    return { allowed: false, reason: "missing-id", error: MISSING_PROJECT_ID_ERROR };
  }

  if (candidate.toLowerCase() === self.id.toLowerCase()) {
    return { allowed: false, reason: "self", error: SELF_PROJECT_DELETE_ERROR };
  }

  return { allowed: true };
}
