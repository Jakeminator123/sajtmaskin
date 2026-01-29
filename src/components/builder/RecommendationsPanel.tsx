"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sources, SourcesContent, SourcesTrigger, Source } from "@/components/ai-elements/sources";
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type RecommendationsPanelProps = {
  url: string | null;
  fallbackUrl?: string | null;
  autoAnalyze?: boolean;
};

type AnalyzeResponse = {
  success: boolean;
  analysis?: string;
  sources?: Array<{ url: string; title: string }>;
  model?: string;
  usedWebSearch?: boolean;
  error?: string;
};

function formatTimestamp(value: Date | null): string {
  if (!value) return "Inte uppdaterad ännu";
  return new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(value);
}

export function RecommendationsPanel({
  url,
  fallbackUrl,
  autoAnalyze = true,
}: RecommendationsPanelProps) {
  const resolvedUrl = useMemo(() => url || fallbackUrl || null, [url, fallbackUrl]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [sources, setSources] = useState<Array<{ url: string; title: string }>>([]);
  const [model, setModel] = useState<string | null>(null);
  const [usedWebSearch, setUsedWebSearch] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAnalyzedUrl, setLastAnalyzedUrl] = useState<string | null>(null);

  const runAnalysis = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!resolvedUrl) return;
      if (isLoading) return;
      if (!opts?.force && resolvedUrl === lastAnalyzedUrl && analysis) return;

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/analyze-website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: resolvedUrl, deepAnalysis: true }),
        });

        const data = (await response.json().catch(() => ({}))) as AnalyzeResponse;
        if (!response.ok || !data?.success) {
          const message = data?.error || `Analyze failed (HTTP ${response.status})`;
          throw new Error(message);
        }

        setAnalysis(data.analysis || null);
        setSources(Array.isArray(data.sources) ? data.sources : []);
        setModel(data.model || null);
        setUsedWebSearch(Boolean(data.usedWebSearch));
        setLastUpdated(new Date());
        setLastAnalyzedUrl(resolvedUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunde inte analysera");
      } finally {
        setIsLoading(false);
      }
    },
    [analysis, isLoading, lastAnalyzedUrl, resolvedUrl],
  );

  useEffect(() => {
    if (!autoAnalyze) return;
    if (!resolvedUrl) return;
    if (resolvedUrl === lastAnalyzedUrl && analysis) return;
    void runAnalysis();
  }, [autoAnalyze, resolvedUrl, lastAnalyzedUrl, analysis, runAnalysis]);

  if (!resolvedUrl) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
        <AlertCircle className="h-10 w-10" />
        <div className="text-center text-sm">
          <p className="font-medium">Ingen URL att analysera</p>
          <p>Skapa en preview först så kan vi ge rekommendationer.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Rekommendationer</h3>
          <p className="text-muted-foreground text-xs">
            Senast uppdaterad: {formatTimestamp(lastUpdated)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runAnalysis({ force: true })}
            disabled={isLoading}
            title="Uppdatera rekommendationer"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4 text-sm">
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>Analyserad URL</span>
            {resolvedUrl && (
              <a
                className="text-primary inline-flex items-center gap-1 hover:underline"
                href={resolvedUrl}
                rel="noreferrer"
                target="_blank"
              >
                Öppna <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <p className="text-muted-foreground text-xs break-all">{resolvedUrl}</p>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-3 p-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Analyserar webbplatsen...</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="space-y-2 p-4 text-sm text-red-500">
            <p className="font-medium">Något gick fel</p>
            <p className="text-muted-foreground text-xs">{error}</p>
          </CardContent>
        </Card>
      )}

      {analysis && (
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span>Model: {model || "okänd"}</span>
              <span>•</span>
              <span>{usedWebSearch ? "Web Search: på" : "Web Search: av"}</span>
            </div>
            <p className="text-foreground leading-relaxed whitespace-pre-wrap">{analysis}</p>
          </CardContent>
        </Card>
      )}

      {sources.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <Sources>
              <SourcesTrigger count={sources.length} />
              <SourcesContent>
                {sources.map((source) => (
                  <Source key={source.url} href={source.url} title={source.title || source.url} />
                ))}
              </SourcesContent>
            </Sources>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
