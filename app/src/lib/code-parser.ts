// Code parser for converting v0 API response to Sandpack file format
// Extracts code from markdown code blocks and organizes into files

export interface SandpackFile {
  code: string;
  hidden?: boolean;
  active?: boolean;
  readOnly?: boolean;
}

export type SandpackFiles = Record<string, SandpackFile | string>;

// v0 API returns structured files
export interface GeneratedFile {
  name: string;
  content: string;
}

/**
 * Convert v0 Platform API files directly to Sandpack format
 * This is the preferred method when using v0-sdk
 */
export function convertV0FilesToSandpack(
  files: GeneratedFile[]
): SandpackFiles {
  if (!files || files.length === 0) {
    console.log("[code-parser] No files provided, returning defaults");
    return getDefaultFiles();
  }

  console.log(
    "[code-parser] Converting",
    files.length,
    "v0 files to Sandpack format"
  );

  const sandpackFiles: SandpackFiles = {};

  // First, add all the v0 files
  files.forEach((file) => {
    // Normalize the path: v0 returns paths like "app/page.tsx" or "components/header.tsx"
    let path = file.name;

    // Ensure path starts with /
    if (!path.startsWith("/")) {
      path = "/" + path;
    }

    // v0 uses Next.js structure (app/page.tsx), but Sandpack expects React structure
    // Map common patterns
    if (path === "/app/page.tsx" || path === "/page.tsx") {
      path = "/App.tsx";
    } else if (path.startsWith("/app/")) {
      // Remove 'app/' prefix for other files
      path = path.replace("/app/", "/");
    }

    // Convert @/ path aliases to relative paths for Sandpack compatibility
    // Sandpack doesn't understand Next.js path aliases
    let content = convertPathAliases(file.content, path);

    sandpackFiles[path] = {
      code: content,
      active: path === "/App.tsx",
    };
  });

  // Check if we have an App.tsx, if not create one that imports page.tsx
  if (!sandpackFiles["/App.tsx"]) {
    // Look for a page.tsx or similar entry point
    const pageFile = files.find(
      (f) =>
        f.name.includes("page.tsx") ||
        f.name.includes("Page.tsx") ||
        f.name.includes("index.tsx")
    );

    if (pageFile) {
      sandpackFiles["/App.tsx"] = {
        code: convertPathAliases(pageFile.content, "/App.tsx"),
        active: true,
      };
    }
  }

  // Create proper index and entry files for Sandpack
  const result: SandpackFiles = {
    // Entry point
    "/index.tsx": {
      code: `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
      hidden: true,
    },
    // Global styles
    "/styles.css": {
      code: `@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  min-height: 100%;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
}`,
      hidden: true,
    },
    // HTML template
    "/public/index.html": {
      code: `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview - SajtMaskin</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
      hidden: true,
    },
    // Add all the v0 generated files
    ...sandpackFiles,
  };

  console.log(
    "[code-parser] Created Sandpack files:",
    Object.keys(result).filter((k) => {
      const file = result[k];
      return typeof file === "string" || !file?.hidden;
    })
  );

  return result;
}

/**
 * Convert Next.js path aliases (@/) to relative paths for Sandpack
 * @param content - The file content with imports
 * @param currentFilePath - The path of the current file (e.g., "/App.tsx" or "/components/header.tsx")
 */
function convertPathAliases(content: string, currentFilePath: string): string {
  if (!content) return content;

  // Calculate the depth of the current file to determine relative path prefix
  const pathParts = currentFilePath.split("/").filter(Boolean);
  const depth = pathParts.length - 1; // -1 because the filename itself doesn't count

  // Create the relative prefix based on depth
  // If we're at root (/App.tsx), depth is 0, so we use "./"
  // If we're in /components/header.tsx, depth is 1, so we use "./"
  // The key insight: @/ always refers to the root, so we need to go up 'depth' levels
  const getRelativePrefix = (targetPath: string) => {
    // If depth is 0 (root level file), just use "./"
    if (depth === 0) {
      return "./";
    }
    // Otherwise, go up 'depth' levels
    return "../".repeat(depth);
  };

  // Replace @/ imports with relative paths
  // Match: from "@/something" or from '@/something'
  const result = content.replace(
    /from\s+["']@\/([^"']+)["']/g,
    (match, importPath) => {
      const relativePrefix = getRelativePrefix(importPath);
      return `from "${relativePrefix}${importPath}"`;
    }
  );

  // Also handle import() dynamic imports
  const result2 = result.replace(
    /import\(["']@\/([^"']+)["']\)/g,
    (match, importPath) => {
      const relativePrefix = getRelativePrefix(importPath);
      return `import("${relativePrefix}${importPath}")`;
    }
  );

  return result2;
}

/**
 * Parse code from v0 API response into Sandpack file format
 * v0 typically returns React/TSX code, sometimes with multiple files in code blocks
 */
export function parseCodeToSandpackFiles(code: string): SandpackFiles {
  if (!code || typeof code !== "string") {
    return getDefaultFiles();
  }

  console.log("[code-parser] Input code starts with:", code.substring(0, 50));

  // Try to extract code blocks from markdown format
  const codeBlocks = extractCodeBlocks(code);
  console.log("[code-parser] Found code blocks:", codeBlocks.length);

  if (codeBlocks.length > 0) {
    console.log(
      "[code-parser] Using code blocks, first block content starts:",
      codeBlocks[0].content.substring(0, 50)
    );
    return createFilesFromCodeBlocks(codeBlocks);
  }

  // If no code blocks found but code contains markdown backticks, try to extract manually
  const cleanedCode = stripMarkdownWrapper(code);
  console.log(
    "[code-parser] No blocks found, stripped code starts:",
    cleanedCode.substring(0, 50)
  );

  // If no code blocks found, treat the entire content as a single component
  return createFilesFromRawCode(cleanedCode);
}

/**
 * Strip markdown code block wrapper if present
 * Handles cases where the regex didn't match
 */
function stripMarkdownWrapper(code: string): string {
  let result = code.trim();

  // Remove opening ```tsx or ```jsx etc.
  result = result.replace(
    /^```(?:tsx?|jsx?|typescript|javascript|css|html)?\s*\n?/i,
    ""
  );

  // Remove closing ```
  result = result.replace(/\n?```\s*$/i, "");

  // Also handle 'use client' directive at the very start
  result = result.trim();

  return result;
}

interface CodeBlock {
  language: string;
  filename?: string;
  content: string;
}

/**
 * Extract code blocks from markdown-style formatted text
 * Supports: ```tsx, ```jsx, ```typescript, ```javascript, ```css
 */
function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  // Match code blocks with optional filename: ```tsx filename="App.tsx"
  // or just language: ```tsx
  // Made more flexible: allows spaces/newlines after language, handles various formats
  const codeBlockRegex =
    /```(tsx?|jsx?|typescript|javascript|css|html)(?:\s+filename=["']([^"']+)["'])?\s*\n([\s\S]*?)```/g;

  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const [, language, filename, content] = match;
    blocks.push({
      language: normalizeLanguage(language),
      filename: filename || undefined,
      content: content.trim(),
    });
  }

  // If no blocks found, try alternative patterns
  if (blocks.length === 0) {
    // Try matching without strict newline requirement
    const altRegex =
      /```(tsx?|jsx?|typescript|javascript|css|html)\s*([\s\S]*?)```/g;
    while ((match = altRegex.exec(text)) !== null) {
      const [, language, content] = match;
      // Skip if content starts with another backtick (nested)
      if (!content.trim().startsWith("```")) {
        blocks.push({
          language: normalizeLanguage(language),
          content: content.trim(),
        });
      }
    }
  }

  return blocks;
}

/**
 * Normalize language identifier
 */
function normalizeLanguage(lang: string): string {
  const langMap: Record<string, string> = {
    tsx: "tsx",
    ts: "ts",
    typescript: "ts",
    jsx: "jsx",
    js: "js",
    javascript: "js",
    css: "css",
    html: "html",
  };
  return langMap[lang.toLowerCase()] || "tsx";
}

/**
 * Create Sandpack files from extracted code blocks
 */
function createFilesFromCodeBlocks(blocks: CodeBlock[]): SandpackFiles {
  const files: SandpackFiles = {};
  let hasMainComponent = false;
  let mainComponentContent = "";

  blocks.forEach((block, index) => {
    const ext = getExtension(block.language);
    const filename =
      block.filename || getDefaultFilename(block.language, index);

    // Check if this looks like the main component
    if (
      (ext === "tsx" || ext === "jsx") &&
      (block.content.includes("export default") ||
        block.content.includes("export function") ||
        index === 0)
    ) {
      if (!hasMainComponent) {
        hasMainComponent = true;
        mainComponentContent = block.content;
      }
    }

    // Add CSS files directly
    if (ext === "css") {
      files[`/${filename}`] = {
        code: block.content,
        hidden: false,
      };
    }
  });

  // Create the main App component file
  if (hasMainComponent) {
    files["/App.tsx"] = {
      code: wrapAsAppComponent(mainComponentContent),
      active: true,
    };
  } else if (blocks.length > 0) {
    // Use the first block as the main component
    files["/App.tsx"] = {
      code: wrapAsAppComponent(blocks[0].content),
      active: true,
    };
  }

  // Add essential files if not present
  return {
    ...getBaseFiles(),
    ...files,
  };
}

/**
 * Create Sandpack files from raw code (no markdown blocks)
 */
function createFilesFromRawCode(code: string): SandpackFiles {
  const cleanCode = code.trim();

  // Check if the code is already a valid React component
  const isValidComponent =
    cleanCode.includes("export") ||
    cleanCode.includes("function") ||
    cleanCode.includes("const") ||
    cleanCode.includes("import");

  const appCode = isValidComponent
    ? wrapAsAppComponent(cleanCode)
    : createSimpleComponent(cleanCode);

  return {
    ...getBaseFiles(),
    "/App.tsx": {
      code: appCode,
      active: true,
    },
  };
}

/**
 * Wrap code as a proper App component
 * Handles various formats v0 might return
 */
function wrapAsAppComponent(code: string): string {
  // Check if code already has any form of default export
  const hasDefaultExport =
    code.includes("export default function App") ||
    code.includes("export default App") ||
    /export\s+default\s+\w+/.test(code) ||
    /export\s+default\s+function\s+\w+/.test(code);

  // If it already has export default App, use as is
  if (
    code.includes("export default function App") ||
    code.includes("export default App")
  ) {
    return ensureImports(code);
  }

  // If it has export default function SomeName, rename to App
  const defaultFunctionMatch = code.match(/export default function (\w+)/);
  if (defaultFunctionMatch) {
    const componentName = defaultFunctionMatch[1];
    // Replace the export and any references
    const modified = code.replace(
      `export default function ${componentName}`,
      "export default function App"
    );
    return ensureImports(modified);
  }

  // If it has a separate default export like "export default SomeName"
  const separateDefaultMatch = code.match(/export\s+default\s+(\w+)\s*;?/);
  if (separateDefaultMatch && !separateDefaultMatch[0].includes("function")) {
    const componentName = separateDefaultMatch[1];
    // Replace the default export with App and rename the component
    let modified = code.replace(separateDefaultMatch[0], "export default App;");
    // Also rename the component declaration if it exists
    const componentDeclRegex = new RegExp(
      `(export\\s+)?(function|const)\\s+${componentName}\\b`
    );
    modified = modified.replace(componentDeclRegex, "$1$2 App");
    return ensureImports(modified);
  }

  // Handle arrow function components: const ComponentName: React.FC = ...
  // or const ComponentName = () => ...
  const arrowFunctionMatch = code.match(
    /const\s+(\w+)(?:\s*:\s*React\.FC[^=]*)?\s*=\s*(?:\([^)]*\)|[^=])\s*=>/
  );
  if (arrowFunctionMatch && !hasDefaultExport) {
    const componentName = arrowFunctionMatch[1];
    // Add export default at the end
    return ensureImports(code) + `\n\nexport default ${componentName};`;
  }

  // If it has a named export like export function Component (but no default export)
  const namedExportMatch = code.match(/export function (\w+)/);
  if (namedExportMatch && !hasDefaultExport) {
    const componentName = namedExportMatch[1];
    // Add a default export
    return ensureImports(code) + `\n\nexport default ${componentName};`;
  }

  // Handle const Component = () => ... without type annotation
  const simpleArrowMatch = code.match(/const\s+(\w+)\s*=\s*\(/);
  if (simpleArrowMatch && !hasDefaultExport && code.includes("=>")) {
    const componentName = simpleArrowMatch[1];
    return ensureImports(code) + `\n\nexport default ${componentName};`;
  }

  // If it's just JSX without function wrapper, wrap it
  if (
    !code.includes("function") &&
    !code.includes("const") &&
    code.includes("<")
  ) {
    return `import React from "react";

export default function App() {
  return (
    ${code}
  );
}`;
  }

  // Otherwise, wrap the entire code in a function
  return ensureImports(`
export default function App() {
  return (
    <>
      ${code}
    </>
  );
}`);
}

/**
 * Ensure necessary imports are present
 */
function ensureImports(code: string): string {
  let result = code;

  // Add React import if not present and using JSX
  if (!result.includes("import React") && !result.includes('from "react"')) {
    result = 'import React from "react";\n' + result;
  }

  return result;
}

/**
 * Create a simple component from text/HTML
 */
function createSimpleComponent(content: string): string {
  return `import React from "react";

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        ${content}
      </div>
    </div>
  );
}`;
}

/**
 * Get file extension from language
 */
function getExtension(language: string): string {
  const extMap: Record<string, string> = {
    tsx: "tsx",
    ts: "ts",
    jsx: "jsx",
    js: "js",
    css: "css",
    html: "html",
  };
  return extMap[language] || "tsx";
}

/**
 * Get default filename based on language and index
 */
function getDefaultFilename(language: string, index: number): string {
  const ext = getExtension(language);
  if (ext === "css") {
    return index === 0 ? "styles.css" : `styles${index}.css`;
  }
  if (index === 0) {
    return `Component.${ext}`;
  }
  return `Component${index}.${ext}`;
}

/**
 * Get base files required for Sandpack to work
 */
function getBaseFiles(): SandpackFiles {
  return {
    "/index.tsx": {
      code: `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
      hidden: true,
    },
    "/styles.css": {
      code: `@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom styles */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  min-height: 100%;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
}`,
      hidden: true,
    },
    "/public/index.html": {
      code: `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview - SajtMaskin</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
      hidden: true,
    },
  };
}

/**
 * Get default files when no code is provided
 */
function getDefaultFiles(): SandpackFiles {
  return {
    ...getBaseFiles(),
    "/App.tsx": {
      code: `import React from "react";

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="flex justify-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: "0ms" }} />
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: "150ms" }} />
          <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: "300ms" }} />
        </div>
        <p className="text-zinc-500 text-sm">Väntar på generering...</p>
      </div>
    </div>
  );
}`,
      active: true,
    },
  };
}
