"use client";

import { useEffect } from "react";
import { RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BuilderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Builder] Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-border bg-card px-8 py-10 shadow-sm">
        <div>
          <h2 className="mb-1.5 text-base font-medium text-foreground">
            Något gick fel
          </h2>
          <p className="text-sm text-muted-foreground">
            Byggsidan stötte på ett oväntat fel. Försök igen eller gå till startsidan.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => (window.location.href = "/")}>
            <Home className="mr-1.5 h-4 w-4" />
            Startsidan
          </Button>
          <Button onClick={reset}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Försök igen
          </Button>
        </div>
      </div>
    </div>
  );
}
