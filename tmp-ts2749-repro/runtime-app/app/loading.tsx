import { Flame } from "lucide-react";

export default function Loading() {
  return (
    <div className="section-shell section-padding">
      <div className="surface-panel rounded-[2rem] p-8 sm:p-12">
        <div className="flex flex-col items-start gap-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-border/80 bg-card/80 px-4 py-2">
            <Flame className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-foreground">
              Glöd värmer upp grillen...
            </span>
          </div>
          <div className="h-5 w-40 animate-pulse rounded-full bg-muted" />
          <div className="h-12 w-full max-w-2xl animate-pulse rounded-2xl bg-muted" />
          <div className="h-5 w-full max-w-xl animate-pulse rounded-full bg-muted" />
          <div className="grid w-full gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-[1.5rem] border border-border bg-card/80"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}