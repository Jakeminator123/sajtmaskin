
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react"

import { Badge } from "@/components/ui/badge";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button"

type PricingCardProps = {
  name: string;
  price: string;
  duration: string;
  description: string;
  features: string[];
  featured: boolean;
};

export function PricingCard({ name, price, duration, description, features, featured }: PricingCardProps) {
  return (
    <Card
      className={`rounded-[2rem] border-border/80 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
        featured ? "bg-primary text-primary-foreground" : "bg-card/90"
      }`}
    >
      <CardHeader className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-sm uppercase tracking-[0.18em] ${featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
              Paket
            </p>
            <h3 className="mt-2 text-3xl font-semibold tracking-tight">{name}</h3>
          </div>
          {featured ? <Badge className="rounded-full bg-accent text-accent-foreground">Mest bokad</Badge> : null}
        </div>
        <div className="space-y-1">
          <p className="text-4xl font-semibold tracking-tight">{price}</p>
          <p className={featured ? "text-primary-foreground/70" : "text-muted-foreground"}>{duration}</p>
        </div>
        <p className={`text-base leading-7 ${featured ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{description}</p>
      </CardHeader>

      <CardContent className="space-y-6 p-6 pt-0">
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <Check className={`mt-1 h-4 w-4 shrink-0 ${featured ? "text-accent" : "text-primary"}`} />
              <span className={featured ? "text-primary-foreground/90" : "text-foreground"}>{feature}</span>
            </li>
          ))}
        </ul>

        <Button asChild size="lg" variant={featured ? "secondary" : "default"} className="w-full rounded-full">
          <Link href="/boka">
            Boka tid
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default PricingCard;
