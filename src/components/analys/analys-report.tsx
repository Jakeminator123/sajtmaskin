"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuditPdfReport } from "@/components/audit/AuditPdfReport";
import type { AuditResult, Improvement } from "@/types/audit";

type AnalysReportProps = {
  result: AuditResult;
  auditedUrl: string | null;
  onNeedAccount: () => void;
};

const PRIMARY_SCORE_KEYS = ["seo", "content", "ux", "mobile"] as const;
const SECONDARY_SCORE_KEYS = ["technical_seo", "performance", "accessibility"] as const;

const SCORE_LABELS: Record<string, string> = {
  seo: "SEO",
  content: "Innehåll",
  ux: "UX",
  mobile: "Mobil",
  technical_seo: "Teknisk SEO",
  performance: "Prestanda",
  accessibility: "Tillgänglighet",
  security: "Säkerhet",
};

function scoreTone(value: number | undefined): string {
  if (typeof value !== "number") return "text-muted-foreground";
  if (value >= 80) return "text-emerald-400";
  if (value >= 60) return "text-amber-400";
  return "text-red-400";
}

function improvementPriority(item: Improvement): number {
  const categoryRank =
    item.category === "Marketing" || item.category === "Content"
      ? 0
      : item.category === "UX"
        ? 1
        : item.category === "Tech"
          ? 2
          : 3;
  const impactRank = item.impact === "high" ? 0 : item.impact === "medium" ? 1 : 2;
  return categoryRank * 10 + impactRank;
}

export function AnalysReport({ result, auditedUrl, onNeedAccount }: AnalysReportProps) {
  const [showPdf, setShowPdf] = useState(false);
  const scores = result.audit_scores;
  const rankedImprovements = useMemo(
    () => [...(result.improvements ?? [])].sort((a, b) => improvementPriority(a) - improvementPriority(b)),
    [result.improvements],
  );

  return (
    <div className="mt-10 space-y-8">
      <header className="border-border/40 bg-card/30 rounded-2xl border p-6">
        <p className="text-xs font-medium tracking-widest text-primary uppercase">Rapport</p>
        <h2 className="mt-2 font-(--font-heading) text-2xl tracking-tight text-foreground">
          {result.company || result.domain || "Er webbplats"}
        </h2>
        {auditedUrl ? (
          <p className="text-muted-foreground mt-1 text-sm break-all">{auditedUrl}</p>
        ) : null}
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-relaxed">
          {result.business_profile?.industry
            ? `${result.business_profile.industry}. `
            : ""}
          {result.customer_segments?.primary_segment ||
            result.target_audience_analysis?.demographics ||
            "Målgruppen går att läsa ut ur sidans texter."}
        </p>
      </header>

      <section>
        <h3 className="mb-3 text-sm font-medium text-foreground">Synlighet och upplevelse</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {PRIMARY_SCORE_KEYS.map((key) => (
            <ScoreCard key={key} label={SCORE_LABELS[key]} value={scores?.[key]} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {SECONDARY_SCORE_KEYS.map((key) => (
            <ScoreCard key={key} label={SCORE_LABELS[key]} value={scores?.[key]} compact />
          ))}
        </div>
        {typeof scores?.security === "number" ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Säkerhetspoäng {scores.security}/100 — bara som bakgrund, inte rapportens kärna.
          </p>
        ) : null}
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Panel title="Målgrupp">
          <p>{result.target_audience_analysis?.demographics}</p>
          <p>{result.target_audience_analysis?.pain_points}</p>
          {result.customer_segments?.customer_needs?.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-4">
              {result.customer_segments.customer_needs.slice(0, 4).map((need) => (
                <li key={need}>{need}</li>
              ))}
            </ul>
          ) : null}
        </Panel>
        <Panel title="SEO och innehåll">
          <p>{result.content_strategy?.seo_foundation}</p>
          {result.content_strategy?.key_pages?.length ? (
            <p className="mt-2">
              Nyckelsidor: {result.content_strategy.key_pages.slice(0, 5).join(", ")}
            </p>
          ) : null}
          {result.content_strategy?.conversion_paths?.length ? (
            <p className="mt-2">
              Konvertering: {result.content_strategy.conversion_paths.slice(0, 3).join(" · ")}
            </p>
          ) : null}
        </Panel>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Panel title="Styrkor">
          <ul className="list-disc space-y-1 pl-4">
            {(result.strengths ?? []).slice(0, 5).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>
        <Panel title="Hål mot kunden">
          <ul className="list-disc space-y-1 pl-4">
            {(result.issues ?? []).slice(0, 5).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Panel>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-foreground">Först det här</h3>
        <ol className="space-y-3">
          {rankedImprovements.slice(0, 8).map((item, index) => (
            <li
              key={`${item.item}-${index}`}
              className="border-border/40 bg-card/20 rounded-xl border p-4"
            >
              <p className="text-sm font-medium text-foreground">
                {index + 1}. {item.item}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {item.category ?? "Förbättring"} · {item.impact} impact
              </p>
              {item.why ? <p className="mt-2 text-sm leading-relaxed">{item.why}</p> : null}
            </li>
          ))}
        </ol>
      </section>

      <details className="border-border/40 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">Teknik och säkerhet (kort)</summary>
        <div className="text-muted-foreground mt-3 space-y-2 text-sm">
          {result.security_analysis?.https_status ? (
            <p>HTTPS: {result.security_analysis.https_status}</p>
          ) : null}
          {result.security_analysis?.headers_analysis ? (
            <p>{result.security_analysis.headers_analysis}</p>
          ) : null}
          {(result.technical_recommendations ?? []).slice(0, 3).map((rec) => (
            <p key={rec.area}>
              <span className="text-foreground font-medium">{rec.area}:</span> {rec.recommendation}
            </p>
          ))}
        </div>
      </details>

      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Button type="button" variant="outline" onClick={() => setShowPdf(true)}>
          <Download className="mr-2 h-4 w-4" />
          Ladda ner PDF
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="button" onClick={onNeedAccount}>
            Bygg en bättre version
          </Button>
          <Button asChild variant="ghost">
            <Link href="/skapa-hemsida">Läs mer om flödet</Link>
          </Button>
        </div>
      </div>

      {showPdf ? <AuditPdfReport result={result} onClose={() => setShowPdf(false)} /> : null}
    </div>
  );
}

function ScoreCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: number | undefined;
  compact?: boolean;
}) {
  return (
    <div className="border-border/40 bg-card/20 rounded-xl border p-3">
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</p>
      <p className={`font-(--font-heading) ${compact ? "text-xl" : "text-3xl"} ${scoreTone(value)}`}>
        {typeof value === "number" ? value : "–"}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-border/40 bg-card/20 rounded-xl border p-5">
      <h3 className="mb-3 text-sm font-medium text-foreground">{title}</h3>
      <div className="text-muted-foreground space-y-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}
