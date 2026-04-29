"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { SeoOptInPanel, type SeoFormValue } from "./SeoOptInPanel";

type DeployNameDialogProps = {
  open: boolean;
  deployName: string;
  deployNameError: string | null;
  isDeploying: boolean;
  isSaving: boolean;
  /**
   * Project id used by the SEO panel to read/seed persisted preferences.
   * Optional — if absent the SEO panel still renders but won't preload
   * a persisted value.
   */
  projectId?: string | null;
  onDeployNameChange: (value: string) => void;
  onCancel: () => void;
  /**
   * Called with the form values when the user clicks Publicera.
   *
   * `seo` is the (optional) SEO preferences for this single deploy.
   * It's only set when the user actually interacted with the SEO
   * panel; if they left it untouched, `seo` is `undefined` and the
   * server falls back to persisted `project_data.meta.seo`. This
   * avoids a race where a fast Publicera-click before the panel's
   * persisted-fetch returns would overwrite a saved opt-in with the
   * default (false) state.
   *
   * The deploy handler is responsible for persisting `seo` (when
   * present) before triggering the deploy.
   */
  onConfirm: (payload: { seo?: SeoFormValue }) => void;
};

export function DeployNameDialog({
  open,
  deployName,
  deployNameError,
  isDeploying,
  isSaving,
  projectId,
  onDeployNameChange,
  onCancel,
  onConfirm,
}: DeployNameDialogProps) {
  const disabled = isDeploying || isSaving;

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onCancel(); }}>
      {open ? (
        <DeployNameDialogForm
          deployName={deployName}
          deployNameError={deployNameError}
          disabled={disabled}
          isSaving={isSaving}
          projectId={projectId}
          onDeployNameChange={onDeployNameChange}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      ) : null}
    </Dialog>
  );
}

function DeployNameDialogForm({
  deployName,
  deployNameError,
  disabled,
  isSaving,
  projectId,
  onDeployNameChange,
  onCancel,
  onConfirm,
}: Pick<
  DeployNameDialogProps,
  "deployName" | "deployNameError" | "isSaving" | "projectId" | "onDeployNameChange" | "onCancel" | "onConfirm"
> & {
  disabled: boolean;
}) {
  const [seoValue, setSeoValue] = useState<SeoFormValue>({
    optIn: false,
    siteUrl: "",
  });
  const [seoValid, setSeoValid] = useState<boolean>(true);
  // Track whether the user actually interacted with the SEO panel.
  // Stays false during fetch-seed of persisted preferences. Only
  // included in the deploy payload when true.
  const [seoDirty, setSeoDirty] = useState<boolean>(false);

  const canConfirm = !disabled && seoValid;

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Publicera till Vercel</DialogTitle>
        <DialogDescription>
          Namnet används i URL:en (namn.vercel.app) och normaliseras automatiskt.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-2">
          <Input
            value={deployName}
            onChange={(event) => onDeployNameChange(event.target.value)}
            placeholder="t.ex. palma-livsstil"
            disabled={disabled}
          />
          {deployNameError && <div className="text-xs text-red-400">{deployNameError}</div>}
          <p className="text-muted-foreground text-xs">
            Vercel har inga mappar. Använd gärna prefix för gruppering om du vill hålla ordning.
          </p>
        </div>
        <SeoOptInPanel
          projectId={projectId ?? null}
          value={seoValue}
          onChange={setSeoValue}
          onValidityChange={setSeoValid}
          onDirtyChange={setSeoDirty}
          disabled={disabled}
        />
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 space-y-1">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Kostnad:</span> 20 credits för publicering
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Hosting:</span> 10 credits/månad för att hålla
            sajten live
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={disabled}>
            Avbryt
          </Button>
          <Button
            onClick={() => onConfirm({ seo: seoDirty ? seoValue : undefined })}
            disabled={!canConfirm}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publicera"}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
