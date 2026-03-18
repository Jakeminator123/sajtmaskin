import { NextResponse } from "next/server";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";
import { validateFiles, formatIssuesForDisplay, fixCssIssues } from "@/lib/utils/css-validator";
import { z } from "zod";
import { getVersionFiles } from "@/lib/gen/version-manager";
import { updateVersionFiles } from "@/lib/db/chat-repository-pg";

export const runtime = "nodejs";

const validateRequestSchema = z.object({
  versionId: z.string().min(1),
  autoFix: z.boolean().optional().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ chatId: string }> }) {
  try {
    const { chatId } = await params;

    const body = await req.json().catch(() => ({}));
    const validation = validateRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.issues },
        { status: 400 },
      );
    }

    const { versionId, autoFix } = validation.data;

    const scopedVersion = await getEngineVersionForChatByIdForRequest(req, chatId, versionId);
    if (!scopedVersion) {
      return NextResponse.json({ error: "Version not found for chat" }, { status: 404 });
    }
    const codeFiles = await getVersionFiles(scopedVersion.version.id);
    if (codeFiles && codeFiles.length > 0) {
      const filePairs = codeFiles.map((f) => ({ name: f.path, content: f.content }));
      const results = validateFiles(filePairs);
      const hasErrors = results.some((r) => r.issues.some((i) => i.severity === "error"));

      if (results.length === 0) {
        return NextResponse.json({
          valid: true,
          issues: [],
          message: "All CSS files are valid",
        });
      }

      if (autoFix && hasErrors) {
        const fixedIssueCount = results.reduce(
          (sum, result) =>
            sum +
            result.issues.filter(
              (issue) => issue.severity === "error" && Boolean(issue.suggestion),
            ).length,
          0,
        );

        const updatedFiles = codeFiles.map((file) => {
          const result = results.find((r) => r.fileName === file.path);
          const errorIssues = result
            ? result.issues.filter(
                (issue) => issue.severity === "error" && Boolean(issue.suggestion),
              )
            : [];
          if (errorIssues.length > 0) {
            return { ...file, content: fixCssIssues(file.content, errorIssues) };
          }
          return file;
        });

        await updateVersionFiles(scopedVersion.version.id, JSON.stringify(updatedFiles));

        return NextResponse.json({
          valid: false,
          issues: results,
          fixed: true,
          message: `Fixed ${fixedIssueCount} CSS issues`,
          demoUrl: null,
          formattedIssues: formatIssuesForDisplay(results),
        });
      }

      return NextResponse.json({
        valid: !hasErrors,
        issues: results,
        fixed: false,
        message: hasErrors
          ? `Found ${results.reduce((sum, r) => sum + r.issues.filter((i) => i.severity === "error").length, 0)} CSS errors that may cause Tailwind v4 runtime issues`
          : "Found warnings but no critical errors",
        formattedIssues: formatIssuesForDisplay(results),
      });
    }

    return NextResponse.json(
      {
        valid: true,
        issues: [],
        message: "No files to validate",
      },
      { status: 404 },
    );
  } catch (err) {
    console.error("CSS validation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validation failed" },
      { status: 500 },
    );
  }
}
