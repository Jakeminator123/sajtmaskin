import { dbConfigured } from "@/lib/db/client";
import {
  appProjects,
  companyProfiles,
  domainOrders,
  kostnadsfriPages,
  mediaLibrary,
  projectData,
  promptHandoffs,
  promptLogs,
  transactions,
  userAudits,
  users,
  versionErrorLogs,
} from "@/lib/db/schema";
import { PATHS, SECRETS } from "@/lib/config";

export function assertDbConfigured() {
  if (!dbConfigured) {
    throw new Error(
      "Database not configured. Set POSTGRES_URL (or POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING).",
    );
  }
}

export const TEST_USER_EMAIL = SECRETS.testUserEmail || SECRETS.superadminEmail || "";

export type User = typeof users.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
/** DB row type — distinct from the client-side Project interface in project-client.ts */
export type Project = typeof appProjects.$inferSelect;
export type ProjectData = typeof projectData.$inferSelect & {
  files: unknown[] | null;
  messages: unknown[] | null;
  meta: unknown | null;
};
export type PromptHandoff = typeof promptHandoffs.$inferSelect;
export type PromptLog = typeof promptLogs.$inferSelect;
export type VersionErrorLog = typeof versionErrorLogs.$inferSelect;
export type MediaLibraryItem = typeof mediaLibrary.$inferSelect;
export type CompanyProfile = typeof companyProfiles.$inferSelect;
export type DomainOrder = typeof domainOrders.$inferSelect;
export type KostnadsfriPage = typeof kostnadsfriPages.$inferSelect;
export type UserAudit = typeof userAudits.$inferSelect;

export function getUploadsDir(): string {
  return PATHS.uploads;
}
