export {
  assertDbConfigured,
  TEST_USER_EMAIL,
  getUploadsDir,
  type User,
  type Transaction,
  type Project,
  type ProjectData,
  type PromptHandoff,
  type PromptLog,
  type VersionErrorLog,
  type MediaLibraryItem,
  type CompanyProfile,
  type DomainOrder,
  type KostnadsfriPage,
  type UserAudit,
} from "./shared";

export {
  getUserById,
  getUserByEmail,
  createUser,
  createGoogleUser,
  updateUserLastLogin,
  updateUserGitHub,
  clearUserGitHub,
  isTestUser,
  isAdminEmail,
  createVerificationToken,
  getUserByVerificationToken,
  markEmailVerified,
  setUserDiamonds,
} from "./users";

export {
  createTransaction,
  hasSignupBonusTransaction,
  getUserTransactions,
  getTransactionByStripeSession,
} from "./transactions";

export { getOrCreateGuestUsage, incrementGuestUsage } from "./guests";

export {
  createPromptHandoff,
  getPromptHandoffById,
  getPromptHandoffByIdForOwner,
  consumePromptHandoff,
  consumePromptHandoffForOwner,
  createProject,
  getAllProjectsForOwner,
  getProjectById,
  getProjectByIdForOwner,
  updateProject,
  deleteProject,
  getProjectData,
  saveProjectData,
} from "./projects";

export {
  canUserUploadFile,
  saveMediaLibraryItem,
  getMediaLibraryByUser,
  getMediaLibraryCounts,
  getMediaLibraryItemById,
  deleteMediaLibraryItem,
  saveImage,
} from "./media";

export { getCachedTemplate, cacheTemplateResult } from "./templates";

export {
  saveCompanyProfile,
  getCompanyProfileByProjectId,
  getCompanyProfileByName,
  getAllCompanyProfiles,
  searchCompanyProfiles,
  linkCompanyProfileToProject,
  type OwnerScope,
} from "./company-profiles";

export {
  saveUserAudit,
  getUserAudits,
  getUserAuditCount,
  getUserAuditById,
  deleteUserAudit,
} from "./audits";

export { saveDomainOrder, updateDomainOrderStatus } from "./domains";

export { recordPageView, getAnalyticsStats } from "./analytics";

export {
  createKostnadsfriPage,
  getKostnadsfriPageBySlug,
  markKostnadsfriConsumed,
  getAllKostnadsfriPages,
} from "./kostnadsfri";

export { createPromptLog, getRecentPromptLogs } from "./prompt-logs";

export {
  createVersionErrorLog,
  createVersionErrorLogs,
  createEngineVersionErrorLog,
  createEngineVersionErrorLogs,
  getVersionErrorLogs,
  getEngineVersionErrorLogs,
} from "./version-errors";
