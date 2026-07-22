"use client";

export interface Step {
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  /** Zero-based index of the current step. */
  current: number;
  /** When provided, steps render as buttons and call this on click. */
  onStepChange?: (index: number) => void;
  className?: string;
}

type StepStatus = "complete" | "current" | "upcoming";

function circleClasses(status: StepStatus): string {
  const base =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors";
  if (status === "complete") return `${base} border-primary bg-primary text-primary-foreground`;
  if (status === "current") return `${base} border-primary text-primary`;
  return `${base} border-border text-muted-foreground`;
}

export function Stepper({ steps, current, onStepChange, className }: StepperProps) {
  const interactive = typeof onStepChange === "function";

  return (
    <nav aria-label="Progress" className={className}>
      <ol className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-0">
        {steps.map((step, idx) => {
          const status: StepStatus =
            idx < current ? "complete" : idx === current ? "current" : "upcoming";
          const isLast = idx === steps.length - 1;

          const circle = (
            <span className={circleClasses(status)}>
              {status === "complete" ? (
                <span aria-hidden="true">&#10003;</span>
              ) : (
                idx + 1
              )}
            </span>
          );

          const labelBlock = (
            <span className="flex flex-col">
              <span
                className={
                  status === "upcoming"
                    ? "text-sm font-medium text-muted-foreground"
                    : "text-sm font-medium text-foreground"
                }
              >
                {step.label}
              </span>
              {step.description && (
                <span className="text-xs text-muted-foreground">{step.description}</span>
              )}
            </span>
          );

          return (
            <li key={`${idx}-${step.label}`} className="flex flex-1 items-center gap-3">
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onStepChange?.(idx)}
                  aria-current={status === "current" ? "step" : undefined}
                  className="flex items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {circle}
                  {labelBlock}
                </button>
              ) : (
                <span
                  aria-current={status === "current" ? "step" : undefined}
                  className="flex items-center gap-3"
                >
                  {circle}
                  {labelBlock}
                </span>
              )}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`mx-3 hidden h-px flex-1 sm:block ${
                    idx < current ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
