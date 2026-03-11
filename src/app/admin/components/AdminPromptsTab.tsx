"use client";

import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPromptAssistModelLabel } from "@/lib/builder/defaults";
import { MODEL_LABELS, canonicalizeModelId } from "@/lib/v0/models";
import type { PromptLog } from "./types";

interface AdminPromptsTabProps {
  promptLogs: PromptLog[];
  promptLogsLoading: boolean;
  promptLogsError: string | null;
  onRefresh: () => void | Promise<void>;
}

export function AdminPromptsTab({
  promptLogs,
  promptLogsLoading,
  promptLogsError,
  onRefresh,
}: AdminPromptsTabProps) {
  return (
    <div className="space-y-6">
      <div className="border border-gray-800 bg-black/50 p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-brand-teal/10 flex h-10 w-10 items-center justify-center">
              <FileText className="text-brand-teal h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Promptloggar</h2>
              <p className="text-sm text-gray-500">Senaste 20 körningar (val + genererad prompt)</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onRefresh()}
            disabled={promptLogsLoading}
            className="gap-2 border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${promptLogsLoading ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
        </div>

        {promptLogsLoading && <p className="text-sm text-gray-500">Hämtar promptloggar...</p>}
        {promptLogsError && <p className="text-sm text-red-400">{promptLogsError}</p>}

        {!promptLogsLoading && !promptLogsError && promptLogs.length === 0 && (
          <p className="text-sm text-gray-500">Inga promptloggar hittades ännu.</p>
        )}

        {promptLogs.length > 0 && (
          <div className="space-y-4">
            {promptLogs.map((log) => (
              <div key={log.id} className="border border-gray-800 bg-black/30 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                  <span>{log.createdAt ? new Date(log.createdAt).toLocaleString("sv-SE") : "okänd tid"}</span>
                  <span>• {log.event}</span>
                  {log.modelTier && (
                    <span>
                      • Byggmodell:{" "}
                      {(() => {
                        const canonicalModelTier = canonicalizeModelId(log.modelTier);
                        return canonicalModelTier ? MODEL_LABELS[canonicalModelTier] : log.modelTier;
                      })()}
                    </span>
                  )}
                  {log.buildIntent && <span>• Intent: {log.buildIntent}</span>}
                  {log.buildMethod && <span>• Metod: {log.buildMethod}</span>}
                  {typeof log.imageGenerations === "boolean" && (
                    <span>• Bilder: {log.imageGenerations ? "på" : "av"}</span>
                  )}
                  {typeof log.thinking === "boolean" && (
                    <span>• Thinking: {log.thinking ? "på" : "av"}</span>
                  )}
                  {log.promptAssistModel && (
                    <span>• Förbättra-modell: {getPromptAssistModelLabel(log.promptAssistModel)}</span>
                  )}
                  {typeof log.promptAssistDeep === "boolean" && (
                    <span>• Deep: {log.promptAssistDeep ? "ja" : "nej"}</span>
                  )}
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-xs text-gray-500">Prompt (original)</p>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-200">
                      {log.promptOriginal || "—"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Prompt (formaterad)</p>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-200">
                      {log.promptFormatted || "—"}
                    </pre>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-xs text-gray-500">Systemprompt</p>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-gray-200">
                    {log.systemPrompt || "—"}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
