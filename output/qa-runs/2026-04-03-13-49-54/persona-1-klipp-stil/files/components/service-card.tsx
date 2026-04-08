import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import Icon from "@/components/icon"

type ServiceCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function ServiceCard({ icon: Icon, title, description }: ServiceCardProps) {
  return (
    <Card className="h-full rounded-[1.75rem] border-border/80 bg-card/85 transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export default ServiceCard;
