import { lstatSync } from "node:fs";
import path from "node:path";

/**
 * Worktree-länkad `node_modules` (junction/symlink) kan inte starta Vitest
 * forks-arbetare på Windows. `--pool=threads` ensamt räcker inte — det är
 * filparallellismen som hänger. CI har en riktig installation och tar inte
 * den här grenen. Recept: docs/runbooks/git-worktree.md.
 */
export function linkedWorktreeVitestPool(rootDir: string): {
  pool?: "threads";
  fileParallelism?: false;
} {
  try {
    if (!lstatSync(path.resolve(rootDir, "node_modules")).isSymbolicLink()) return {};
  } catch {
    return {};
  }
  return { pool: "threads", fileParallelism: false };
}
