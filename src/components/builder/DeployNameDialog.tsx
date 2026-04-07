"use client";

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

type DeployNameDialogProps = {
  open: boolean;
  deployName: string;
  deployNameError: string | null;
  isDeploying: boolean;
  isSaving: boolean;
  onDeployNameChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeployNameDialog({
  open,
  deployName,
  deployNameError,
  isDeploying,
  isSaving,
  onDeployNameChange,
  onCancel,
  onConfirm,
}: DeployNameDialogProps) {
  const disabled = isDeploying || isSaving;

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">Publicera din sajt</DialogTitle>
          <DialogDescription>
            Välj ett namn som blir en del av din adress.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={deployName}
                onChange={(event) => onDeployNameChange(event.target.value)}
                placeholder="mitt-foretag"
                disabled={disabled}
                className="flex-1"
              />
              <span className="shrink-0 text-xs text-muted-foreground">.vercel.app</span>
            </div>
            {deployNameError && <div className="text-xs text-destructive">{deployNameError}</div>}
            <p className="text-[11px] text-muted-foreground/60">Det här blir adressen folk skriver in för att besöka din sajt.</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={disabled}>
              Avbryt
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={disabled}>
              {isSaving || isDeploying ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Publicerar...
                </>
              ) : (
                "Publicera"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
