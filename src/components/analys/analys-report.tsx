"use client";

import Link from "next/link";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PublicAnalysReport, PublicImprovement } from "@/lib/audit/public-report";

type AnalysReportProps = {
  report: PublicAnalysReport;
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
};

const IMPACT_LABELS: Record<PublicImprovement["impact"], string> = {
  high: "Hög påverkan",
  medium: "Medel påverkan",
  low: "Låg påverkan",
};

const EFFORT_LABELS: Record<PublicImprovement["effort"], string> = {
  low: "liten insats",
  medium: "medelstor insats",
  high: "stor insats",
};

const CATEGORY_LABELS: Record<string, string> = {
  Marketing: "Marknad",
  Content: "Innehåll",
  UX: "UX",
  Tech: "Teknik",
  Security: "Säkerhet",
};

function scoreTone(value: number | undefined): string {
  if (typeof value !== "number") return "text-muted-foreground";
  if (value >= 80) return "text-emerald-400";
  if (value >= 60) return "text-amber-400";
  return "text-red-400";
}

function scoreWord(value: number | undefined): string {
  if (typeof value !== "number") return "saknas";
  if (value >= 80) return "starkt";
  if (value >= 60) return "godkänt";
  return "svagt";
}

export function AnalysReport({ report, auditedUrl, onNeedAccount }: AnalysReportProps) {
  const scores = report.audit_scores;
  const improvements = report.improvements ?? [];
  const summaryLine =
    report.audience?.primary_segment ||
    report.audience?.demographics ||
    "Målgruppen går att läsa ut ur sidans egna texter.";

  return (
    <div className="mt-10 space-y-8">
      <header className="border-border/40 bg-card/30 rounded-2xl border p-6">
        <p className="text-primary text-xs font-medium tracking-widest uppercase">Rapport</p>
        <h2 className="text-foreground mt-2 font-(--font-heading) text-2xl tracking-tight">
          {report.company || report.domain || "Er webbplats"}
        </h2>
        {auditedUrl ? (
          <p className="text-muted-foreground mt-1 text-sm break-all">{auditedUrl}</p>
        ) : null}
        <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-relaxed">
          {report.industry ? `${report.industry}. ` : ""}
          {summaryLine}
        </p>
      </header>

      {report.quick_wins?.length ? (
        <section className="border-primary/30 bg-primary/5 rounded-2xl border p-6">
          <h3 className="text-foreground mb-3 text-sm font-medium">Gör det här först</h3>
          <ul className="text-muted-foreground list-disc space-y-1.5 pl-4 text-sm leading-relaxed">
            {report.quick_wins.map((win) => (
              <li key={win}>{win}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="text-foreground mb-3 text-sm font-medium">Synlighet och upplevelse</h3>
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
            Säkerhetspoäng {scores.security}/100 — bakgrund, inte rapportens kärna. Detta är ingen
            penetrationstest.
          </p>
        ) : null}
      </section>

      {report.audience || report.seo ? (
        <section className="grid gap-6 md:grid-cols-2">
          {report.audience ? (
            <Panel title="Målgrupp">
              {report.audience.demographics ? <p>{report.audience.demographics}</p> : null}
              {report.audience.pain_points ? <p>{report.audience.pain_points}</p> : null}
              {report.audience.customer_needs?.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-4">
                  {report.audience.customer_needs.map((need) => (
                    <li key={need}>{need}</li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          ) : null}
          {report.seo ? (
            <Panel title="SEO och innehåll">
              {report.seo.foundation ? <p>{report.seo.foundation}</p> : null}
              {report.seo.key_pages?.length ? (
                <p className="mt-2">Nyckelsidor: {report.seo.key_pages.join(", ")}</p>
              ) : null}
              {report.seo.conversion_paths?.length ? (
                <p className="mt-2">Konvertering: {report.seo.conversion_paths.join(" · ")}</p>
              ) : null}
            </Panel>
          ) : null}
        </section>
      ) : null}

      {report.strengths?.length || report.issues?.length ? (
        <section className="grid gap-6 md:grid-cols-2">
          {report.strengths?.length ? (
            <Panel title="Styrkor">
              <ul className="list-disc space-y-1 pl-4">
                {report.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {report.issues?.length ? (
            <Panel title="Hål mot kunden">
              <ul className="list-disc space-y-1 pl-4">
                {report.issues.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </section>
      ) : null}

      {improvements.length > 0 ? (
        <section>
          <h3 className="text-foreground mb-3 text-sm font-medium">Åtgärder i prioritetsordning</h3>
          <ol className="space-y-3">
            {improvements.map((item, index) => (
              <li
                key={`${item.item}-${index}`}
                className="border-border/40 bg-card/20 rounded-xl border p-4"
              >
                <p className="text-foreground text-sm font-medium">
                  {index + 1}. {item.item}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {item.category ? `${CATEGORY_LABELS[item.category] ?? item.category} · ` : ""}
                  {IMPACT_LABELS[item.impact]} · {EFFORT_LABELS[item.effort]}
                </p>
                {item.why ? <p className="mt-2 text-sm leading-relaxed">{item.why}</p> : null}
                {item.how ? (
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    Så gör ni: {item.how}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {report.major_projects?.length || report.expected_outcomes?.length ? (
        <section className="grid gap-6 md:grid-cols-2">
          {report.expected_outcomes?.length ? (
            <Panel title="Vad det kan ge">
              <ul className="list-disc space-y-1 pl-4">
                {report.expected_outcomes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {report.major_projects?.length ? (
            <Panel title="Större projekt">
              <ul className="list-disc space-y-1 pl-4">
                {report.major_projects.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </section>
      ) : null}

      {report.technical ? (
        <details className="border-border/40 rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Teknik och säkerhet (kort)
          </summary>
          <div className="text-muted-foreground mt-3 space-y-2 text-sm">
            {report.technical.https_status ? <p>HTTPS: {report.technical.https_status}</p> : null}
            {report.technical.headers_analysis ? <p>{report.technical.headers_analysis}</p> : null}
            {report.technical.recommendations?.map((rec) => (
              <p key={rec.area}>
                <span className="text-foreground font-medium">{rec.area}:</span>{" "}
                {rec.recommendation}
              </p>
            ))}
          </div>
        </details>
      ) : null}

      <div className="border-border/40 bg-card/20 flex flex-col gap-4 rounded-2xl border p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-foreground text-sm font-medium">Vill ni ha rapporten och en ny sida?</p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              PDF, sparad historik och bygge kräver konto. Analysen ovan är fri att läsa.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onNeedAccount}>
              <FileDown className="mr-2 h-4 w-4" />
              Hämta som PDF
            </Button>
            <Button type="button" onClick={onNeedAccount}>
              Bygg en bättre version
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          <Link href="/skapa-hemsida" className="underline-offset-2 hover:underline">
            Läs mer om hur bygget fungerar
          </Link>
          {report.data_quality ? (
            <>
              {" · Underlag: "}
              {report.data_quality.pages_sampled ?? 1} sida(or)
              {typeof report.data_quality.aggregated_word_count === "number"
                ? `, ${report.data_quality.aggregated_word_count} ord`
                : ""}
              {report.data_quality.is_js_rendered
                ? ". Sidan verkar JavaScript-renderad, så delar av texten kan saknas"
                : ""}
              {report.data_quality.used_fallback
                ? ". Delar av bedömningen är en reservbedömning"
                : ""}
              .
            </>
          ) : null}
        </p>
      </div>
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
      <p
        className={`font-(--font-heading) ${compact ? "text-xl" : "text-3xl"} ${scoreTone(value)}`}
        aria-label={`${label}: ${
          typeof value === "number" ? `${value} av 100, ${scoreWord(value)}` : "saknas"
        }`}
      >
        {typeof value === "number" ? value : "–"}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-border/40 bg-card/20 rounded-xl border p-5">
      <h3 className="text-foreground mb-3 text-sm font-medium">{title}</h3>
      <div className="text-muted-foreground space-y-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}
