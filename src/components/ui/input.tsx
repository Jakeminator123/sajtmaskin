import * as React from "react";

import { cn } from "@/lib/utils/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, id, name, placeholder, ...props }, ref) => {
    const autoId = React.useId();
    const resolvedId = id || `input-${autoId}`;
    const resolvedName = name || resolvedId;
    const ariaLabel = props["aria-label"] || placeholder || name || "input field";
    const ariaLabelledBy = props["aria-labelledby"];
    const autoComplete = props.autoComplete ?? "off";

    return (
      <input
        type={type}
        id={resolvedId}
        name={resolvedName}
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        autoComplete={autoComplete}
        className={cn(
          "border-input bg-background ring-offset-background file:text-foreground placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        placeholder={placeholder}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
