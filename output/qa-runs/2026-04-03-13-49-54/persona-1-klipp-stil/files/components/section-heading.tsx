
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
};

export function SectionHeading({ eyebrow, title, description, centered = false }: SectionHeadingProps) {
  return (
    <div className={cn("space-y-4", centered && "mx-auto max-w-3xl text-center")}>
      <p className="text-sm uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">{title}</h2>
      <p className="max-w-2xl text-lg leading-8 text-muted-foreground">{description}</p>
    </div>
  );
}

export default SectionHeading;
