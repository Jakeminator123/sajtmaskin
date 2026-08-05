import { getDossierById } from "@/lib/gen/dossiers/registry";
import { resolveDossierIdsPresentInVersion } from "@/lib/gen/dossiers/version-presence";

export interface FinalDossierFileEvidence {
  fileEvidenceCapabilities: string[];
  fileEvidenceDossierIds: string[];
}

/** Derive exact dossier evidence from the post-merge `files_json` payload. */
export function resolveFinalDossierFileEvidence(
  filesJson: string,
): FinalDossierFileEvidence {
  const parsedFiles: unknown = JSON.parse(filesJson);
  const finalFilePaths = Array.isArray(parsedFiles)
    ? parsedFiles
        .map((file) =>
          file && typeof file === "object" && typeof file.path === "string"
            ? file.path
            : "",
        )
        .filter(Boolean)
    : [];
  const fileEvidenceDossierIds = resolveDossierIdsPresentInVersion(finalFilePaths);
  const fileEvidenceCapabilities = Array.from(
    new Set(
      fileEvidenceDossierIds
        .map((dossierId) => getDossierById(dossierId)?.capability.trim().toLowerCase())
        .filter((capability): capability is string => Boolean(capability)),
    ),
  );
  return { fileEvidenceCapabilities, fileEvidenceDossierIds };
}
