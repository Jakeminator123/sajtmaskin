import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

type PricingCardProps = {
  name: string;
  price: string;
  description: string;
  features: string[];
  featured?: boolean;
};

export function PricingCard({
  name,
  price,
  description,
  features,
  featured = false,
}: PricingCardProps) {
  return (
    <Card className={featured ? "rounded-[1.6rem] border-primary/35 bg-card shadow-lg shadow-primary/10" : "rounded-[1.6rem] border bg-card/80"}>
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{name}</CardTitle>
          {featured && <Badge className="rounded-full">Popular</Badge>}
        </div>
        <div>
          <p className="text-4xl font-semibold tracking-tight">{price}</p>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {features.map((feature) => (
          <div key={feature} className="flex items-center gap-3 text-sm">
            <Check className="h-4 w-4 text-primary" />
            <span>{feature}</span>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button className="w-full rounded-full" variant={featured ? "default" : "outline"}>
          Choose plan
        </Button>
      </CardFooter>
    </Card>
  );
}
