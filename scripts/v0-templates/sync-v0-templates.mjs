#!/usr/bin/env node
/**
 * Canonical v0 template sync entrypoint.
 *
 * Delegates to the shared implementation in template-library.
 *
 * Usage:
 *   node scripts/v0-templates/sync-v0-templates.mjs
 *   node scripts/v0-templates/sync-v0-templates.mjs --dry-run
 *   node scripts/v0-templates/sync-v0-templates.mjs --force
 *   node scripts/v0-templates/sync-v0-templates.mjs --source=local-manifest
 */

import "../template-library/sync-v0-templates.mjs";
