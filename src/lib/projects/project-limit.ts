/**
 * Projekttaket som svar till klienten. Rena hjälpare utan databas, så att
 * routerna kan använda dem utan att dra in db-klienten.
 *
 * Taket räknar startade projekt (`startedProjectCondition`) och prövas på två
 * ställen: när ett projekt skapas (`POST /api/projects`, audit-handoffen) och
 * när ett tomt projekt får sin första chatt (`project-cap.ts`). Båda svarar med
 * samma kropp och status 403, så klienten känner igen taket på `limitReached`.
 */

import { isAdminEmailEdge } from "@/lib/auth/edge-auth";

/** Vems tak som gäller. Gäster räknas per session, inloggade per konto. */
export type ProjectCapOwner = {
  userId: string | null;
  sessionId: string | null;
  isPaidUser: boolean;
};

export type ProjectLimitDenial = {
  allowed: false;
  reason: string;
  limit: number;
  current: number;
};

export type ProjectCapCheck = { allowed: true } | ProjectLimitDenial;

/**
 * Om kontot får betalkontots projekttak. Admin får det alltid (beslut
 * 2026-11-21, `SM-154`): admin bygger testprojekt i mängd och ska inte stoppas
 * av gratistaket. Övriga konton: samma saldogräns som `POST /api/projects`
 * alltid har använt. Att gränsen ska följa köp i stället för saldo är beslutat
 * men inte gjort (backloggen, `SM-154`).
 */
export function isPaidProjectTier(
  user: { diamonds?: number | null; email?: string | null } | null | undefined,
): boolean {
  if (user?.email && isAdminEmailEdge(user.email)) return true;
  return (user?.diamonds ?? 0) > 100;
}

/** Kroppen för 403 när taket är nått, oavsett om det gäller skapande eller första bygget. */
export function projectLimitResponseBody(denial: {
  reason?: string;
  limit: number;
  current: number;
}): {
  success: false;
  error: string;
  limitReached: true;
  current: number;
  limit: number;
} {
  return {
    success: false,
    error: denial.reason || "Projektgränsen har nåtts.",
    limitReached: true,
    current: denial.current,
    limit: denial.limit,
  };
}

/** Kastas av vägar som upptäcker taket djupt inne i ett anrop (mallimporten). */
export class ProjectLimitError extends Error {
  readonly denial: ProjectLimitDenial;

  constructor(denial: ProjectLimitDenial) {
    super(denial.reason);
    this.name = "ProjectLimitError";
    this.denial = denial;
  }
}
