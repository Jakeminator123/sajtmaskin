"use client";

import { ArrowRight, CheckCircle2, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  creditPackages,
  studioTeam,
  studioTiers,
} from "@/components/landing-v2/landing-chat-data";

interface LandingPricingPageSectionsProps {
  onRegisterClick?: () => void;
}

/** Pricing + final CTA that used to live below the home hero. */
export function LandingPricingPageSections({
  onRegisterClick,
}: LandingPricingPageSectionsProps) {
  const router = useRouter();

  return (
    <>
      <section id="priser" className="px-6 py-20 md:py-28">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">
              Priser
            </p>
            <h2 className="text-2xl md:text-4xl text-foreground font-(--font-heading) tracking-tight text-balance mb-4">
              Starta själv. Ta in oss när det behövs.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
              Börja med credits och jobba i din egen takt. När du vill vässa strategi, design eller
              integrationer finns vi som ett team bredvid dig.
            </p>
            <div className="inline-flex items-center gap-2 mt-5 text-xs font-medium text-primary bg-primary/8 border border-primary/15 px-4 py-1.5 rounded-full flex-wrap justify-center">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span>Credits gäller för alltid och köps som engångspaket utan bindningstid.</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {creditPackages.map((pkg) => (
              <div
                key={pkg.id}
                className={`card-3d rounded-2xl border p-7 flex flex-col gap-5 transition-all duration-300 ${
                  pkg.popular
                    ? "bg-primary/5 border-primary/30 relative md:scale-105 md:-my-2 shadow-xl shadow-primary/5"
                    : "bg-card/50 border-border/20 hover:border-border/40"
                }`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground bg-primary px-3 py-1 rounded-full">
                    Populärast
                  </div>
                )}
                <div>
                  <h3 className="text-lg text-foreground font-(--font-heading)">{pkg.name}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{pkg.description}</p>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl text-foreground font-(--font-heading)">
                    {pkg.price} kr
                  </span>
                  <span className="text-sm text-muted-foreground mb-1">{pkg.credits} credits</span>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  {(pkg.price / pkg.credits).toFixed(1)} kr/credit
                  {pkg.savings > 0 ? ` • spara ${pkg.savings}%` : ""}
                </p>
                <div className="h-px bg-border/20" />
                <ul className="space-y-3 flex-1">
                  {pkg.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-muted-foreground"
                    >
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className={`w-full font-medium mt-2 ${
                    pkg.popular
                      ? "btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                      : "btn-3d bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/30"
                  }`}
                  onClick={() => router.push("/buy-credits")}
                >
                  {pkg.cta}
                  {pkg.popular && <ArrowRight className="w-4 h-4 ml-2" />}
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-14 rounded-[32px] border border-border/20 bg-card/35 p-6 md:p-8 shadow-[0_24px_70px_rgba(6,10,20,0.2)]">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              <div>
                <p className="text-xs font-medium text-primary tracking-widest uppercase mb-3">
                  SajtStudio
                </p>
                <h3 className="text-2xl md:text-3xl font-(--font-heading) text-foreground tracking-tight text-balance">
                  Behöver du ett team som hoppar in?
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  När credits inte räcker för allt runtomkring kan vi hjälpa till med struktur,
                  copy, design, integrationer och sista biten fram till lansering.
                </p>

                <div className="mt-5 space-y-3">
                  {studioTeam.map((member) => (
                    <div
                      key={member.name}
                      className="flex items-center gap-3 rounded-2xl border border-border/15 bg-background/35 px-3 py-3"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-sm font-(--font-heading) text-primary">
                        {member.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-sm font-(--font-heading) text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                    onClick={() => {
                      window.location.href = "mailto:hej@sajtmaskin.se";
                    }}
                  >
                    Prata med teamet
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <p className="text-xs text-muted-foreground self-center">
                    Vi svarar personligt om scope, tempo och vad som är rimligt att bygga vidare på.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {studioTiers.map((tier, index) => (
                  <div
                    key={tier.name}
                    className={`rounded-[24px] border p-5 bg-background/35 ${
                      index === 1
                        ? "border-primary/30 shadow-[0_16px_40px_rgba(8,145,178,0.12)]"
                        : "border-border/20"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-primary/70">{tier.name}</p>
                    <p className="mt-3 text-lg font-(--font-heading) text-foreground">{tier.range}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {tier.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-20 md:py-28 border-t border-border/15">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
            <Rocket className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-2xl md:text-4xl text-foreground mb-4 font-(--font-heading) tracking-tight text-balance">
            Redo att ta ditt f&ouml;retag online?
          </h2>
          <p className="text-muted-foreground mb-8 leading-relaxed text-pretty max-w-md mx-auto">
            B&ouml;rja gratis &mdash; ingen kod, inga kreditkort, inga bindningstider. En sajt som
            ser seri&ouml;s ut fr&aring;n dag ett.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              className="btn-3d btn-glow bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-base px-8 shadow-lg shadow-primary/25"
              onClick={() => {
                if (onRegisterClick) {
                  onRegisterClick();
                  return;
                }
                router.push("/");
              }}
            >
              Skapa din sajt nu
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground text-base"
              onClick={() => router.push("/templates")}
            >
              Se en demo
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
