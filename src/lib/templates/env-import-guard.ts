/**
 * Secret hygiene for template-zip imports.
 *
 * Real `.env` files must never be imported from a template archive — they can
 * carry live secrets that would then be persisted into a user's project files.
 * Documentation-only variants (`.env.example` / `.env.sample` / `.env.template`)
 * are allowed since they contain only variable names, no values.
 *
 * Used by both import paths (`chats/init` GitHub-zip import and the local/blob
 * `local-v0-template-source`) so the two can't drift.
 */
export function isBlockedEnvImportFilename(basename: string): boolean {
  const name = basename.toLowerCase();
  if (name === ".env") return true;
  if (name.startsWith(".env.")) {
    return !(
      name === ".env.example" ||
      name === ".env.sample" ||
      name === ".env.template"
    );
  }
  return false;
}
