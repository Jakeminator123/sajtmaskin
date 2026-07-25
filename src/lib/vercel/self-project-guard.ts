/**
 * Guard so an admin action can never delete Sajtmaskin's OWN Vercel project.
 *
 * Background: the admin UI used to expose "MEGA CLEANUP" and "Rensa
 * Vercel-projekt", both of which listed every project the access token could see
 * and deleted all of them — including the project that hosts Sajtmaskin itself
 * (`VERCEL_PROJECT_ID`). The bulk buttons are gone from the UI, and this guard
 * makes the remaining per-project delete path fail closed instead of relying on
 * the operator picking the right row.
 *
 * Kept dependency-free so both API routes and tests can use it directly.
 */

/** The project id Sajtmaskin itself is deployed to, or `null` when unknown. */
export function getSelfVercelProjectId(): string | null {
  const id = process.env.VERCEL_PROJECT_ID?.trim();
  return id ? id : null;
}

/**
 * True when `projectId` is Sajtmaskin's own project.
 *
 * Comparison is case-insensitive and trims whitespace so a copy-pasted id with a
 * trailing space cannot slip past the guard.
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
