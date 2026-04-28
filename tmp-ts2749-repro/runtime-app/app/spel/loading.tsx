import { Gamepad as Gamepad2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="section-shell section-padding">
      <div className="surface-panel rounded-[2rem] p-8 sm:p-12">
        <div className="flex items-center gap-3 rounded-full border border-border bg-card/70 px-4 py-2 text-sm font-medium text-foreground">
          <Gamepad2 className="h-4 w-4 text-primary" />
          Laddar spelzonen...
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="h-[28rem] animate-pulse rounded-[1.75rem] border border-border bg-muted" />
          <div className="space-y-4">
            <div className="h-12 w-full animate-pulse rounded-2xl bg-muted" />
            <div className="h-40 w-full animate-pulse rounded-[1.5rem] bg-muted" />
            <div className="h-40 w-full animate-pulse rounded-[1.5rem] bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}