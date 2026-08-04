"use client";

import type { FileNode } from "@/lib/builder/types";
import type { PreviewPanelCodeDraftsBundle } from "./hooks/usePreviewPanelCodeDrafts";
import { CodeSectionEditorsContent } from "./code-section-editors/CodeSectionEditorsContent";
import { CodeSectionEditorsCommerce } from "./code-section-editors/CodeSectionEditorsCommerce";
import { CodeSectionEditorsSite } from "./code-section-editors/CodeSectionEditorsSite";
import { CodeSectionEditorsCodeView } from "./code-section-editors/CodeSectionEditorsCodeView";

export type PreviewPanelCodeSectionEditorsProps = {
  drafts: PreviewPanelCodeDraftsBundle;
  showElementRegistry: boolean;
  selectedRegistryLine: number | null;
  rawEditMode: boolean;
  rawCodeDraft: string;
  setRawCodeDraft: (value: string) => void;
  rawCodeSaveError: string | null;
  selectedFile: FileNode | null;
};

export function PreviewPanelCodeSectionEditors({
  drafts,
  showElementRegistry,
  selectedRegistryLine,
  rawEditMode,
  rawCodeDraft,
  setRawCodeDraft,
  rawCodeSaveError,
  selectedFile,
}: PreviewPanelCodeSectionEditorsProps) {
  return (
    <>
      <CodeSectionEditorsContent drafts={drafts} />
      <CodeSectionEditorsCommerce drafts={drafts} />
      <CodeSectionEditorsSite drafts={drafts} />
      <CodeSectionEditorsCodeView
        showElementRegistry={showElementRegistry}
        selectedRegistryLine={selectedRegistryLine}
        rawEditMode={rawEditMode}
        rawCodeDraft={rawCodeDraft}
        setRawCodeDraft={setRawCodeDraft}
        rawCodeSaveError={rawCodeSaveError}
        selectedFile={selectedFile}
      />
    </>
  );
}
