/**
 * Backoffice Template Generator
 * =============================
 *
 * Generates all the files needed for the backoffice system.
 * These files are injected into the downloaded ZIP.
 *
 * Implementation lives in ./template-generator/; this file is the stable public facade.
 */

export type { BackofficeFile, BackofficeFileSet } from "./template-generator/types";
export { generateBackofficeFiles } from "./template-generator/assemble";
