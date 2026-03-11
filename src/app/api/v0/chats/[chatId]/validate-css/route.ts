import { NextResponse } from "next/server";
import { assertV0Key, v0 } from "@/lib/v0";
import { getChatByV0ChatIdForRequest } from "@/lib/tenant";
import { validateFiles, formatIssuesForDisplay, fixCssIssues } from "@/lib/utils/css-validator";
import { z } from "zod";
import { resolveVersionFiles } from "@/lib/v0/resolve-version-files";
import { shouldUseV0Fallback } from "@/lib/gen/fallback";
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

    // ---------------------------------------------------------------
    // Non-fallback: fetch & update via Postgres engine store
    // ---------------------------------------------------------------
    if (!shouldUseV0Fallback()) {
      const codeFiles = await getVersionFiles(versionId);
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

          await updateVersionFiles(versionId, JSON.stringify(updatedFiles));

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
    }

    // ---------------------------------------------------------------
    // V0 fallback: existing flow
    // ---------------------------------------------------------------
    assertV0Key();

    const dbChat = await getChatByV0ChatIdForRequest(req, chatId);
    if (!dbChat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    const resolved = await resolveVersionFiles({
      chatId,
      versionId,
      options: { maxAttempts: 20, delayMs: 1500, minFiles: 1 },
    });
    const version = resolved.version;
    const files = resolved.files.length > 0 ? resolved.files : (version as any)?.files || [];
    if (files.length === 0) {
      return NextResponse.json({
        valid: true,
        issues: [],
        message: "No files to validate",
      });
    }

    const results = validateFiles(files.map((f: any) => ({ name: f.name, content: f.content })));
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
      const updatedFiles = files.map((file: any) => {
        const result = results.find((r) => r.fileName === file.name);
        const errorIssues = result
          ? result.issues.filter(
              (issue) => issue.severity === "error" && Boolean(issue.suggestion),
            )
          : [];
        if (errorIssues.length > 0) {
          return {
            name: file.name,
            content: fixCssIssues(file.content, errorIssues),
            locked: file.locked,
          };
        }
        return { name: file.name, content: file.content, locked: file.locked };
      });

      try {
        const updatedVersion = await v0.chats.updateVersion({
          chatId,
          versionId,
          files: updatedFiles,
        });

        return NextResponse.json({
          valid: false,
          issues: results,
          fixed: true,
          message: `Fixed ${fixedIssueCount} CSS issues`,
          demoUrl: (updatedVersion as any).demoUrl,
          formattedIssues: formatIssuesForDisplay(results),
        });
      } catch (fixError) {
        console.error("Failed to apply CSS fixes:", fixError);
        return NextResponse.json({
          valid: false,
          issues: results,
          fixed: false,
          message: "Failed to apply fixes",
          error: fixError instanceof Error ? fixError.message : "Unknown error",
          formattedIssues: formatIssuesForDisplay(results),
        });
      }
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
  } catch (err) {
    console.error("CSS validation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validation failed" },
      { status: 500 },
    );
  }
}
