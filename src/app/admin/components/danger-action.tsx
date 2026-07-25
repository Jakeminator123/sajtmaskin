"use client";

import { useId, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface DangerActionProps {
  /** Button copy, e.g. "Rensa sidvisningar". */
  label: string;
  /** Dialog heading — say exactly what happens. */
  title: string;
  /** Plain-Swedish consequence description. */
  description: React.ReactNode;
  /**
   * Text the operator must type to unlock the confirm button. Use the concrete
   * object name (table, project) so muscle memory can't fire the wrong action.
   */
  confirmWord: string;
  /** Optional "this is how much disappears" line, rendered above the input. */
  impact?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  /** Small inline variant for row actions. */
  size?: "sm" | "default";
  className?: string;
}

/**
 * The single way `/admin` triggers something destructive.
 *
 * Replaces the old two-click pattern where every dangerous button shared ONE
 * `confirmAction` string in the page state: clicking another button silently
 * reset the pending confirmation, and one stray double-click could wipe a table.
 * Here each action owns its own dialog state and the confirm button stays
 * disabled until `confirmWord` is typed exactly.
 */
export function DangerAction({
  label,
  title,
  description,
  confirmWord,
  impact,
  onConfirm,
  disabled,
  size = "sm",
  className,
}: DangerActionProps) {
  // `confirmWord` can contain spaces (a project name) and can repeat on a page,
  // so it is not usable as a DOM id — React's useId keeps label/input paired.
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);

  const unlocked = typed.trim() === confirmWord;

  const handleOpenChange = (next: boolean) => {
    if (running) return;
    setOpen(next);
    if (!next) setTyped("");
  };

  const handleConfirm = async () => {
    if (!unlocked || running) return;
    setRunning(true);
    try {
      await onConfirm();
      setOpen(false);
      setTyped("");
    } finally {
      setRunning(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size={size}
          disabled={disabled}
          className={cn(
            "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive gap-2",
            className,
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="text-destructive h-5 w-5" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <div>{description}</div>
              {impact && (
                <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
                  {impact}
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label htmlFor={inputId} className="text-sm">
            Skriv <span className="font-mono font-semibold">{confirmWord}</span> för att bekräfta
          </Label>
          <Input
            id={inputId}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            placeholder={confirmWord}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Avbryt</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!unlocked || running}
            onClick={() => void handleConfirm()}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ja, genomför"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
