import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description: string;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-3xl space-y-4",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <Badge
          variant="secondary"
          className="rounded-full border border-primary/15 bg-background/70 px-4 py-1 text-xs font-medium tracking-[0.18em] uppercase text-primary"
        >
          {eyebrow}
        </Badge>
      ) : null}
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h2>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export default SectionHeading;
