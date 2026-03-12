# app/page.tsx

Reason: Useful structural reference

```text
import Link from "next/link";

import { Footer } from "@/app/components/footer";
import { Header } from "@/app/components/header";

function LayerCard({
  layer,
  badge,
  badgeClass,
  title,
  description,
  example,
}: {
  layer: string;
  badge: string;
  badgeClass: string;
  title: string;
  description: string;
  example: string;
}) {
  return (
    <div className="card-brutal flex h-full min-w-0 flex-col overflow-hidden">
      <div className="panel-section-header" style={{ fontFamily: "var(--font-space-mono)" }}>
        <div className="flex items-center gap-3">
          <span className={`badge ${badgeClass}`}>
            {badge}
          </span>
          <span className="text-[10px] font-bold tracking-[0.2em] text-foreground-muted">
            {layer}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="mb-3 text-xl font-extrabold leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
          {title}
        </h3>

        <p className="mb-6 flex-1 text-sm leading-[1.7] text-foreground-muted">
          {description}
        </p>

        <div
          className="border-t-2 border-border pt-4 text-[11px] leading-[1.8] text-foreground-muted"
          style={{ fontFamily: "var(--font-space-mono)" }}
        >
          <span className="font-bold text-foreground">Example:</span>
          {" "}
          <code className="break-words">{example}</code>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header currentPath="/" />

      <main className="flex-1 px-6 py-12 md:py-16">
        <div className="mx-auto max-w-6xl space-y-12">
          {/* Hero Panel */}
          <section className="panel-brutal overflow-hidden" aria-labelledby="landing-hero">
            <div className="grid gap-10 p-8 md:grid-cols-[1.2fr_0.8fr] md:items-start">
              <div className="space-y-6">
                <div className="space-y-3">
                  <p
                    className="text-xs font-bold uppercase tracking-[0.3em] text-foreground-muted"
                    style={{ fontFamily: "var(--font-space-mono)" }}
                  >
                    VIDEO AI INFRASTRUCTURE
                  </p>

// ... truncated
```
