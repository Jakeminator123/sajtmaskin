import { describe, expect, it } from "vitest";
import { fixZodV4Params } from "./zod-v4-params-fixer";

// Minimized from prod chat fc0f053b (components/contact-form.tsx line 76):
// Zod 3 `errorMap` against the zod ^4 baseline broke the params overload and
// cascaded TS2322 into every FormField in the file.
const PROD_SHAPE = `import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "Ange ditt namn."),
  consent: z.literal(true, {
    errorMap: () => ({
      message: "Du behöver godkänna villkoren.",
    }),
  }),
});
`;

describe("fixZodV4Params", () => {
  it("rewrites the Zod 3 errorMap arrow param to Zod 4 message", () => {
    const result = fixZodV4Params(PROD_SHAPE, "components/contact-form.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).not.toContain("errorMap");
    expect(result.code).toContain('message: "Du behöver godkänna villkoren."');
    expect(result.code).toContain("z.literal(true, {");
    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0].fixer).toBe("zod-v4-params-fixer");
  });

  it("is idempotent", () => {
    const once = fixZodV4Params(PROD_SHAPE, "components/contact-form.tsx");
    const twice = fixZodV4Params(once.code, "components/contact-form.tsx");
    expect(twice.fixed).toBe(false);
    expect(twice.code).toBe(once.code);
  });

  it("handles single-line form and an ignored issue parameter", () => {
    const code = `import { z } from "zod";
const s = z.string({ errorMap: (issue) => ({ message: 'Fel värde' }) });
`;
    const result = fixZodV4Params(code, "lib/schema.ts");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain("z.string({ message: 'Fel värde' })");
  });

  it("does NOT touch an errorMap that inspects its issue argument", () => {
    const code = `import { z } from "zod";
const s = z.string({
  errorMap: (issue) => ({ message: issue.code === "too_small" ? "För kort" : "Fel" }),
});
`;
    const result = fixZodV4Params(code, "lib/schema.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("does NOT touch files that do not import zod", () => {
    const code = `const config = { errorMap: () => ({ message: "custom" }) };\n`;
    const result = fixZodV4Params(code, "lib/other.ts");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("rewrites multiple occurrences and counts them", () => {
    const code = `import { z } from "zod";
const a = z.literal(true, { errorMap: () => ({ message: "A" }) });
const b = z.literal(false, { errorMap: () => ({ message: \`B\` }) });
`;
    const result = fixZodV4Params(code, "lib/schema.ts");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain('{ message: "A" }');
    expect(result.code).toContain("{ message: `B` }");
    expect(result.fixes[0].description).toContain("2");
  });
});
