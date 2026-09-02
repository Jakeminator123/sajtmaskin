"use client";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function ScrollStoryProgress({
  steps,
  activeIndex,
  className,
}: {
  steps: Array<{ id: string; title: string }>;
  activeIndex: number;
  className?: string;
}) {
  const jumpTo = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia(REDUCED_MOTION_QUERY).matches;
    target.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <ol
      aria-label="Kapitel"
      className={["flex gap-2", className].filter(Boolean).join(" ")}
    >
      {steps.map((step, index) => {
        const active = index === activeIndex;
        return (
          <li key={step.id}>
            <button
              type="button"
              aria-label={`Kapitel ${index + 1}: ${step.title}`}
              aria-current={active ? "step" : undefined}
              onClick={() => jumpTo(step.id)}
              className={`h-2 rounded-full transition-all ${
                active ? "w-6 bg-primary" : "w-2 bg-muted-foreground/40"
              }`}
            />
          </li>
        );
      })}
    </ol>
  );
}
