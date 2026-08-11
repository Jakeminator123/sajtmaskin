"use client";

import type { FileNode } from "@/lib/builder/types";
import type { PreviewPanelCodeDraftsBundle } from "./usePreviewPanelCodeDrafts";
import { CodeSectionEditorsContent } from "./editors/CodeSectionEditorsContent";
import { CodeSectionEditorsCommerce } from "./editors/CodeSectionEditorsCommerce";
import { CodeSectionEditorsSite } from "./editors/CodeSectionEditorsSite";
import { CodeSectionEditorsCodeView } from "./editors/CodeSectionEditorsCodeView";

type PreviewPanelCodeSectionEditorsProps = {
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
