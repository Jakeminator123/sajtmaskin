import type { CodeFile } from "../parser";

export type { CodeFile };

export type ImportBinding = {
  imported: string;
  local: string;
};

export type ParsedImport = {
  source: string;
  defaultImport: string | null;
  namespaceImport: string | null;
  namedImports: ImportBinding[];
};

export type PreparedModule = {
  file: CodeFile;
  transformedCode: string;
  imports: ParsedImport[];
  defaultExportName: string | null;
  transpileErrors: string[];
};

export type PreviewValidationIssue = {
  file: string;
  message: string;
  severity: "error" | "warning";
};
