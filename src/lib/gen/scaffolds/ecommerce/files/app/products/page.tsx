import { ProductCard } from "../../components/product-card";
import { products } from "../../lib/product-catalog";

export default function ProductsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Alla produkter</h1>
        <p className="text-muted-foreground">Demokatalog med exempelprodukter och demopriser.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
