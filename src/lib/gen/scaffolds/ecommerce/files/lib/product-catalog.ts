// Sample catalog, not inventory, an offer, or a server-authoritative price.
// Keep list, detail and local cart views on this one model.
export type DemoProduct = {
  id: string;
  name: string;
  priceMinor: number;
  categorySlug: string;
  image: string;
  description: string;
};

export const categories = [
  {
    name: "[Kategori 1]",
    slug: "category-1",
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=500&fit=crop",
  },
  {
    name: "[Kategori 2]",
    slug: "category-2",
    image: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&h=500&fit=crop",
  },
  {
    name: "[Kategori 3]",
    slug: "category-3",
    image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&h=500&fit=crop",
  },
] as const;

export const products: readonly DemoProduct[] = [
  {
    id: "1",
    name: "[Produktnamn 1]",
    priceMinor: 49900,
    categorySlug: "category-1",
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1000&h=1000&fit=crop",
    description: "Exempelbeskrivning — ersätt med verifierade produktegenskaper.",
  },
  {
    id: "2",
    name: "[Produktnamn 2]",
    priceMinor: 79900,
    categorySlug: "category-2",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1000&h=1000&fit=crop",
    description: "Exempelbeskrivning — ersätt med verifierade produktegenskaper.",
  },
  {
    id: "3",
    name: "[Produktnamn 3]",
    priceMinor: 29900,
    categorySlug: "category-3",
    image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1000&h=1000&fit=crop",
    description: "Exempelbeskrivning — ersätt med verifierade produktegenskaper.",
  },
  {
    id: "4",
    name: "[Produktnamn 4]",
    priceMinor: 59900,
    categorySlug: "category-1",
    image: "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=1000&h=1000&fit=crop",
    description: "Exempelbeskrivning — ersätt med verifierade produktegenskaper.",
  },
  {
    id: "5",
    name: "[Produktnamn 5]",
    priceMinor: 89900,
    categorySlug: "category-2",
    image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=1000&h=1000&fit=crop",
    description: "Exempelbeskrivning — ersätt med verifierade produktegenskaper.",
  },
  {
    id: "6",
    name: "[Produktnamn 6]",
    priceMinor: 19900,
    categorySlug: "category-3",
    image: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=1000&h=1000&fit=crop",
    description: "Exempelbeskrivning — ersätt med verifierade produktegenskaper.",
  },
];

export function findProduct(id: string) {
  return products.find((product) => product.id === id);
}

export function formatPrice(minor: number) {
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" }).format(minor / 100);
}
