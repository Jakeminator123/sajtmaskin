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
    if (err && typeof err === "object" && "errors" in err && Array.isArray((err as { errors: unknown[] }).errors)) {
      const failure = err as { errors: Array<{ text: string; location?: { line: number; column: number } | null }> };
      return {
        valid: false,
        errors: failure.errors.map((e) => ({
          line: e.location?.line ?? 0,
          column: e.location?.column ?? 0,
          message: e.text,
        })),
      };
    }
    return { valid: false, errors: [{ line: 0, column: 0, message: String(err) }] };
  }
}
