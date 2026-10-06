import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "../components/product-card";
import { categories, products } from "../lib/product-catalog";

export default function Home() {
  return (
    <div className="flex flex-col">
      <section className="bg-muted/40 flex flex-col items-center justify-center gap-6 px-6 py-24 text-center sm:py-32">
        <Badge variant="outline" className="rounded-full px-4 py-1 text-sm">
          [Butiksnamn] — demokatalog
        </Badge>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Upptäck vårt exempelutbud
        </h1>
        <p className="text-muted-foreground max-w-xl text-lg">
          Prova en lokal demokorg. Betalning, frakt och lager är inte anslutna.
        </p>
        <div className="flex gap-3">
          <Button asChild size="lg">
            <Link href="/products">
              Visa produkter
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/categories">Kategorier</Link>
          </Button>
        </div>
      </section>
      <section id="kategorier" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">Exempelkategorier</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link key={category.slug} href={`/category/${category.slug}`} className="group">
              <Card className="overflow-hidden">
                <div className="relative aspect-3/2 overflow-hidden">
                  <Image src={category.image} alt={category.name} fill className="object-cover" />
                </div>
                <CardContent className="p-4">
                  <p className="font-medium">{category.name}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">Utvalda exempelprodukter</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
