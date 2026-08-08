import { countParseErrors, GUARDABLE_EXT_RE } from "../rules/import-binding-ast";

export interface SyntaxValidation {
  valid: boolean;
  errors: Array<{ line: number; column: number; message: string }>;
}

type Loader = "tsx" | "ts" | "jsx" | "js" | "css";

const EXT_TO_LOADER: Record<string, Loader> = {
  ".tsx": "tsx",
  ".ts": "ts",
  ".jsx": "jsx",
  ".js": "js",
  ".css": "css",
};

function inferLoader(filename: string): Loader | undefined {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return undefined;
  return EXT_TO_LOADER[filename.slice(dot)];
}

async function getEsbuild() {
  try {
    return await import("esbuild");
  } catch {
    return null;
  }
}

export async function validateSyntax(
  code: string,
  filename: string,
): Promise<SyntaxValidation> {
  const loader = inferLoader(filename);
  if (!loader) return { valid: true, errors: [] };

  const esbuild = await getEsbuild();
  if (!esbuild) return { valid: true, errors: [] };

  try {
    await esbuild.transform(code, {
      loader,
      jsx: loader === "tsx" || loader === "jsx" ? "preserve" : undefined,
      logLevel: "silent",
    });
    return { valid: true, errors: [] };
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "errors" in err &&
      Array.isArray((err as { errors: unknown[] }).errors)
    ) {
      const failure = err as {
        errors: Array<{ text: string; location?: { line: number; column: number } | null }>;
      };
      return {
        valid: false,
        errors: failure.errors.map((e) => ({
          line: e.location?.line ?? 0,
          column: e.location?.column ?? 0,
          message: e.text,
        })),
      };
    }
    return {
      valid: false,
      errors: [{ line: 0, column: 0, message: String(err) }],
    };
  }
}

/**
 * Validity guard for a single mechanical fixer.
 *
 * A mechanical fixer must never leave a file LESS parseable than it found it.
 * Given the code `before` and `after` a fixer ran, this returns `after` unless
 * the fixer turned parseable input into UNPARSEABLE output (valid before,
 * invalid after) — in which case it returns `before` and records a warning.
 *
 * It deliberately does NOT revert when the input was already unparseable: that
 * breakage is upstream (model/stream output) and must stay visible to the
 * syntax-validator / preflight gate rather than be masked here.
 *
 * Net effect: a guarded fixer becomes "revert-only safe" — it can fix or
 * no-op, but it can never be the step that introduces a syntax error. This is
 * the defence-in-depth recommended by the autofix deep-audit (2026-06-24).
 */
/**
 * Default validator: the synchronous TypeScript parser. Dependency-free (TS is
 * a runtime dependency) and dialect-correct per extension, so it works in
 * production-style installs where the dev-only `esbuild` may be absent — and it
 * does NOT mis-flag valid `.jsx`/`.tsx` JSX as broken. Returns the
 * `SyntaxValidation` shape so the (still injectable) signature is unchanged.
 */
function validateSyntaxViaTsParser(code: string, filePath: string): SyntaxValidation {
  const errors = countParseErrors(code, filePath);
  return errors === 0
    ? { valid: true, errors: [] }
    : { valid: false, errors: [{ line: 0, column: 0, message: `${errors} parse error(s)` }] };
}

export async function guardFixerSyntax(
  before: string,
  after: string,
  filePath: string,
  fixerId: string,
  warnings: string[],
  /**
   * Injectable for tests; defaults to the **TypeScript-parser** validator (no
   * dev-only esbuild reliance). Previously defaulted to esbuild, which is only
   * a dev/transitive dependency — in production-style installs `validateSyntax`
   * could silently fall back to `valid: true` for everything, letting a broken
   * jsx-checker output pass unreverted (Codex P2 finding on #237).
   */
  validate: (
    code: string,
    filePath: string,
  ) => SyntaxValidation | Promise<SyntaxValidation> = validateSyntaxViaTsParser,
): Promise<{ code: string; reverted: boolean }> {
  if (after === before) return { code: after, reverted: false };
  if (!GUARDABLE_EXT_RE.test(filePath)) return { code: after, reverted: false };

  const afterResult = await validate(after, filePath);
  if (afterResult.valid) return { code: after, reverted: false };

  const beforeResult = await validate(before, filePath);
  if (!beforeResult.valid) {
    // Pre-existing breakage — not this fixer's fault. Keep `after`.
    return { code: after, reverted: false };
  }

  warnings.push(
    `[${filePath}] ${fixerId} reverted: it made a parseable file unparseable ` +
      `(${afterResult.errors[0]?.message ?? "syntax error"}) — kept pre-fixer content`,
  );
  return { code: before, reverted: true };
}
