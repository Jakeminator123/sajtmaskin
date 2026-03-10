import type { ScaffoldManifest } from "@/lib/gen/scaffolds/types";
import type { CodeFile } from "@/lib/gen/parser";

interface ImportFix {
  file: string;
  addedImport: string;
  component: string;
}

/**
 * Verifies that the merged file set still imports scaffold components
 * that are expected in the layout. If the model forgot to import a
 * scaffold header/footer, this function adds the missing import.
 *
 * Runs AFTER mergeVersionFiles, on the fully merged file array.
 */
export function checkScaffoldImports(
  files: CodeFile[],
  scaffold: ScaffoldManifest,
): { files: CodeFile[]; fixes: ImportFix[] } {
  const layoutFile = files.find(
    (f) => f.path === "app/layout.tsx" || f.path === "src/app/layout.tsx",
  );
  if (!layoutFile) return { files, fixes: [] };

  const scaffoldComponents = scaffold.files
    .filter((f) => f.path.startsWith("components/"))
    .map((f) => {
      const exportMatch = f.content.match(
        /export\s+(?:default\s+)?function\s+(\w+)/,
      );
      if (!exportMatch) return null;
      return {
        name: exportMatch[1],
        importPath: `@/${f.path.replace(/\.tsx$/, "")}`,
      };
    })
    .filter(Boolean) as Array<{ name: string; importPath: string }>;

  const fixes: ImportFix[] = [];
  let layoutContent = layoutFile.content;

  for (const comp of scaffoldComponents) {
    const isReferenced =
      layoutContent.includes(`<${comp.name}`) ||
      layoutContent.includes(`<${comp.name}/>`);
    const isImported = layoutContent.includes(comp.name);

    if (isReferenced && !isImported) {
      const importLine = `import { ${comp.name} } from "${comp.importPath}";\n`;
      layoutContent = importLine + layoutContent;
      fixes.push({
        file: layoutFile.path,
        addedImport: importLine.trim(),
        component: comp.name,
      });
    }
  }

  if (fixes.length === 0) return { files, fixes };

  const updatedFiles = files.map((f) =>
    f.path === layoutFile.path ? { ...f, content: layoutContent } : f,
  );

  return { files: updatedFiles, fixes };
}
