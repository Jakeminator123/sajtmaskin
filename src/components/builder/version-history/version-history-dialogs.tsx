"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VersionDiagnosticsDialog } from "@/components/builder/VersionDiagnosticsDialog";
import { VersionCompareDialog } from "@/components/builder/VersionCompareDialog";
import { VersionCollaboration } from "@/components/builder/VersionCollaboration";
import { GitHubExportDialog } from "@/components/builder/GitHubExportDialog";
import { Loader2 } from "lucide-react";
import type { VersionSummary } from "./types";

type VersionHistoryDialogsProps = {
  chatId: string;
  lifecycleStage: import("@/lib/db/engine-version-lifecycle").EngineVersionLifecycleStage | null;
  versionList: VersionSummary[];
  diagnosticsVersionId: string | null;
  setDiagnosticsVersionId: (id: string | null) => void;
  compareVersionId: string | null;
  setCompareVersionId: (id: string | null) => void;
  collaborationVersionId: string | null;
  setCollaborationVersionId: (id: string | null) => void;
  confirmRestoreVersion: VersionSummary | null;
  setConfirmRestoreVersion: (v: VersionSummary | null) => void;
  restoringVersionId: string | null;
  performRestore: (version: VersionSummary) => Promise<void>;
  githubExportVersionId: string | null;
  setGithubExportVersionId: (id: string | null) => void;
  hasGitHub: boolean;
  isAuthenticated: boolean;
  githubUsername: string | null;
};

export function VersionHistoryDialogs({
  chatId,
  lifecycleStage,
  versionList,
  diagnosticsVersionId,
  setDiagnosticsVersionId,
  compareVersionId,
  setCompareVersionId,
  collaborationVersionId,
  setCollaborationVersionId,
  confirmRestoreVersion,
  setConfirmRestoreVersion,
  restoringVersionId,
  performRestore,
  githubExportVersionId,
  setGithubExportVersionId,
  hasGitHub,
  isAuthenticated,
  githubUsername,
}: VersionHistoryDialogsProps) {
  return (
    <>
      <VersionDiagnosticsDialog
        chatId={chatId}
        versionId={diagnosticsVersionId}
        open={Boolean(diagnosticsVersionId)}
        onOpenChange={(open) => {
          if (!open) setDiagnosticsVersionId(null);
        }}
        lifecycleStage={lifecycleStage}
      />
      <Dialog
        open={Boolean(confirmRestoreVersion)}
        onOpenChange={(open) => {
          if (!open) setConfirmRestoreVersion(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmRestoreVersion &&
              (confirmRestoreVersion.releaseState === "promoted" ||
                confirmRestoreVersion.verificationState === "passed")
                ? "Bekräfta rollback"
                : "Bekräfta återställning"}
            </DialogTitle>
            <DialogDescription>
              {confirmRestoreVersion &&
              (confirmRestoreVersion.releaseState === "promoted" ||
                confirmRestoreVersion.verificationState === "passed")
                ? "Den här versionen var publicerad. En rollback skapar en ny draft som du kan verifiera och publicera."
                : "En ny draftversion skapas baserad på den valda versionen. Den nuvarande aktiva versionen påverkas inte."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRestoreVersion(null)}>
              Avbryt
            </Button>
            <Button
              onClick={() => confirmRestoreVersion && performRestore(confirmRestoreVersion)}
              disabled={!confirmRestoreVersion || restoringVersionId !== null}
            >
              {restoringVersionId ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : confirmRestoreVersion &&
                (confirmRestoreVersion.releaseState === "promoted" ||
                  confirmRestoreVersion.verificationState === "passed") ? (
                "Rollback"
              ) : (
                "Återställ"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <VersionCompareDialog
        chatId={chatId}
        versionId={compareVersionId}
        versions={versionList}
        open={Boolean(compareVersionId)}
        onOpenChange={(open) => {
          if (!open) setCompareVersionId(null);
        }}
      />
      <GitHubExportDialog
        open={Boolean(githubExportVersionId)}
        onClose={() => setGithubExportVersionId(null)}
        chatId={chatId}
        versionId={githubExportVersionId}
        hasGitHub={hasGitHub}
        isAuthenticated={isAuthenticated}
        githubUsername={githubUsername}
      />
      <Dialog
        open={Boolean(collaborationVersionId)}
        onOpenChange={(open) => {
          if (!open) setCollaborationVersionId(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Kommentarer och godkännande</DialogTitle>
            <DialogDescription>
              Lägg till kommentarer eller hantera godkännandeförfrågningar för denna version.
            </DialogDescription>
          </DialogHeader>
          {chatId && collaborationVersionId && (
            <VersionCollaboration
              chatId={chatId}
              versionId={collaborationVersionId}
              className="mt-2"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
