import { Suspense } from "react";
import { HomePage, Footer } from "@/components/layout";

function HomePageFallback() {
  return (
    <main className="bg-background min-h-screen">
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 pt-28 pb-20">
        <h1 className="mb-6 text-center text-5xl font-bold tracking-[-0.03em] sm:text-6xl md:text-7xl">
          <span className="text-white">Vad vill du bygga</span>
          <br />
          <span className="bg-linear-to-r from-brand-blue via-[hsl(260,65%,65%)] to-brand-teal bg-clip-text text-transparent">
            idag?
          </span>
        </h1>
        <p className="mb-12 text-[15px] leading-relaxed text-white/70">
          Skapa professionella webbplatser på minuter med hjälp av AI.
        </p>

        <div className="grid w-full max-w-3xl grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {(
            [
              { label: "Analyserad", desc: "AI ställer frågor" },
              { label: "Kategori", desc: "Välj typ av sida" },
              { label: "Audit", desc: "Analysera befintlig sida" },
              { label: "Fritext", desc: "Beskriv din vision" },
            ] as const
          ).map((m) => (
            <div
              key={m.label}
              className="flex flex-col items-center rounded-2xl border border-white/6 bg-white/2 p-7"
            >
              <span className="text-[14px] font-semibold text-white">{m.label}</span>
              <span className="mt-1.5 text-center text-[12px] text-white/70">{m.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <section className="relative z-10 px-4 pb-16">
        <div className="mx-auto w-full max-w-6xl">
          <h2 className="text-3xl font-semibold text-white sm:text-4xl">
            Från startval till live-sida
          </h2>
          <ol className="mt-8 space-y-4 text-sm text-white/60">
            <li>01 – Välj 1 av 4 startvägar</li>
            <li>02 – Öppna buildern</li>
            <li>03 – Bygg och iterera</li>
            <li>04 – Sjösätt och publicera</li>
          </ol>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <>
      <Suspense fallback={<HomePageFallback />}>
        <HomePage />
      </Suspense>
      <Footer />
    </>
  );
}
