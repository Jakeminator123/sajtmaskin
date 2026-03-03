"use client";

import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { BuilderShellContent } from "./BuilderShellContent";
import { useBuilderPageController } from "./useBuilderPageController";

function BuilderContent() {
  const vm = useBuilderPageController();
  return <BuilderShellContent {...vm} />;
}

export default function BuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-muted/30 flex h-screen items-center justify-center supports-[height:100dvh]:h-dvh">
          <div className="text-center">
            <Loader2 className="text-primary mx-auto h-8 w-8 animate-spin" />
            <p className="text-muted-foreground mt-4 text-sm">Loading builder...</p>
          </div>
        </div>
      }
    >
      <BuilderContent />
    </Suspense>
  );
}
