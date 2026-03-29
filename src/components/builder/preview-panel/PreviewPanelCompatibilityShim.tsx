"use client";

import { PreviewPanelSandbox, type PreviewPanelSandboxProps } from "./PreviewPanelSandbox";

export function PreviewPanelCompatibilityShim(props: PreviewPanelSandboxProps) {
  return <PreviewPanelSandbox {...props} />;
}
