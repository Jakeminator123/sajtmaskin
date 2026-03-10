import { parseCodeProject } from "../parser";

export interface ValidationError {
  file: string;
  line: number;
  column: number;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  fileErrors: Map<string, string[]>;
}

type Loader = "tsx" | "ts" | "jsx" | "js";

const TRANSFORMABLE_EXT = /\.(tsx?|jsx?)$/;

function loaderForFile(path: string): Loader {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  return "js";
}

async function getEsbuild() {
  try {
    return await import("esbuild");
  } catch {
    return null;
  }
}

interface TransformFailureLike {
  errors: Array<{ text: string; location?: { line: number; column: number } | null }>;
}

function isTransformFailure(err: unknown): err is TransformFailureLike {
  return err !== null && typeof err === "object" && "errors" in err && Array.isArray((err as TransformFailureLike).errors);
}

export async function validateGeneratedCode(
  content: string,
): Promise<ValidationResult> {
  const project = parseCodeProject(content);
  const errors: ValidationError[] = [];
  const fileErrors = new Map<string, string[]>();

  const targets = project.files.filter((f) => TRANSFORMABLE_EXT.test(f.path));
  if (targets.length === 0) return { valid: true, errors: [], fileErrors };

  const esbuild = await getEsbuild();
  if (!esbuild) return { valid: true, errors: [], fileErrors };

  await Promise.all(
    targets.map(async (file) => {
      try {
        await esbuild.transform(file.content, {
          loader: loaderForFile(file.path),
          jsx: "preserve",
          logLevel: "silent",
        });
      } catch (err: unknown) {
        if (isTransformFailure(err)) {
          const messages: string[] = [];
          for (const e of err.errors) {
            const line = e.location?.line ?? 0;
            const column = e.location?.column ?? 0;
            errors.push({ file: file.path, line, column, message: e.text });
            messages.push(`line ${line}: ${e.text}`);
          }
          fileErrors.set(file.path, messages);
        } else {
          const msg = err instanceof Error ? err.message : "Unknown transform error";
          errors.push({ file: file.path, line: 0, column: 0, message: msg });
          fileErrors.set(file.path, [msg]);
        }
      }
    }),
  );

  return { valid: errors.length === 0, errors, fileErrors };
}
