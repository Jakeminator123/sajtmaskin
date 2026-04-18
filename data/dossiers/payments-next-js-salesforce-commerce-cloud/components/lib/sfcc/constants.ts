export type ProductSort = {
  label: string;
  value: string;
};

export const PRODUCT_SORTS: ProductSort[] = [
  { label: "Featured", value: "featured" },
  { label: "Newest", value: "newest" },
  { label: "Price: Low to high", value: "price-asc" },
  { label: "Price: High to low", value: "price-desc" },
];

export const SFCC_CACHE_TAGS = {
  products: "products",
  categories: "categories",
  cart: "cart",
  search: "search",
} as const;
