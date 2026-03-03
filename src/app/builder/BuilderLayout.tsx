"use client";

import { ErrorBoundary } from "@/components/builder/ErrorBoundary";
import type { ReactNode } from "react";
type BuilderLayoutProps = {
  chatId: string | null;
  versionId: string | null;
  children: ReactNode;
};

export function BuilderLayout({ chatId, versionId, children }: BuilderLayoutProps) {
  return (
    <ErrorBoundary chatId={chatId} versionId={versionId}>
      <main className="bg-muted/30 flex h-screen w-screen flex-col overflow-x-hidden supports-[height:100dvh]:h-dvh md:overflow-hidden">
        {children}
      </main>
    </ErrorBoundary>
  );
}
