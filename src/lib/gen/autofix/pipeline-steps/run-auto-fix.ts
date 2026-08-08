import { DETERMINISTIC_AUTOFIX_MAX_PASSES } from "../../defaults";
import type { FixEntry } from "../types";
import { runAutoFixSinglePass } from "./single-pass";
import type { AutoFixContext, AutoFixResult } from "./types";

export async function runAutoFix(
  content: string,
  context?: AutoFixContext,
): Promise<AutoFixResult> {
  let currentContent = content;
  const allFixes: FixEntry[] = [];
  const warningSet = new Set<string>();
  let allDependencies: Record<string, string> = {};

  for (let pass = 1; pass <= DETERMINISTIC_AUTOFIX_MAX_PASSES; pass++) {
    const before = currentContent;
    const result = await runAutoFixSinglePass(currentContent, context);
    currentContent = result.fixedContent;
    allDependencies = { ...allDependencies, ...result.dependencies };

    for (const fix of result.fixes) {
      allFixes.push(
        pass === 1
          ? fix
          : { ...fix, description: `[pass ${pass}] ${fix.description}` },
      );
    }
    for (const warning of result.warnings) {
      warningSet.add(warning);
    }

    const changed = before !== currentContent;
    if (!changed || result.fixes.length === 0) {
      break;
    }
  }

  return {
    fixedContent: currentContent,
    fixes: allFixes,
    warnings: [...warningSet],
    dependencies: allDependencies,
  };
}
