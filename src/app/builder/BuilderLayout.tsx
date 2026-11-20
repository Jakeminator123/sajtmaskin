"use client";

import { APP_VIEWPORT_HEIGHT_CLASS } from "@/lib/app-viewport";
import { ErrorBoundary } from "@/components/builder/shell/ErrorBoundary";
import type { ReactNode } from "react";
type BuilderLayoutProps = {
  chatId: string | null;
  versionId: string | null;
  children: ReactNode;
};

export function BuilderLayout({ chatId, versionId, children }: BuilderLayoutProps) {
  return (
    <ErrorBoundary chatId={chatId} versionId={versionId}>
      <main className={`bg-muted/30 flex w-screen flex-col overflow-x-hidden md:overflow-hidden ${APP_VIEWPORT_HEIGHT_CLASS}`}>
        {children}
      </main>
    </ErrorBoundary>
  );
}
