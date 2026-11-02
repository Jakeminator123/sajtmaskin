import type { Metadata } from "next";
import Link from "next/link";
import { homepageCreditFaq } from "@/lib/billing/credit-faq";
import { Footer } from "@/components/layout/footer";
import {
  FaqPageJsonLd,
  SoftwareApplicationJsonLd,
} from "@/components/layout/json-ld";
import { creditPackageCopy } from "@/lib/billing/credit-package-copy";
import { CREDIT_PACKAGES } from "@/lib/billing/credit-packages";
import { publicCanonicalPath, publicPageAlternates } from "@/lib/public-canonical-url";
import { DEFAULT_PUBLIC_OG_IMAGE } from "@/lib/seo-landing-pages/metadata";

const title = "Priser – credits utan prenumeration";
const description =
  "Sajtmaskins priser: credits som engångsköp, 1 kr = 1 credit. Ingen prenumeration. Första slutförda genereringen är gratis.";

export const metadata: Metadata = {
  title,
  description,
  alternates: publicPageAlternates("/priser"),
  openGraph: {
    title,
    description,
    url: publicCanonicalPath("/priser"),
    type: "website",
    locale: "sv_SE",
    siteName: "Sajtmaskin",
    images: [DEFAULT_PUBLIC_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [DEFAULT_PUBLIC_OG_IMAGE.url],
  },
};

export default function PriserPage() {
  return (
    <>
      <SoftwareApplicationJsonLd />
      <FaqPageJsonLd items={homepageCreditFaq} />
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <Link
            href="/"
            className="mb-8 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            &larr; Tillbaka
          </Link>

          <h1 className="mb-3 text-3xl font-(--font-heading) tracking-tight md:text-5xl">
            Priser
          </h1>
          <p className="mb-10 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Credits köps som engångspaket. 1 kr = 1 credit, och credits går inte ut. Du kan börja
            utan kreditkort — ett konto får en första slutförd generering utan att credits dras.
          </p>

          <div className="grid items-start gap-6 md:grid-cols-3">
            {CREDIT_PACKAGES.map((pkg) => {
              const copy = creditPackageCopy[pkg.id];
              return (
                <article
                  key={pkg.id}
                  className={`flex flex-col gap-4 rounded-2xl border p-6 ${
                    pkg.popular
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/20 bg-card/50"
                  }`}
                >
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{pkg.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
                  </div>
                  <p className="text-3xl font-semibold text-foreground">
                    {`${pkg.price} kr`}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {`${pkg.credits} credits`}
                    </span>
                  </p>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {copy.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          <p className="mt-8 text-sm text-muted-foreground">
            Credits används när du bygger, ändrar, kör analys eller publicerar — inte som en
            månadsavgift. Mallimport räknas inte som den gratis första genereringen. Läs mer om
            kostnadsdelar i{" "}
            <Link
              href="/vad-kostar-en-hemsida"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Vad kostar en hemsida?
            </Link>
            . Jämför arbetssätt i{" "}
            <Link href="/hemsideprogram" className="text-foreground underline-offset-4 hover:underline">
              hemsideprogram
            </Link>{" "}
            eller läs{" "}
            <Link
              href="/wordpress-alternativ"
              className="text-foreground underline-offset-4 hover:underline"
            >
              alternativ till WordPress
            </Link>
            .
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/builder?new=1"
              className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Kom igång
            </Link>
            <Link
              href="/buy-credits"
              className="inline-flex items-center rounded-lg border border-border/40 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
            >
              Köp credits
            </Link>
          </div>

          <section className="mt-16 border-t border-border/20 pt-10">
            <h2 className="mb-6 text-2xl font-(--font-heading) tracking-tight text-foreground">
              Vanliga frågor om credits
            </h2>
            <dl className="space-y-4">
              {homepageCreditFaq.map((item) => (
                <div key={item.q} className="rounded-2xl border border-border/20 bg-card/40 px-5 py-5">
                  <dt className="font-medium text-foreground">{item.q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
