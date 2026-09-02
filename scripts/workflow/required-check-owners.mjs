/**
 * Dependency-free owner map for required PR-head checks.
 *
 * CI trust roots (`trusted-review-window.mjs`, `merge-ready-freshness.mjs`)
 * run after `actions/checkout` without `npm install`. This module may only
 * import `node:*` or relative files that themselves stay dependency-free.
 * Do not import `check-contract.mjs` (ajv / js-yaml) from here.
 */

export const REQUIRED_CHECK_OWNERS = Object.freeze({
  quality: "ci.yml",
  "backoffice-tests": "ci.yml",
  "schema-drift": "ci.yml",
  build: "ci.yml",
  "dossier-acceptance": "dossier-acceptance.yml",
});

export const REQUIRED_CHECK_WORKFLOW = Object.freeze({
  path: ".github/workflows/ci.yml",
  event: "pull_request",
});

const DEFAULT_OWNER_POLICY = Object.freeze({
  requiredCheckOwners: REQUIRED_CHECK_OWNERS,
  review: Object.freeze({
    requiredCheckWorkflow: REQUIRED_CHECK_WORKFLOW,
  }),
});

/**
 * @param {string} check
 * @param {{
 *   review?: { requiredCheckWorkflow?: { path?: string, event?: string } },
 *   requiredCheckOwners?: Record<string, string | { path?: string, event?: string }>
 * }} [policy]
 */
export function requiredCheckOwnerSpec(check, policy = DEFAULT_OWNER_POLICY) {
  const canonical = policy.review?.requiredCheckWorkflow ?? REQUIRED_CHECK_WORKFLOW;
  const owners = {
    ...REQUIRED_CHECK_OWNERS,
    ...(policy.requiredCheckOwners ?? {}),
  };
  const owner = owners[check];
  if (!owner) {
    return {
      path: canonical.path,
      event: canonical.event,
      file: String(canonical.path ?? "")
        .split("/")
        .at(-1),
    };
  }
  if (typeof owner === "string") {
    return {
      path: `.github/workflows/${owner}`,
      event: "pull_request",
      file: owner,
    };
  }
  return {
    path: owner.path,
    event: owner.event ?? "pull_request",
    file: String(owner.path ?? "")
      .split("/")
      .at(-1),
  };
}
