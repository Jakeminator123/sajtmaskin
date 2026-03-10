import type { CodeFile } from "@/lib/gen/parser";

interface CrossFileImportFix {
  sourceFile: string;
  missingImport: string;
  stubFile: string;
}

const IMPORT_RE = /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|[\w$]+)(?:\s*,\s*(?:\{[^}]*\}|[\w$]+))*\s+from\s+)?['"]([^'"]+)['"]/g;
const LOCAL_PREFIXES = ["@/", "./", "../"];
const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const INDEX_EXTENSIONS = EXTENSIONS.map((ext) => `/index${ext}`);
const CANDIDATES = [...EXTENSIONS, ...INDEX_EXTENSIONS];

function isLocalImport(source: string): boolean {
  return LOCAL_PREFIXES.some((p) => source.startsWith(p));
}

function normalizeToProjectPath(source: string, importerPath: string): string {
  if (source.startsWith("@/")) return source.slice(2);

  const dir = importerPath.includes("/")
    ? importerPath.slice(0, importerPath.lastIndexOf("/"))
    : ".";
  const parts = [...dir.split("/"), ...source.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part !== ".") resolved.push(part);
  }
  return resolved.join("/");
}

function fileExists(files: Map<string, CodeFile>, basePath: string): boolean {
  if (files.has(basePath)) return true;
  for (const ext of CANDIDATES) {
    if (files.has(basePath + ext)) return true;
  }
  if (files.has(`src/${basePath}`)) return true;
  for (const ext of CANDIDATES) {
    if (files.has(`src/${basePath}${ext}`)) return true;
  }
  return false;
}

function deriveComponentName(importPath: string): string {
  const segment = importPath.split("/").pop() ?? "Component";
  return segment
    .replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^\w/, (c) => c.toUpperCase());
}

function createStubComponent(componentName: string, importPath: string): string {
  return `export default function ${componentName}(props: Record<string, unknown>) {
  return (
    <div
      data-stub="${importPath}"
      style={{
        padding: "2rem",
        border: "2px dashed #666",
        borderRadius: "0.5rem",
        color: "#999",
        textAlign: "center",
        fontSize: "0.875rem",
      }}
    >
      [${componentName}]
    </div>
  );
}

export { ${componentName} };
`;
}

/**
 * Scans all generated files for local imports whose target does not exist
 * in the file set. For each missing target, generates a minimal stub file
 * so the project can build without "Module not found" errors.
 */
export function checkCrossFileImports(
  files: CodeFile[],
): { files: CodeFile[]; fixes: CrossFileImportFix[] } {
  const fileMap = new Map<string, CodeFile>();
  for (const f of files) fileMap.set(f.path, f);

  const fixes: CrossFileImportFix[] = [];
  const stubbed = new Set<string>();

  for (const file of files) {
    if (!file.path.match(/\.(tsx?|jsx?)$/)) continue;

    for (const match of file.content.matchAll(IMPORT_RE)) {
      const source = match[1];
      if (!isLocalImport(source)) continue;

      const projectPath = normalizeToProjectPath(source, file.path);
      if (fileExists(fileMap, projectPath)) continue;
      if (stubbed.has(projectPath)) continue;

      const stubPath = projectPath.endsWith(".tsx") || projectPath.endsWith(".ts")
        ? projectPath
        : `${projectPath}.tsx`;

      if (fileMap.has(stubPath)) continue;
      stubbed.add(projectPath);

      const componentName = deriveComponentName(projectPath);
      const stubContent = createStubComponent(componentName, source);

      const stubFile: CodeFile = {
        path: stubPath,
        content: stubContent,
        language: "tsx",
      };
      fileMap.set(stubPath, stubFile);

      fixes.push({
        sourceFile: file.path,
        missingImport: source,
        stubFile: stubPath,
      });
    }
  }

  if (fixes.length === 0) return { files, fixes };

  return { files: Array.from(fileMap.values()), fixes };
}
