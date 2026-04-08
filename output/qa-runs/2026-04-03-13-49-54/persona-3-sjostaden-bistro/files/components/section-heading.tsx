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
        "space-y-4",
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl",
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-xs font-medium uppercase tracking-[0.32em] text-primary/80">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-3xl tracking-tight sm:text-4xl">{title}</h2>
      <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p>
    </div>
  );
}

export default SectionHeading;
