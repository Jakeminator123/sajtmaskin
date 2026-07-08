#!/usr/bin/env node
/**
 * Validate local template datasets.
 *
 * Checks:
 * - templates.json has unique IDs
 * - template-categories.json only references existing IDs
 * - each template ID is assigned to exactly one category
 * - required fields are present
 *
 * Usage:
 *   node scripts/v0-templates/validate-templates.mjs
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const APP_CATEGORY_IDS = [
  "ai",
  "animations",
  "components",
  "login-and-sign-up",
  "blog-and-portfolio",
  "design-systems",
  "layouts",
  "landing-pages",
  "dashboards",
  "e-commerce",
  "website-templates",
  "apps-and-games",
];

const PATHS = {
  templates: resolve(process.cwd(), "src/lib/templates/templates.json"),
  categoryMap: resolve(process.cwd(), "src/lib/templates/template-categories.json"),
};

function toSortedList(values) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b)));
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function validateTemplateShape(template, errors, warnings) {
  const required = ["id", "slug", "title", "preview_image_url", "image_filename", "category"];
  for (const key of required) {
    if (typeof template[key] !== "string") {
      errors.push(`Template ${template.id || "<unknown>"} is missing string field "${key}"`);
    }
  }

  const optionalStringFields = [
    "preview_still_url",
    "preview_loop_url",
    "preview_loop_kind",
    "archive_url",
  ];
  for (const key of optionalStringFields) {
    if (template[key] !== undefined && template[key] !== null && typeof template[key] !== "string") {
      errors.push(`Template ${template.id || "<unknown>"} has non-string optional field "${key}"`);
    }
  }

  if (
    template.preview_loop_frame_duration_ms !== undefined &&
    template.preview_loop_frame_duration_ms !== null &&
    typeof template.preview_loop_frame_duration_ms !== "number"
  ) {
    errors.push(
      `Template ${template.id || "<unknown>"} has non-number optional field "preview_loop_frame_duration_ms"`,
    );
  }

  if (
    template.preview_frame_urls !== undefined &&
    (!Array.isArray(template.preview_frame_urls) ||
      template.preview_frame_urls.some((url) => typeof url !== "string"))
  ) {
    errors.push(`Template ${template.id || "<unknown>"} has invalid "preview_frame_urls"`);
  }

  if (template.id && template.slug && template.id !== template.slug) {
    warnings.push(`Template ${template.id} has slug "${template.slug}" (expected same as id)`);
  }

  if (
    template.id &&
    template.preview_image_url &&
    template.preview_image_url !== `/api/template-image/${template.id}` &&
    !/^https?:\/\//i.test(template.preview_image_url)
  ) {
    warnings.push(
      `Template ${template.id} has unexpected preview_image_url: ${template.preview_image_url}`,
    );
  }

  if (
    template.id &&
    template.image_filename &&
    template.image_filename !== `${template.id}.jpg`
  ) {
    warnings.push(
      `Template ${template.id} has unexpected image_filename: ${template.image_filename}`,
    );
  }

  if (template.category && !APP_CATEGORY_IDS.includes(template.category)) {
    warnings.push(
      `Template ${template.id || "<unknown>"} has unknown category value: ${template.category}`,
    );
  }
}

async function main() {
  const errors = [];
  const warnings = [];

  const templates = await readJson(PATHS.templates);
  const categoryMap = await readJson(PATHS.categoryMap);

  if (!Array.isArray(templates) || templates.length === 0) {
    throw new Error("templates.json must be a non-empty array");
  }

  const idToTemplate = new Map();
  for (const template of templates) {
    validateTemplateShape(template, errors, warnings);
    const id = String(template.id || "").trim();
    if (!id) {
      errors.push("Found template with empty id");
      continue;
    }
    if (idToTemplate.has(id)) {
      errors.push(`Duplicate template id in templates.json: ${id}`);
      continue;
    }
    idToTemplate.set(id, template);
  }

  const assignment = new Map();
  for (const categoryId of APP_CATEGORY_IDS) {
    const list = categoryMap[categoryId];
    if (!Array.isArray(list)) {
      errors.push(`Category "${categoryId}" must be an array in template-categories.json`);
      continue;
    }

    for (const rawId of list) {
      const id = String(rawId || "").trim();
      if (!id) {
        errors.push(`Category "${categoryId}" contains an empty template id`);
        continue;
      }
      if (!idToTemplate.has(id)) {
        errors.push(`Category "${categoryId}" references missing template id: ${id}`);
        continue;
      }
      if (assignment.has(id)) {
        errors.push(
          `Template ${id} assigned to multiple categories: ${assignment.get(id)} and ${categoryId}`,
        );
        continue;
      }
      assignment.set(id, categoryId);
    }
  }

  const unassigned = [];
  for (const id of idToTemplate.keys()) {
    if (!assignment.has(id)) {
      unassigned.push(id);
    }
  }

  if (unassigned.length > 0) {
    errors.push(`Unassigned templates (${unassigned.length}): ${toSortedList(unassigned).join(", ")}`);
  }

  const missingTitle = templates.filter((template) => !String(template.title || "").trim()).length;
  const missingPreview = templates.filter((template) => !String(template.preview_image_url || "").trim()).length;

  console.log("[templates:validate] Summary");
  console.log("  Templates:", templates.length);
  console.log("  Assigned templates:", assignment.size);
  console.log("  Missing titles:", missingTitle);
  console.log("  Missing preview images:", missingPreview);

  if (warnings.length > 0) {
    console.log(`[templates:validate] Warnings (${warnings.length})`);
    for (const warning of warnings) {
      console.log("  -", warning);
    }
  }

  if (errors.length > 0) {
    console.error(`[templates:validate] Errors (${errors.length})`);
    for (const error of errors) {
      console.error("  -", error);
    }
    process.exitCode = 1;
    return;
  }

  console.log("[templates:validate] OK");
}

main().catch((error) => {
  console.error("[templates:validate] Failed:", error);
  process.exitCode = 1;
});
