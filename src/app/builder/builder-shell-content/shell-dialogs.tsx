"use client";

import { DeployNameDialog } from "@/components/builder/publishing/DeployNameDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DomainSearchDialog } from "@/components/builder/publishing/domains/DomainSearchDialog";
import { DomainManager } from "@/components/builder/publishing/domains/DomainManager";
import { SeoReportDialog } from "@/components/builder/publishing/SeoReportDialog";
import { GitHubExportDialog } from "@/components/builder/project-transfer/GitHubExportDialog";
import type { BuilderViewModel } from "../useBuilderPageController";

type ShellDialogsProps = {
  vm: BuilderViewModel;
  githubExportOpen: boolean;
  setGithubExportOpen: (open: boolean) => void;
  hasGitHub: boolean;
  githubUsername: string | null;
};

/** Deploy / domain / SEO / GitHub / template-switch dialogs owned by the chat column. */
export function BuilderShellDialogs({
  vm,
  githubExportOpen,
  setGithubExportOpen,
  hasGitHub,
  githubUsername,
}: ShellDialogsProps) {
  return (
    <>
          <DeployNameDialog
            open={vm.deployNameDialogOpen}
            deployName={vm.deployNameInput}
            deployNameError={vm.deployNameError}
            isDeploying={vm.isDeploying}
            isSaving={false}
            projectId={vm.appProjectId ?? null}
            onDeployNameChange={(value) => {
              vm.setDeployNameInput(value);
              if (vm.deployNameError) vm.setDeployNameError(null);
            }}
            onCancel={() => vm.setDeployNameDialogOpen(false)}
            onConfirm={vm.handleConfirmDeploy}
          />

          <AlertDialog
            open={vm.templateSwitchDialog !== null}
            onOpenChange={(open) => {
              if (!open) vm.cancelTemplateSwitchDialog();
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {vm.templateSwitchDialog?.kind === "new-chat"
                    ? "Starta ny chat från template?"
                    : "Avbryta pågående generering?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {vm.templateSwitchDialog?.kind === "new-chat"
                    ? "Du har redan en aktiv chat. En ny chat startas från vald template och nuvarande konversation finns kvar i historiken."
                    : "Generering pågår just nu. Vill du avbryta och starta från templaten istället?"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel type="button">Avbryt</AlertDialogCancel>
                <AlertDialogAction type="button" onClick={() => vm.confirmTemplateSwitchDialog()}>
                  Fortsätt
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <DomainSearchDialog
            open={vm.domainSearchOpen}
            query={vm.domainQuery}
            results={vm.domainResults}
            isSearching={vm.isDomainSearching}
            onQueryChange={vm.setDomainQuery}
            onSearch={vm.handleDomainSearch}
            onClose={() => vm.setDomainSearchOpen(false)}
          />

          <DomainManager
            open={vm.domainManagerOpen}
            onClose={() => vm.setDomainManagerOpen(false)}
            chatId={vm.chatId}
            deploymentId={vm.activeDeploymentId ?? vm.liveDeploymentId}
          />

          <SeoReportDialog
            report={vm.seoReport}
            onClose={() => vm.setSeoReport(null)}
          />

          <GitHubExportDialog
            open={githubExportOpen}
            onClose={() => setGithubExportOpen(false)}
            chatId={vm.chatId}
            versionId={vm.activeVersionId}
            hasGitHub={hasGitHub}
            isAuthenticated={vm.isAuthenticated}
            suggestedRepoName={vm.appProjectName ?? null}
            githubUsername={githubUsername}
          />
    </>
  );
}
