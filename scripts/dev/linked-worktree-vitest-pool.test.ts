import { lstatSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { linkedWorktreeVitestPool } from "./linked-worktree-vitest-pool";

describe("linkedWorktreeVitestPool", () => {
  it("enables threads + no file parallelism only when node_modules is a symlink", () => {
    const root = path.resolve(__dirname, "../..");
    let linked = false;
    try {
      linked = lstatSync(path.join(root, "node_modules")).isSymbolicLink();
    } catch {
      linked = false;
    }
    const pool = linkedWorktreeVitestPool(root);
    if (linked) {
      expect(pool).toEqual({ pool: "threads", fileParallelism: false });
    } else {
      expect(pool).toEqual({});
    }
  });
});
