"use client";

import { useEffect, useState } from "react";

type HealthPayload = {
  status?: "ok" | "unconfigured" | "unhealthy" | "unreachable";
  surfaceEnabled?: boolean;
  surfaceStatus?: string;
  blockers?: string[];
  error?: string;
};

export function AvatarIntegrationStatus({
  mode,
  mockMode = false,
}: {
  mode: "iframe" | "bridge";
  mockMode?: boolean;
}) {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(mode === "bridge");
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "bridge") {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setRequestError(null);

    fetch("/api/openclaw/health")
      .then(async (res) => {
        const payload = (await res.json().catch(() => null)) as HealthPayload | null;
        if (cancelled) return;
        setHealth(payload);
        if (!res.ok && payload?.error) {
          setRequestError(payload.error);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setRequestError(error instanceof Error ? error.message : "Kunde inte läsa gateway-status.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  return (
    <div className="space-y-4">
      <div className="border-border/20 bg-background/60 rounded-[24px] border p-5">
        <p className="text-primary/75 text-xs font-medium tracking-[0.18em] uppercase">
          Integrationsläge
        </p>
        <h2 className="text-foreground mt-3 text-xl font-(--font-heading)">Aktiv kedja</h2>
        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
          <div data-testid="avatar-integration-mode">
            Läget just nu: <strong className="text-foreground">{mode === "bridge" ? "OpenClaw bridge" : "Iframe fallback"}</strong>
          </div>
          <div data-testid="avatar-integration-mock">
            Testläge: <strong className="text-foreground">{mockMode ? "Mockad avatartransport" : "Riktig D-ID-transport"}</strong>
          </div>
        </div>
      </div>

      <div className="border-border/20 bg-background/60 rounded-[24px] border p-5">
        <p className="text-primary/75 text-xs font-medium tracking-[0.18em] uppercase">
          OpenClaw-status
        </p>
        <h2 className="text-foreground mt-3 text-xl font-(--font-heading)">Gateway och surface</h2>
        <div className="mt-4 text-sm text-muted-foreground" data-testid="avatar-openclaw-health">
          {mode !== "bridge" ? (
            <p>Inte aktiv i iframe-läget.</p>
          ) : loading ? (
            <p>Läser status...</p>
          ) : requestError ? (
            <p>Fel: {requestError}</p>
          ) : health ? (
            <div className="space-y-2">
              <p>
                Gateway: <strong className="text-foreground">{health.status ?? "okänd"}</strong>
              </p>
              <p>
                Surface: <strong className="text-foreground">{health.surfaceStatus ?? "okänd"}</strong>
              </p>
              {health.blockers && health.blockers.length > 0 && (
                <div>
                  <p className="mb-1">Blockers:</p>
                  <ul className="space-y-1">
                    {health.blockers.map((blocker) => (
                      <li key={blocker}>- {blocker}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p>Ingen status tillgänglig.</p>
          )}
        </div>
      </div>
    </div>
  );
}
