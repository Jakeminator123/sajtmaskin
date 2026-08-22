"use strict";

// Fasad för preview-hostens runtime. Implementationen bor i ansvarsmoduler
// under ./runtime/ (delad hjälpkod, workspace-filer, package-install,
// verify-jobb, processlivscykel, preview-proxy och storage-cleanup); denna fil
// re-exporterar samma publika yta som före uppdelningen så att server.js och
// testskripten kan fortsätta requira ./runtime.js oförändrat.
//
// OBS: testskript ersätter egenskaper på detta exports-objekt (t.ex.
// `runtime.queueRuntimeBoot = stub`) INNAN server.js requiras — behåll därför
// ett vanligt muterbart objekt-literal här. Interna korsanrop mellan modulerna
// går direkt och påverkas inte av sådana stubs (samma semantik som när allt
// låg i en fil).

const shared = require("./runtime/shared.js");
const workspaceFiles = require("./runtime/workspace-files.js");
const packageInstall = require("./runtime/package-install.js");
const verifyJobs = require("./runtime/verify-jobs.js");
const processLifecycle = require("./runtime/process-lifecycle.js");
const previewProxy = require("./runtime/preview-proxy.js");
const storageCleanup = require("./runtime/storage-cleanup.js");

module.exports = {
  buildPreviewUrl(baseUrl, chatId) {
    return `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(chatId)}`;
  },
  ensureRuntimeForChat: processLifecycle.ensureRuntimeForChat,
  getRuntimeStateForChat: processLifecycle.getRuntimeStateForChat,
  getSessionChatId: shared.getSessionChatId,
  queueRuntimeBoot: processLifecycle.queueRuntimeBoot,
  applyRuntimePatch: processLifecycle.applyRuntimePatch,
  probeReadinessAfterPatch: processLifecycle.probeReadinessAfterPatch,
  proxyPreviewRequest: previewProxy.proxyPreviewRequest,
  proxyPreviewUpgrade: previewProxy.proxyPreviewUpgrade,
  findSessionByChatId: shared.findSessionByChatId,
  listSessions: shared.listSessions,
  hibernateChatRuntime: processLifecycle.hibernateChatRuntime,
  destroyChatWorkspace: storageCleanup.destroyChatWorkspace,
  runQueuedVerifyJob: verifyJobs.runQueuedVerifyJob,
  runVerifyJob: verifyJobs.runVerifyJob,
  runIdResolverFromSession: shared.runIdResolverFromSession,
  stopRuntimeForSession: processLifecycle.stopRuntimeForSession,
  sweepIdleRuntimes: processLifecycle.sweepIdleRuntimes,
  cleanupPreviewHostStorage: storageCleanup.cleanupPreviewHostStorage,
  cleanupPackageCaches: storageCleanup.cleanupPackageCaches,
  PACKAGE_CACHE_DIR: shared.PACKAGE_CACHE_DIR,
  describePackageCacheStorage: storageCleanup.describePackageCacheStorage,
  directorySizeBytes: storageCleanup.directorySizeBytes,
  __testing: {
    bootRuntimeForSession: processLifecycle.bootRuntimeForSession,
    classifyRuntimeCleanExitLoop: processLifecycle.classifyRuntimeCleanExitLoop,
    RUNTIME_CLEAN_EXIT_LIMIT: processLifecycle.RUNTIME_CLEAN_EXIT_LIMIT,
    RUNTIME_CLEAN_EXIT_WINDOW_MS: processLifecycle.RUNTIME_CLEAN_EXIT_WINDOW_MS,
    classifyRuntimeBootFailureLoop: processLifecycle.classifyRuntimeBootFailureLoop,
    RUNTIME_BOOT_FAILURE_LIMIT: processLifecycle.RUNTIME_BOOT_FAILURE_LIMIT,
    RUNTIME_BOOT_FAILURE_WINDOW_MS: processLifecycle.RUNTIME_BOOT_FAILURE_WINDOW_MS,
    isNoSpaceInstallFailure: packageInstall.isNoSpaceInstallFailure,
    classifyInstallFailure: packageInstall.classifyInstallFailure,
    collectInstallFailureDiagnostics: packageInstall.collectInstallFailureDiagnostics,
    npmLogsDirForWorkspace: packageInstall.npmLogsDirForWorkspace,
    clearWorkspaceNpmLogs: packageInstall.clearWorkspaceNpmLogs,
    readLatestNpmDebugLog: packageInstall.readLatestNpmDebugLog,
    isHmrPath: previewProxy.isHmrPath,
    PREVIEW_HMR_PATH_SUFFIXES: previewProxy.PREVIEW_HMR_PATH_SUFFIXES,
    probeReadinessAfterPatch: processLifecycle.probeReadinessAfterPatch,
    sanitizedEnv: shared.sanitizedEnv,
    runInInstallSlot: shared.runInInstallSlot,
    cleanupPackageCachesUnqueued: storageCleanup.cleanupPackageCachesUnqueued,
    PACKAGE_CACHE_DIR: shared.PACKAGE_CACHE_DIR,
    NPM_CACHE_DIR: shared.NPM_CACHE_DIR,
    dependencyFingerprint: packageInstall.dependencyFingerprint,
    DEPENDENCY_INSTALL_POLICY: packageInstall.DEPENDENCY_INSTALL_POLICY,
    VERIFY_COMMANDS: verifyJobs.VERIFY_COMMANDS,
    classifyLintResult: verifyJobs.classifyLintResult,
    inspectProjectLintSetup: verifyJobs.inspectProjectLintSetup,
    projectOwnsLintSetup: verifyJobs.projectOwnsLintSetup,
    resolveInstallCommand: packageInstall.resolveInstallCommand,
    LOCKFILE_STALE_MARKER_PATH: packageInstall.LOCKFILE_STALE_MARKER_PATH,
    readStaleLockfileMarker: packageInstall.readStaleLockfileMarker,
    detectPackageManager: packageInstall.detectPackageManager,
    requiredDirectDependencies: packageInstall.requiredDirectDependencies,
    collectInstalledDirectDepNames: packageInstall.collectInstalledDirectDepNames,
    verifyInstalledDependencies: packageInstall.verifyInstalledDependencies,
    readRegeneratedLockfile: packageInstall.readRegeneratedLockfile,
    htmlLooksLikeBuildError: processLifecycle.htmlLooksLikeBuildError,
    waitForReady: processLifecycle.waitForReady,
    clearStaleNextDevLock: processLifecycle.clearStaleNextDevLock,
    stopTrackedRuntime: processLifecycle.stopTrackedRuntime,
    runInstallCommand: packageInstall.runInstallCommand,
    tryShareNodeModules: packageInstall.tryShareNodeModules,
    workspaceDirForChat: shared.workspaceDirForChat,
    dependencyStatePathForWorkspace: shared.dependencyStatePathForWorkspace,
    patchNextConfigViaAst: workspaceFiles.patchNextConfigViaAst,
    patchNextConfigViaRegex: workspaceFiles.patchNextConfigViaRegex,
    patchNextConfigForPreviewBasePath: workspaceFiles.patchNextConfigForPreviewBasePath,
    stripTsToWhitespace: workspaceFiles.stripTsToWhitespace,
    findConfigObjectExpression: workspaceFiles.findConfigObjectExpression,
    patchTouchesStructuralPath: workspaceFiles.patchTouchesStructuralPath,
    patchWorkspaceFiles: workspaceFiles.patchWorkspaceFiles,
    runShellCommand: shared.runShellCommand,
    registerPreviewSocket: shared.registerPreviewSocket,
    markPreviewSocketHandshakeComplete: shared.markPreviewSocketHandshakeComplete,
    clearPreviewSocketCandidate: shared.clearPreviewSocketCandidate,
    activePreviewSocketCount: shared.activePreviewSocketCount,
    markPendingPreviewClientReload: shared.markPendingPreviewClientReload,
    getPendingPreviewClientReloadToken: shared.getPendingPreviewClientReloadToken,
    clearPendingPreviewClientReload: shared.clearPendingPreviewClientReload,
    requestPreviewClientReload: shared.requestPreviewClientReload,
    hasPendingPreviewClientReload: shared.hasPendingPreviewClientReload,
    acknowledgePreviewClientReload: shared.acknowledgePreviewClientReload,
    PREVIEW_CLIENT_RELOAD_PENDING_MS: shared.PREVIEW_CLIENT_RELOAD_PENDING_MS,
    exposeRuntimeToClients: processLifecycle.exposeRuntimeToClients,
    chatIdFromReferer: previewProxy.chatIdFromReferer,
    previewViewerIdFromRequest: previewProxy.previewViewerIdFromRequest,
    previewViewerIdFromSearch: previewProxy.previewViewerIdFromSearch,
    previewHmrIdentityFromSearch: previewProxy.previewHmrIdentityFromSearch,
    isPreviewDocumentNavigation: previewProxy.isPreviewDocumentNavigation,
    stripPreviewHostParams: previewProxy.stripPreviewHostParams,
    PREVIEW_VIEWER_QUERY_PARAM: previewProxy.PREVIEW_VIEWER_QUERY_PARAM,
    APP_API_ROOT_PATH_RE: previewProxy.APP_API_ROOT_PATH_RE,
    NEXT_INTERNAL_ROOT_PATH_RE: previewProxy.NEXT_INTERNAL_ROOT_PATH_RE,
    shouldHoldPrewarmTraffic: previewProxy.shouldHoldPrewarmTraffic,
    pendingPreviewDocumentCount: previewProxy.pendingPreviewDocumentCount,
    setRuntimeStateForTesting: processLifecycle.setRuntimeStateForTesting,
    createFakeRuntimeChildForTesting: processLifecycle.createFakeRuntimeChildForTesting,
    clearRuntimeStateForTesting: processLifecycle.clearRuntimeStateForTesting,
    setBootRunnerForTesting: processLifecycle.setBootRunnerForTesting,
    setVerifyRunnersForTesting: verifyJobs.setVerifyRunnersForTesting,
    setBootInstallRunnersForTesting: packageInstall.setBootInstallRunnersForTesting,
  },
};
