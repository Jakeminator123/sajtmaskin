"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";

import { ScrollStoryProgress } from "./scroll-story-progress";
import { useScrollStory } from "./use-scroll-story";

export interface ScrollStoryStep {
  id: string;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  media: ReactNode;
}

function StepCopy({ step }: { step: ScrollStoryStep }) {
  return (
    <>
      {step.eyebrow ? (
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {step.eyebrow}
        </p>
      ) : null}
      <h3 className="text-2xl font-semibold tracking-tight">{step.title}</h3>
      {step.description ? (
        <div className="mt-3 text-muted-foreground">{step.description}</div>
      ) : null}
    </>
  );
}

export function ScrollStory({
  steps,
  ariaLabel,
  className,
  stepHeightVh = 100,
  mediaSide = "right",
  showProgress = true,
  onStepChange,
}: {
  steps: ScrollStoryStep[];
  ariaLabel: string;
  className?: string;
  stepHeightVh?: number;
  mediaSide?: "left" | "right";
  showProgress?: boolean;
  onStepChange?: (index: number, step: ScrollStoryStep) => void;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  const { activeIndex, mode } = useScrollStory({
    containerRef,
    stepCount: steps.length,
  });
  const resolvedStepHeightVh = Math.max(60, stepHeightVh);
  const prevIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevIndexRef.current === null) {
      prevIndexRef.current = activeIndex;
      return;
    }
    if (prevIndexRef.current === activeIndex) return;
    prevIndexRef.current = activeIndex;
    const step = steps[activeIndex];
    if (step) onStepChange?.(activeIndex, step);
  }, [activeIndex, onStepChange, steps]);

  return (
    <section
      role="region"
      aria-label={ariaLabel}
      ref={containerRef}
      data-scroll-story-mode={mode}
      className={["overflow-x-hidden", className].filter(Boolean).join(" ")}
    >
      {mode === "sticky" ? (
        <div className="grid md:grid-cols-2">
          <div className={mediaSide === "left" ? "md:order-2" : undefined}>
            {steps.map((step, index) => {
              const active = index === activeIndex;
              return (
                <article
                  key={step.id}
                  id={step.id}
                  aria-current={active ? "step" : undefined}
                  style={{ minHeight: `${resolvedStepHeightVh}vh` }}
                  className={`flex items-center px-6 py-8 ${
                    active ? "" : "opacity-40"
                  }`}
                >
                  <div>
                    <StepCopy step={step} />
                  </div>
                </article>
              );
            })}
          </div>
          <div className={mediaSide === "left" ? "md:order-1" : undefined}>
            <div className="sticky top-0 flex h-screen items-center px-6">
              <div className="w-full">
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border bg-muted md:aspect-[4/3]">
                  {steps.map((step, index) => {
                    const active = index === activeIndex;
                    return (
                      <motion.div
                        key={step.id}
                        initial={false}
                        animate={{ opacity: active ? 1 : 0 }}
                        transition={{ duration: 0.4 }}
                        aria-hidden={active ? undefined : true}
                        className={
                          active
                            ? "absolute inset-0"
                            : "pointer-events-none absolute inset-0"
                        }
                      >
                        {step.media}
                      </motion.div>
                    );
                  })}
                </div>
                {showProgress ? (
                  <ScrollStoryProgress
                    steps={steps.map((step) => ({
                      id: step.id,
                      title: step.title,
                    }))}
                    activeIndex={activeIndex}
                    className="mt-4"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {steps.map((step) => (
            <article key={step.id} id={step.id} className="px-6">
              <div className="relative mb-4 aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
                {step.media}
              </div>
              <StepCopy step={step} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
