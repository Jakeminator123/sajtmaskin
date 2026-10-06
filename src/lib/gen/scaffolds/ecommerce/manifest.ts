import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const ecommerceManifest: ScaffoldManifest = {
  id: "ecommerce",
  label: "E-handel",
  description:
    "Demo storefront with one product catalog, category and detail pages, and a persistent local cart. Payment, inventory, shipping and server checkout require integration.",
  siteKind: "commerce",
  complexity: "advanced",
  structureProfile: "commerce-storefront",
  contentProfile: "product-catalog",
  features: ["product-grid", "cart", "product-detail"],
  allowedBuildIntents: ["website", "template"],
  tags: [
    "ecommerce",
    "shop",
    "store",
    "products",
    "cart",
    "webshop",
    "storefront",
    "retail",
    "checkout",
    "e-handel",
    "produkter",
    "kundvagn",
  ],
  promptHints: [
    "Use this scaffold for online stores, product catalogs, and webshops.",
    "Use lib/product-catalog.ts as the single sample catalog for lists, detail pages and cart totals; prices are integer minor units in SEK.",
    "Keep the shared CartProvider in the layout. Local cart actions, quantities, removal and validated localStorage work without a provider; /cart and the drawer share CartContents.",
    "Adapt sample categories, imagery and pricing to the user's niche. Label demo data until replaced with verified content; never invent customer ratings, bestsellers or delivery guarantees.",
    "Payment, inventory, shipping and server-authoritative prices are NOT connected. Keep checkout disabled and do not claim order/payment success until real provider confirmation.",
  ],
  qualityChecklist: [
    "Store name replaces [Butiksnamn] everywhere — header, hero badge, footer, metadata.",
    "Product names, categories, and prices are specific to the user's niche.",
    "Category and product images use descriptive placeholder text matching the niche.",
    "Hero section communicates the store's unique selling proposition, not generic copy.",
    "Navigation includes relevant links for the store type (not generic Hem/Produkter).",
    "Color scheme adapted from neutral to match the product category's visual identity.",
    "Adding a product updates the shared empty-by-default demo cart; quantity/remove/totals persist between reloads when storage is available.",
    "Reject malformed or unknown stored cart rows and derive names/prices from the catalog, never client-stored prices.",
    "Checkout remains visibly unconnected, and sample copy never promises payment, stock or delivery.",
  ],
  research: {
    upgradeTargets: [
      "Add faceted filtering (price range, tags) with URL-based state in category pages.",
      "Connect real server validation and payment/shipping providers before enabling checkout; local demo totals are not checkout authority.",
      "Show related products and recently viewed items on product pages.",
      "Generate structured data (JSON-LD Product + BreadcrumbList) for category and product pages.",
    ],
  },
  // Pure move of the former getScaffoldDefaultRoutes switch (route-plan
  // planning-helpers): only /products was guaranteed by the plan.
  //
  // SM-048 (owner decision 2026-08-14): the route plan decides which of
  // these route files are materialized. /categories is declared
  // (page file exists, never planned by default) so the plan filter in
  // finalize-merge owns them — this also resolved their SM-042 gate drift.
  // The dynamic detail templates ride on their listing route via
  // deliveryGroups since neither has a static parent page
  // (app/product/[id]/page.tsx exists without app/product/page.tsx).
  //
  // SM-043 owner decision 2026-10-05: preserve declared /cart with a real
  // demo page + navSurface link, sharing CartContents/state with the drawer.
  // This does not promote /cart to a required route or alter plan defaults.
  // Keep four level-1/2 baseline pages: the old /om stub is the #om section
  // on home. Explicitly requested /om is still owned by the route plan/LLM.
  routeContract: {
    requiredRoutes: [
      {
        path: "/products",
        name: "Products",
        planIntent: "Keep a storefront route for the product catalog.",
      },
    ],
    optionalRoutes: [],
    declaredRoutePaths: ["/cart", "/categories"],
    dynamicRoutePatterns: ["/category/[slug]", "/product/[id]"],
    deliveryGroups: [
      ["/products", "/product/[id]"],
      ["/categories", "/category/[slug]"],
    ],
  },
  // Header + footer: both are SHARED files that keep static route links.
  // After SM-048 the plan can drop /products, /categories, /cart; nav-sync
  // must filter both surfaces (SM-055). Other scaffolds' footers use `#`
  // placeholders, so they stay off this list.
  navSurface: ["components/site-header.tsx", "components/site-footer.tsx"],
  files: loadScaffoldFiles("ecommerce"),
};
