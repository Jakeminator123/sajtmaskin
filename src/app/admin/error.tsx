"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Section-level error boundary for `/admin`.
 *
 * Without it a thrown render/server error drops the operator on the app-wide
 * error page and out of the console (losing the menu). Here the shell stays put
 * and the failure is explained in plain Swedish with a retry.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] Section crashed:", error);
  }, [error]);

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Den här vyn kunde inte visas</AlertTitle>
        <AlertDescription>
          <p>
            Något gick fel när sektionen laddades. Resten av adminpanelen fungerar — prova igen
            eller byt sektion i menyn.
          </p>
        </AlertDescription>
      </Alert>

      <p className="text-muted-foreground font-mono text-xs break-words">
        {error.message}
        {error.digest ? ` (id: ${error.digest})` : ""}
      </p>

      <div className="flex gap-2">
        <Button size="sm" onClick={reset}>
          Försök igen
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Till översikten</Link>
        </Button>
      </div>
    </div>
  );
}
