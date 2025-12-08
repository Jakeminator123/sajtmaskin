/**
 * Vercel Deployment Integration
 * =============================
 *
 * This module handles Vercel deployments for MANUAL publishing only.
 *
 * ⚠️ IMPORTANT: Auto-deployment on save has been REMOVED!
 * Previously, every project save triggered a Vercel deployment.
 * This caused unnecessary builds and quota usage during editing.
 *
 * CURRENT WORKFLOW:
 * - During editing: Use v0's demoUrl for preview (instant, no build)
 * - When publishing: Call POST /api/vercel/deploy manually
 *
 * WHEN TO USE:
 * - triggerDeploymentAsync() - Only call when user clicks "Publish"
 * - getLatestDeployment() - Check deployment status
 * - clearPendingDeployment() - Cancel pending deployment
 *
 * ROBUSTNESS:
 * - All errors are caught and logged, never thrown
 * - Deployment failures don't affect user experience
 * - Uses database to track deployment state
 */

import { getDb } from "./database";
import {
  deployProject,
  getProjectDeploymentStatus,
} from "./vercel-deployment-service";
import { isVercelConfigured } from "./vercel-client";
import { FEATURES } from "./config";
import { loadProjectFilesWithFallback } from "./project-files";
import { getProjectById } from "./database";

// ============================================================================
// DEPLOYMENT DEBOUNCE
// ============================================================================
// Prevents multiple deployments when saves happen in quick succession.
// Each project has its own debounce timer.

const DEPLOYMENT_DEBOUNCE_MS = 30000; // 30 seconds between deployments

// Track pending deployments per project
const pendingDeployments = new Map<
  string,
  {
    timeout: NodeJS.Timeout;
    scheduledAt: number;
  }
>();

/**
 * Check if a deployment is already scheduled or recently triggered
 */
function isDeploymentPending(projectId: string): boolean {
  return pendingDeployments.has(projectId);
}

/**
 * Schedule a deployment with debounce
 * Returns true if deployment was scheduled, false if one is already pending
 *
 * DEBOUNCE LOGIC:
 * - First save: schedules deployment after 500ms delay (batches rapid saves)
 * - After deployment runs: entry stays in map for DEPLOYMENT_DEBOUNCE_MS to block new deploys
 * - Subsequent saves within debounce window are skipped
 */
function scheduleDeployment(
  projectId: string,
  deployFn: () => Promise<void>
): boolean {
  const now = Date.now();

  // Check if we're within debounce window (either pending or recently deployed)
  if (pendingDeployments.has(projectId)) {
    const pending = pendingDeployments.get(projectId)!;
    const timeSinceScheduled = now - pending.scheduledAt;

    // If still within debounce window, skip
    if (timeSinceScheduled < DEPLOYMENT_DEBOUNCE_MS) {
      const waitTime = Math.round(
        (DEPLOYMENT_DEBOUNCE_MS - timeSinceScheduled) / 1000
      );
      console.log(
        `[Vercel Integration] Deployment debounced for ${projectId}, skipping (cooldown: ~${waitTime}s)`
      );
      return false;
    }

    // Debounce window expired, clear old entry and allow new deployment
    clearTimeout(pending.timeout);
    pendingDeployments.delete(projectId);
  }

  // Schedule deployment with small delay to batch rapid saves
  const timeout = setTimeout(async () => {
    try {
      await deployFn();
    } catch (error) {
      console.error(
        `[Vercel Integration] Scheduled deployment failed for ${projectId}:`,
        error
      );
    }
    // NOTE: Don't delete entry here - keep it for debounce window
    // Entry will be cleared when debounce window expires (checked on next schedule attempt)
  }, 500);

  pendingDeployments.set(projectId, {
    timeout,
    scheduledAt: now,
  });

  return true;
}

/**
 * Clear pending deployment (e.g., on project delete)
 */
export function clearPendingDeployment(projectId: string): void {
  const pending = pendingDeployments.get(projectId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingDeployments.delete(projectId);
  }
}

/**
 * Sanitize project name for Vercel requirements:
 * - lowercase
 * - only a-z, 0-9, '.', '_', '-'
 * - collapse multiple hyphens
 * - trim disallowed leading/trailing chars
 * - enforce length limit
 */
function sanitizeVercelProjectName(rawName: string, fallback: string): string {
  const cleaned =
    rawName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "")
      .slice(0, 80) || "";

  if (!cleaned) {
    return fallback;
  }

  // Avoid the forbidden sequence '---'
  return cleaned.replace(/-{3,}/g, "--");
}

/**
 * Deployment record in database
 */
export interface DeploymentRecord {
  id: number;
  project_id: string;
  deployment_id: string;
  vercel_project_name: string;
  deployment_url: string | null;
  ready_state: string;
  state: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get latest deployment for a project
 */
export function getLatestDeployment(
  projectId: string
): DeploymentRecord | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM vercel_deployments
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return (stmt.get(projectId) as DeploymentRecord | undefined) || null;
}

/**
 * Save deployment record to database
 */
function saveDeploymentRecord(
  projectId: string,
  deploymentId: string,
  vercelProjectName: string,
  deploymentUrl: string | null,
  readyState: string,
  state: string,
  errorMessage: string | null = null
): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO vercel_deployments (
      project_id, deployment_id, vercel_project_name,
      deployment_url, ready_state, state, error_message
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    projectId,
    deploymentId,
    vercelProjectName,
    deploymentUrl,
    readyState,
    state,
    errorMessage
  );
}

/**
 * Update deployment record
 */
function updateDeploymentRecord(
  deploymentId: string,
  updates: {
    deployment_url?: string;
    ready_state?: string;
    state?: string;
    error_message?: string | null;
  }
): void {
  const db = getDb();
  const updatesList: string[] = [];
  const values: unknown[] = [];

  if (updates.deployment_url !== undefined) {
    updatesList.push("deployment_url = ?");
    values.push(updates.deployment_url);
  }
  if (updates.ready_state !== undefined) {
    updatesList.push("ready_state = ?");
    values.push(updates.ready_state);
  }
  if (updates.state !== undefined) {
    updatesList.push("state = ?");
    values.push(updates.state);
  }
  if (updates.error_message !== undefined) {
    updatesList.push("error_message = ?");
    values.push(updates.error_message);
  }

  if (updatesList.length === 0) return;

  updatesList.push("updated_at = datetime('now')");
  values.push(deploymentId);

  const stmt = db.prepare(`
    UPDATE vercel_deployments
    SET ${updatesList.join(", ")}
    WHERE deployment_id = ?
  `);
  stmt.run(...values);
}

/**
 * Check if project should be deployed
 * Returns true if:
 * - Vercel integration is enabled
 * - Project has files
 * - No recent successful deployment exists (or files changed)
 */
async function shouldDeployProject(projectId: string): Promise<boolean> {
  // Check if Vercel integration is enabled
  if (!FEATURES.useVercelApi || !isVercelConfigured()) {
    return false;
  }

  // Check if project exists
  const project = getProjectById(projectId);
  if (!project) {
    console.warn(`[Vercel Integration] Project ${projectId} not found`);
    return false;
  }

  // Check if project has files
  const files = await loadProjectFilesWithFallback(projectId);
  if (!files || files.length === 0) {
    console.log(
      `[Vercel Integration] Project ${projectId} has no files, skipping deployment`
    );
    return false;
  }

  // Check if there's already a recent successful deployment
  // (We could add logic here to check if files changed, but for now we deploy every time)
  // This can be optimized later to only deploy when files actually change

  return true;
}

/**
 * Trigger deployment for a project (async, non-blocking, DEBOUNCED)
 * This function is called after project save and runs in background.
 * Multiple calls within 30 seconds will only trigger ONE deployment.
 * Errors are logged but never thrown to avoid affecting main flow.
 */
export async function triggerDeploymentAsync(projectId: string): Promise<void> {
  // Quick checks before scheduling
  if (!FEATURES.useVercelApi || !isVercelConfigured()) {
    return;
  }

  // Check if deployment already pending (debounce)
  if (isDeploymentPending(projectId)) {
    return; // Debounce message already logged in scheduleDeployment
  }

  // Schedule the actual deployment with debounce
  const scheduled = scheduleDeployment(projectId, async () => {
    try {
      // Check if we should deploy (re-check after debounce delay)
      const shouldDeploy = await shouldDeployProject(projectId);
      if (!shouldDeploy) {
        return;
      }

      const project = getProjectById(projectId);
      if (!project) {
        console.warn(
          `[Vercel Integration] Project ${projectId} not found for deployment`
        );
        return;
      }

      console.log(
        `[Vercel Integration] Starting deployment for project ${projectId}`
      );

      // Generate Vercel project name from project name
      const fallbackName = `project-${projectId.substring(0, 8)}`;
      const vercelProjectName = sanitizeVercelProjectName(
        project.name || fallbackName,
        fallbackName
      );

      // Deploy project
      const deploymentResult = await deployProject({
        projectId,
        projectName: vercelProjectName,
        framework: "nextjs", // Default to Next.js, can be made configurable
        target: "staging", // Use staging for auto-deployments, production can be manual
      });

      if (!deploymentResult.success) {
        // Save failed deployment record
        if (deploymentResult.deploymentId) {
          saveDeploymentRecord(
            projectId,
            deploymentResult.deploymentId,
            vercelProjectName,
            null,
            "ERROR",
            "ERROR",
            deploymentResult.error || "Unknown error"
          );
        }
        console.error(
          `[Vercel Integration] Deployment FAILED for project ${projectId}:`,
          deploymentResult.error
        );
        return;
      }

      // Save successful deployment record
      if (deploymentResult.deploymentId) {
        saveDeploymentRecord(
          projectId,
          deploymentResult.deploymentId,
          vercelProjectName,
          deploymentResult.url || null,
          deploymentResult.readyState || "QUEUED",
          "BUILDING",
          null
        );

        console.log(
          `[Vercel Integration] Deployment started for project ${projectId}:`,
          deploymentResult.url
        );

        // Poll deployment status in background (non-blocking)
        pollDeploymentStatusAsync(deploymentResult.deploymentId, projectId);
      }
    } catch (error) {
      // Never throw - just log
      console.error(
        `[Vercel Integration] Error triggering deployment for project ${projectId}:`,
        error
      );
    }
  });

  if (scheduled) {
    console.log(
      `[Vercel Integration] Deployment scheduled for project ${projectId} (debounced)`
    );
  }
}

/**
 * Poll deployment status in background
 * Updates database record when deployment completes or fails
 * Logs detailed error info when deployment fails
 */
async function pollDeploymentStatusAsync(
  deploymentId: string,
  projectId: string
): Promise<void> {
  // Poll up to 5 minutes (60 checks * 5 seconds)
  const maxAttempts = 60;
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const status = await getProjectDeploymentStatus(deploymentId);
      if (!status) {
        console.warn(
          `[Vercel Integration] Could not get status for deployment ${deploymentId}`
        );
        continue;
      }

      // Update database record
      updateDeploymentRecord(deploymentId, {
        deployment_url: status.url,
        ready_state: status.readyState,
        state: status.state,
      });

      // Stop polling if deployment is complete
      if (status.readyState === "READY") {
        console.log(
          `[Vercel Integration] ✓ Deployment ${deploymentId} READY:`,
          status.url
        );
        return;
      }

      if (status.state === "ERROR" || status.readyState === "ERROR") {
        // Log detailed error info
        console.error(
          `[Vercel Integration] ✗ Deployment ${deploymentId} FAILED for project ${projectId}`
        );
        console.error(
          `[Vercel Integration] State: ${status.state}, ReadyState: ${status.readyState}`
        );
        console.error(
          `[Vercel Integration] This usually means the generated code has build errors.`
        );
        console.error(
          `[Vercel Integration] Check https://vercel.com/dashboard for detailed build logs.`
        );

        // Update record with error
        updateDeploymentRecord(deploymentId, {
          error_message: `Build failed - check Vercel dashboard for details`,
        });
        return;
      }

      // Log progress every 30 seconds (6 attempts)
      if (attempt > 0 && attempt % 6 === 0) {
        console.log(
          `[Vercel Integration] Deployment ${deploymentId} still building... (${Math.round(
            (attempt * pollInterval) / 1000
          )}s)`
        );
      }
    } catch (error) {
      console.error(
        `[Vercel Integration] Error polling deployment ${deploymentId}:`,
        error
      );
      // Continue polling despite errors
    }
  }

  console.warn(
    `[Vercel Integration] Polling timeout for deployment ${deploymentId} after 5 minutes`
  );
}
