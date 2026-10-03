import { homepageTrustPoints } from "@/components/landing-v2/landing-chat-data"

export function LandingTrustStrip() {
  return (
    <section className="border-t border-border/15 px-6 py-12 md:py-16" aria-labelledby="landing-trust-heading">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-center text-xs font-medium tracking-widest text-primary uppercase">
          Vad du faktiskt får
        </p>
        <h2
          id="landing-trust-heading"
          className="mb-8 text-center text-2xl text-foreground font-(--font-heading) tracking-tight text-balance md:text-3xl"
        >
          Inga påhittade kunder. Bara produktens villkor.
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {homepageTrustPoints.map((point) => (
            <div
              key={point.title}
              className="rounded-2xl border border-border/20 bg-card/40 px-5 py-4"
            >
              <p className="text-sm font-medium text-foreground">{point.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
