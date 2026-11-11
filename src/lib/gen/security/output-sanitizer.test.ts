import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { parseCodeProject } from "../parser";
import { sanitizeOutput } from "./output-sanitizer";

describe("sanitizeOutput literal file replacements", () => {
  it.each(["app/page.tsx", "/app/page.tsx", " app/page.tsx "])(
    "blocks eval without expanding preserved dollar tokens in %s",
    (path) => {
      const comment = "// $& $$ $1 $100 $` $'";
      const content = `\`\`\`tsx file="${path}"\n${comment}\neval("globalThis.auditSentinel = 1");\n\`\`\``;

      const result = sanitizeOutput(content);
      const files = parseCodeProject(result.sanitized).files;

      expect(result.blockedFiles).toEqual(["app/page.tsx"]);
      expect(result.warnings).toContainEqual({ file: "app/page.tsx", line: 2, pattern: "eval()", severity: "block" });
      expect(files).toHaveLength(1);
      expect(files[0].content).toBe(`${comment}\n/* SECURITY: blocked unsafe code */`);
      const sandbox = { auditSentinel: 0 };
      runInNewContext(files[0].content, sandbox);
      expect(sandbox.auditSentinel).toBe(0);
      expect(sanitizeOutput(result.sanitized).sanitized).toBe(result.sanitized);
    },
  );

  it("changes only the matching file block when another file has the same body", () => {
    const body = '// $&\neval("globalThis.auditSentinel = 1");';
    const content = [
      "Before the project: $&",
      `\`\`\`tsx file="app/a.tsx"\n${body}\n\`\`\``,
      `\`\`\`tsx file="app/b.tsx"\n${body}\n\`\`\``,
    ].join("\n\n");

    const result = sanitizeOutput(content);

    expect(result.sanitized).toContain("Before the project: $&");
    expect(parseCodeProject(result.sanitized).files.every((file) => !file.content.includes("eval("))).toBe(true);
    expect(result.blockedFiles).toEqual(["app/a.tsx", "app/b.tsx"]);
  });
});
