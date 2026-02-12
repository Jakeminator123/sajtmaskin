import * as React from "react";

import { cn } from "@/lib/utils/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, id, name, placeholder, autoComplete: autoCompleteProp, ...props }, ref) => {
    const autoId = React.useId();
    const resolvedId = id || `textarea-${autoId}`;
    const resolvedName = name || resolvedId;
    const ariaLabel = props["aria-label"] || placeholder || name || "textarea";
    const ariaLabelledBy = props["aria-labelledby"];
    const autoComplete = autoCompleteProp ?? "off";
    return (
      <textarea
        id={resolvedId}
        name={resolvedName}
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        autoComplete={autoComplete}
        className={cn(
          "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[80px] w-full rounded-md border px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        placeholder={placeholder}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
