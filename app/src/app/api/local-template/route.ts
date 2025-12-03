import { NextRequest, NextResponse } from "next/server";
import { getLocalTemplateById } from "@/lib/local-templates";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface TemplateFile {
  name: string;
  content: string;
}

/**
 * GET /api/local-template?id=xxx
 * Returns the code for a local template
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const templateId = searchParams.get("id");

  if (!templateId) {
    return NextResponse.json(
      { success: false, error: "Template ID is required" },
      { status: 400 }
    );
  }

  const template = getLocalTemplateById(templateId);

  if (!template) {
    return NextResponse.json(
      { success: false, error: "Template not found" },
      { status: 404 }
    );
  }

  try {
    // SMART: If template has v0TemplateId but no local files, return early
    // Frontend will use generateFromTemplate() directly with v0 API
    if (template.v0TemplateId && (!template.folderPath || !template.mainFile)) {
      console.log(
        "[local-template] Template has v0TemplateId, skipping file read:",
        template.id,
        "→",
        template.v0TemplateId
      );
      return NextResponse.json({
        success: true,
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          v0TemplateId: template.v0TemplateId,
          complexity: template.complexity,
        },
        code: "", // No local code
        files: [], // No local files
        hasMainFile: false,
        useV0Api: true, // Signal to frontend to use v0 API directly
      });
    }

    // Build the path to the template folder
    const templatesBasePath = path.join(process.cwd(), "src", "templates");
    const templateFolderPath = path.join(
      templatesBasePath,
      template.folderPath
    );

    // Check if template folder exists
    if (!fs.existsSync(templateFolderPath)) {
      console.error(
        "[local-template] Template folder not found:",
        templateFolderPath
      );
      return NextResponse.json(
        { success: false, error: "Template files not found on disk" },
        { status: 404 }
      );
    }

    // Read all relevant files from the template
    const files: TemplateFile[] = [];

    // Read main page.tsx
    const mainFilePath = path.join(templateFolderPath, template.mainFile);
    if (fs.existsSync(mainFilePath)) {
      files.push({
        name: "page.tsx",
        content: fs.readFileSync(mainFilePath, "utf-8"),
      });
    }

    // Read globals.css if it exists
    const globalsCssPath = path.join(templateFolderPath, "app", "globals.css");
    if (fs.existsSync(globalsCssPath)) {
      files.push({
        name: "globals.css",
        content: fs.readFileSync(globalsCssPath, "utf-8"),
      });
    }

    // Read layout.tsx if it exists
    const layoutPath = path.join(templateFolderPath, "app", "layout.tsx");
    if (fs.existsSync(layoutPath)) {
      files.push({
        name: "layout.tsx",
        content: fs.readFileSync(layoutPath, "utf-8"),
      });
    }

    // Read components folder
    const componentsPath = path.join(templateFolderPath, "components");
    if (fs.existsSync(componentsPath)) {
      const componentFiles = readDirectoryRecursive(
        componentsPath,
        "components"
      );
      files.push(...componentFiles);
    }

    // Read lib/utils.ts if it exists
    const utilsPath = path.join(templateFolderPath, "lib", "utils.ts");
    if (fs.existsSync(utilsPath)) {
      files.push({
        name: "lib/utils.ts",
        content: fs.readFileSync(utilsPath, "utf-8"),
      });
    }

    // Get the main code (page.tsx content)
    // Try multiple possible entry points
    const mainFile =
      files.find((f) => f.name === "page.tsx") ||
      files.find((f) => f.name === "App.tsx") ||
      files.find((f) => f.name.endsWith("/page.tsx")) ||
      files.find((f) => f.name.endsWith(".tsx") && !f.name.includes("/ui/"));

    const code = mainFile?.content || "";

    // If no main file found and we have no files at all, return error
    if (files.length === 0) {
      console.error("[local-template] No files found in template:", templateId);
      return NextResponse.json(
        { success: false, error: "Template has no files" },
        { status: 404 }
      );
    }

    // Warn if no main entry point found (but still return files)
    if (!code) {
      console.warn(
        "[local-template] No main entry file found for template:",
        templateId,
        "Available files:",
        files.map((f) => f.name).slice(0, 10)
      );
    }

    console.log(
      "[local-template] Loaded template:",
      templateId,
      "with",
      files.length,
      "files,",
      "main file:",
      mainFile?.name || "none"
    );

    return NextResponse.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        v0TemplateId: template.v0TemplateId, // Can use v0 API directly if available!
        complexity: template.complexity,
      },
      code,
      files,
      hasMainFile: !!mainFile,
    });
  } catch (error) {
    console.error("[local-template] Error reading template:", error);
    return NextResponse.json(
      { success: false, error: "Failed to read template files" },
      { status: 500 }
    );
  }
}

/**
 * Recursively read all .tsx, .ts, and .css files from a directory
 */
function readDirectoryRecursive(
  dirPath: string,
  relativePath: string
): TemplateFile[] {
  const files: TemplateFile[] = [];

  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.join(relativePath, entry.name).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      // Recursively read subdirectories
      files.push(...readDirectoryRecursive(fullPath, relPath));
    } else if (entry.isFile()) {
      // Only include relevant file types
      const ext = path.extname(entry.name).toLowerCase();
      if ([".tsx", ".ts", ".css"].includes(ext)) {
        try {
          files.push({
            name: relPath,
            content: fs.readFileSync(fullPath, "utf-8"),
          });
        } catch (err) {
          console.error("[local-template] Error reading file:", fullPath, err);
        }
      }
    }
  }

  return files;
}
