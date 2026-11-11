"use client";

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

/**
 * «Ny chatt» med befintlig konversation (V-07, 2026-11-11). Ersätter
 * webbläsarens confirm(), vars text («Osparade ändringar försvinner», «chat»)
 * motsade knappen: chatten och dess versioner ligger kvar i historiken.
 */
export function NewChatConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Starta en ny chatt?</AlertDialogTitle>
          <AlertDialogDescription>
            Den nuvarande chatten och dess versioner finns kvar i historiken, så du kan öppna den
            igen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel type="button">Avbryt</AlertDialogCancel>
          <AlertDialogAction type="button" onClick={() => onConfirm()}>
            Starta ny chatt
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
