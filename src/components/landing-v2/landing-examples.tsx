import { homepageExampleIntro, siteTypes } from "@/components/landing-v2/landing-chat-data"
import { trackHomepageEvent } from "@/components/landing-v2/landing-analytics"

type LandingExamplesProps = {
  onPickExample: (siteType: string) => void
  onBrowseTemplates: () => void
}

export function LandingExamples({ onPickExample, onBrowseTemplates }: LandingExamplesProps) {
  return (
    <section className="border-t border-border/15 px-6 py-16 md:py-20" aria-labelledby="landing-examples-heading">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 text-center">
          <p className="mb-3 text-xs font-medium tracking-widest text-primary uppercase">
            {homepageExampleIntro.eyebrow}
          </p>
          <h2
            id="landing-examples-heading"
            className="mb-4 text-2xl text-foreground font-(--font-heading) tracking-tight text-balance md:text-4xl"
          >
            {homepageExampleIntro.title}
          </h2>
          <p className="mx-auto max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            {homepageExampleIntro.body}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {siteTypes.map((siteType) => (
            <button
              key={siteType}
              type="button"
              onClick={() => {
                trackHomepageEvent("homepage_examples", { source: "site_type" })
                onPickExample(siteType)
              }}
              className="rounded-xl border border-border/30 bg-secondary/40 px-4 py-2 text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-secondary/70"
            >
              {siteType}
            </button>
          ))}
        </div>
        <div className="mt-8 text-center">
          <button
            type="button"
            className="text-sm text-primary underline-offset-4 hover:underline"
            onClick={() => {
              trackHomepageEvent("homepage_examples", { source: "templates_link" })
              onBrowseTemplates()
            }}
          >
            {homepageExampleIntro.templatesCta}
          </button>
        </div>
      </div>
    </section>
  )
}
