import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  label: string;
  title: string;
  description: string;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeading({
  label,
  title,
  description,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "space-y-4",
        align === "center" && "mx-auto max-w-3xl text-center",
        className,
      )}
    >
      <Badge
        variant="secondary"
        className="rounded-full border border-border/80 bg-card px-3 py-1 text-xs font-medium text-secondary-foreground"
      >
        {label}
      </Badge>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      <p
        className={cn(
          "max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg",
          align === "center" && "mx-auto",
        )}
      >
        {description}
      </p>
    </div>
  );
}

export default SectionHeading;
