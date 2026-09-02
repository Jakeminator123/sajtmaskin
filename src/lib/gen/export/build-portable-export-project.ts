import type { CodeFile } from "@/lib/gen/parser";
import {
  buildExportableProject,
  chatUsesVerbatimRepo,
} from "@/lib/gen/export/build-exportable-project";
import { stripGeneratedEnvLocalForZip } from "@/lib/gen/export/strip-env-local-for-zip";

/**
 * Canonical owner-facing artifact assembly. GitHub export and ZIP download must
 * call this same boundary so both ship the project that verify assembled while
 * excluding the generated local-only env placeholder.
 */
export async function buildPortableExportProject(
  storedFiles: CodeFile[],
  chatId: string,
): Promise<CodeFile[]> {
  const verbatimRepo = await chatUsesVerbatimRepo(chatId);
  return stripGeneratedEnvLocalForZip(
    await buildExportableProject(storedFiles, { verbatimRepo }),
  );
}
