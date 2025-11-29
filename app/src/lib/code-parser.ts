// Code parser for converting v0 API response to Sandpack file format
// Extracts code from markdown code blocks and organizes into files

export interface SandpackFile {
  code: string;
  hidden?: boolean;
  active?: boolean;
  readOnly?: boolean;
}

export type SandpackFiles = Record<string, SandpackFile | string>;

/**
 * Parse code from v0 API response into Sandpack file format
 * v0 typically returns React/TSX code, sometimes with multiple files in code blocks
 */
export function parseCodeToSandpackFiles(code: string): SandpackFiles {
  if (!code || typeof code !== "string") {
    return getDefaultFiles();
  }

  // Try to extract code blocks from markdown format
  const codeBlocks = extractCodeBlocks(code);

  if (codeBlocks.length > 0) {
    return createFilesFromCodeBlocks(codeBlocks);
  }

  // If no code blocks found, treat the entire content as a single component
  return createFilesFromRawCode(code);
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
  const codeBlockRegex =
    /```(tsx?|jsx?|typescript|javascript|css|html)(?:\s+(?:filename=["']([^"']+)["'])?)?\n([\s\S]*?)```/g;

  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const [, language, filename, content] = match;
    blocks.push({
      language: normalizeLanguage(language),
      filename: filename || undefined,
      content: content.trim(),
    });
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

  // If it has a named export like export function Component (but no default export)
  const namedExportMatch = code.match(/export function (\w+)/);
  if (namedExportMatch && !hasDefaultExport) {
    const componentName = namedExportMatch[1];
    // Add a default export
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
