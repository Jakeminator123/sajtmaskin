export interface BackofficeFile {
  path: string;
  content: string;
}

export interface BackofficeFileSet {
  files: BackofficeFile[];
  envExample: string;
  setupInstructions: string;
}
