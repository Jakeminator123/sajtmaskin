import { Card, CardContent } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { categories } from "../../lib/product-catalog";

export default function CategoriesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Kategorier</h1>
        <p className="text-muted-foreground">
          Exempelkategorier — välj en för att se demoprodukter.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <Link key={category.slug} href={`/category/${category.slug}`} className="group">
            <Card className="overflow-hidden">
              <div className="relative aspect-4/3 overflow-hidden">
                <Image
                  src={category.image}
                  alt={category.name}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </div>
              <CardContent className="p-4">
                <p className="font-medium">{category.name}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
