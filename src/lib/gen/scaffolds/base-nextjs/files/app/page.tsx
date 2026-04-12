export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-16 px-6 py-24">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight text-foreground">
          Välkommen
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          En modern webbplats byggd med Next.js, Tailwind CSS och App Router.
        </p>
      </div>

      <section className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 max-w-5xl w-full">
        <div className="rounded-xl border border-border bg-card p-6 space-y-2">
          <h2 className="text-xl font-semibold text-card-foreground">Snabb</h2>
          <p className="text-sm text-muted-foreground">
            Server-renderad med Next.js App Router för blixtsnabb laddning.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-2">
          <h2 className="text-xl font-semibold text-card-foreground">Modern</h2>
          <p className="text-sm text-muted-foreground">
            Tailwind CSS, React 19 och de senaste webbstandarderna.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 space-y-2">
          <h2 className="text-xl font-semibold text-card-foreground">Flexibel</h2>
          <p className="text-sm text-muted-foreground">
            Bygg vidare med valfria komponenter, API-routes och databasstöd.
          </p>
        </div>
      </section>
    </main>
  );
}
