"use client";

import { useEffect, useId, useRef, useState } from "react";

const D_ID_SCRIPT_SRC = "https://agent.d-id.com/v2/index.js";

function sanitizePublicEnv(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }

  return trimmed || undefined;
}

const AGENT_ID = sanitizePublicEnv(process.env.NEXT_PUBLIC_AVATAR_AGENT_ID);
const CLIENT_KEY = sanitizePublicEnv(process.env.NEXT_PUBLIC_AVATAR_CLIENT_KEY);

export function DidAvatarEmbed() {
  const rootRef = useRef<HTMLDivElement>(null);
  const uniqueId = useId().replace(/:/g, "");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !AGENT_ID || !CLIENT_KEY) return;

    let cancelled = false;
    const targetId = `did-avatar-target-${uniqueId}`;

    const container = document.createElement("div");
    container.id = targetId;
    container.style.width = "100%";
    container.style.minHeight = "720px";

    const script = document.createElement("script");
    script.type = "module";
    script.src = D_ID_SCRIPT_SRC;
    script.setAttribute("data-mode", "full");
    script.setAttribute("data-target-id", targetId);
    script.setAttribute("data-client-key", CLIENT_KEY);
    script.setAttribute("data-agent-id", AGENT_ID);
    script.setAttribute("data-open-mode", "expanded");
    script.setAttribute("data-auto-connect", "false");
    script.setAttribute("data-show-agent-name", "false");
    script.setAttribute("data-show-restart-button", "true");
    script.setAttribute("data-track", "true");
    script.setAttribute("data-speech-silence-timeout-ms", "700");
    script.onload = () => {
      if (cancelled) return;
      setLoadError(null);
    };
    script.onerror = () => {
      if (cancelled) return;
      setLoadError(
        "D-ID-embedden kunde inte laddas. Kontrollera CSP, allowed domains och att client key matchar den aktuella originen.",
      );
    };

    root.replaceChildren();
    root.appendChild(container);
    root.appendChild(script);

    return () => {
      cancelled = true;
      root.replaceChildren();
    };
  }, [uniqueId]);

  if (!AGENT_ID || !CLIENT_KEY) {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-100">
        Saknar publika env-vars: <code>NEXT_PUBLIC_AVATAR_AGENT_ID</code> eller{" "}
        <code>NEXT_PUBLIC_AVATAR_CLIENT_KEY</code>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        ref={rootRef}
        className="bg-background/80 min-h-[720px] w-full overflow-hidden rounded-2xl"
      />
      {loadError ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-100">
          {loadError}
        </div>
      ) : null}
    </div>
  );
}
