"use client";

import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { Textarea } from "@/components/ui/textarea";
import type { FileNode } from "@/lib/builder/types";
import { getLanguageFromFileName } from "../code-file-tree-utils";

type Props = {
  showElementRegistry: boolean;
  selectedRegistryLine: number | null;
  rawEditMode: boolean;
  rawCodeDraft: string;
  setRawCodeDraft: (value: string) => void;
  rawCodeSaveError: string | null;
  selectedFile: FileNode | null;
};

/** Raw/codeblock + registry line target for PreviewPanelCodeSectionEditors. */
export function CodeSectionEditorsCodeView({
  showElementRegistry,
  selectedRegistryLine,
  rawEditMode,
  rawCodeDraft,
  setRawCodeDraft,
  rawCodeSaveError,
  selectedFile,
}: Props) {
  return (
    <>
    {showElementRegistry && selectedRegistryLine !== null && (
      <div className="text-xs text-purple-300">Målrad: {selectedRegistryLine}</div>
    )}
    {rawEditMode ? (
      <div className="space-y-2">
        <Textarea
          value={rawCodeDraft}
          onChange={(event) => setRawCodeDraft(event.target.value)}
          className="min-h-[420px] font-mono text-xs"
        />
        {rawCodeSaveError ? (
          <div className="text-xs text-rose-300">{rawCodeSaveError}</div>
        ) : null}
      </div>
    ) : (
      <CodeBlock
        code={selectedFile?.content || ""}
        language={getLanguageFromFileName(selectedFile?.name || "")}
        showLineNumbers
      >
        <CodeBlockCopyButton className="text-gray-300 hover:text-white" />
      </CodeBlock>
    )}
    </>
  );
}
