import type { ScaffoldManifest } from "../types";
import { loadScaffoldFiles } from "../load-scaffold-files";

export const ecommerceManifest: ScaffoldManifest = {
  id: "ecommerce",
  label: "E-handel",
  description:
    "Storefront starter with product grid, category filtering, product detail page, cart drawer, and checkout-ready layout.",
  siteKind: "commerce",
  complexity: "advanced",
  structureProfile: "commerce-storefront",
  contentProfile: "product-catalog",
  features: ["product-grid", "cart", "checkout", "product-detail"],
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
    "This scaffold includes a product list, category pages, product detail pages, and a client-side cart drawer.",
    "Adapt product categories, imagery, and pricing to the user's niche. Replace all placeholder names.",
  ],
  qualityChecklist: [
    "Store name replaces [Butiksnamn] everywhere — header, hero badge, footer, metadata.",
    "Product names, categories, and prices are specific to the user's niche.",
    "Category and product images use descriptive placeholder text matching the niche.",
    "Hero section communicates the store's unique selling proposition, not generic copy.",
    "Navigation includes relevant links for the store type (not generic Hem/Produkter).",
    "Color scheme adapted from neutral to match the product category's visual identity.",
  ],
  research: {
    upgradeTargets: [
      "Persist cart state in localStorage and keep quantity changes between reloads.",
      "Add faceted filtering (price range, tags) with URL-based state in category pages.",
      "Add a checkout flow with address, delivery method, and payment summary steps.",
      "Show related products and recently viewed items on product pages.",
      "Generate structured data (JSON-LD Product + BreadcrumbList) for category and product pages.",
    ],
  },
  // Pure move of the former getScaffoldDefaultRoutes switch (route-plan
  // planning-helpers): only /products was guaranteed by the plan.
  //
  // SM-048 (owner decision 2026-08-14): the route plan decides which of
  // these route files are materialized. /categories and /om are declared
  // (page file exists, never planned by default) so the plan filter in
  // finalize-merge owns them — this also resolved their SM-042 gate drift.
  // The dynamic detail templates ride on their listing route via
  // deliveryGroups since neither has a static parent page
  // (app/product/[id]/page.tsx exists without app/product/page.tsx).
  //
  // Known drift (kept visible on purpose — see the route-contract gate in
  // scaffold-manifest-validation.test.ts):
  //  - SM-043: /cart below has neither a starter file (CartDrawer replaced
  //    the page) nor a link, and #977 removed it from the plan defaults. The
  //    entry documents the open owner question; remove it (or reintroduce a
  //    real page + link) once the owner picks a direction. Do not add a file
  //    just to silence the gate.
  routeContract: {
    requiredRoutes: [
      {
        path: "/products",
        name: "Products",
        planIntent: "Keep a storefront route for the product catalog.",
      },
    ],
    optionalRoutes: [],
    declaredRoutePaths: ["/cart", "/categories", "/om"],
    dynamicRoutePatterns: ["/category/[slug]", "/product/[id]"],
    deliveryGroups: [
      ["/products", "/product/[id]"],
      ["/categories", "/category/[slug]"],
    ],
  },
  // Header + footer: both are SHARED files that keep static route links.
  // After SM-048 the plan can drop /products, /categories, /om; nav-sync
  // must filter both surfaces (SM-055). Other scaffolds' footers use `#`
  // placeholders, so they stay off this list.
  navSurface: ["components/site-header.tsx", "components/site-footer.tsx"],
  files: loadScaffoldFiles("ecommerce"),
};
