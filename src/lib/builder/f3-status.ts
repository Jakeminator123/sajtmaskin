/** Missing environment values grouped under one detected integration. */
export type F3MissingIntegration = {
  key: string;
  name: string;
  missing: string[];
};

/** Shared F3 verdict consumed by builder state, status UI and collapse policy. */
export type F3BuilderStatus = {
  tone: "info" | "warning" | "error" | "success";
  title: string;
  description: string;
  /** Version this verdict describes, when one exists. */
  versionId?: string | null;
  /** Title must be refreshed when live dossier counts catch up to versionId. */
  usesLiveDossierCounts?: boolean;
};
