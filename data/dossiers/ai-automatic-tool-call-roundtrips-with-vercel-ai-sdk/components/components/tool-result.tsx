"use client";

import type { UIMessagePart } from 'ai';

export function ToolResult({ part }: { part: UIMessagePart }) {
  if (part.type !== 'tool-invocation') return null;

  const { toolInvocation } = part;

  if (toolInvocation.state !== 'result') {
    return (
      <div className="rounded-md border p-3 text-sm text-muted-foreground">
        Running {toolInvocation.toolName}...
      </div>
    );
  }

  return (
    <pre className="overflow-x-auto rounded-md border p-3 text-xs">
      {JSON.stringify(toolInvocation.result, null, 2)}
    </pre>
  );
}
