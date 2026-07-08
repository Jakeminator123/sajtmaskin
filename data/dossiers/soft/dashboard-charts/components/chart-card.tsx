import React from "react";
import { cn } from "@/lib/utils";

export type ChartCardProps = React.HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export function ChartCard({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: ChartCardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-background p-4 shadow-sm",
        className
      )}
      {...props}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          {description ? (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
