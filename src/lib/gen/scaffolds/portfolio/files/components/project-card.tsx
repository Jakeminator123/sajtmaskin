import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

type ProjectCardProps = {
  title: string;
  category: string;
  description: string;
  image: string;
};

export function ProjectCard({ title, category, description, image }: ProjectCardProps) {
  return (
    <Card className="overflow-hidden rounded-[1.8rem] border bg-card/85 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg">
      <div className="relative aspect-4/3 overflow-hidden">
        <Image src={image} alt={title} fill className="object-cover" />
      </div>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="secondary" className="rounded-full">{category}</Badge>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <p className="text-xl font-semibold">{title}</p>
          <p className="text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
