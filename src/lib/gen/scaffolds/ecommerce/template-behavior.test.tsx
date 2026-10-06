import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CartDrawer } from "./files/components/cart-drawer";
import Home from "./files/app/page";
import ProductPage from "./files/app/product/[id]/page";
import ProductsPage from "./files/app/products/page";
import CategoryPage from "./files/app/category/[slug]/page";
import CartPage from "./files/app/cart/page";
import { CartProvider } from "./files/components/cart-provider";
import { AddToCart } from "./files/components/add-to-cart";
import { CartContents } from "./files/components/cart-contents";
import {
  cartStorageKey,
  MAX_QUANTITY,
  cartTotals,
  changeCartQuantity,
  readCartStorage,
} from "./files/lib/cart-state";
import { categories, findProduct, formatPrice, products } from "./files/lib/product-catalog";
import { ecommerceManifest } from "./manifest";
import { buildCompleteProject } from "../../export/project-scaffold";
import { collectRequiredUiComponents } from "../../export/project-scaffold-ui-reader";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import { buildRoutePlan } from "../../route-plan";
import { resolveScaffoldRouteDelivery } from "../route-delivery";
import { syncNavItemsFromRoutePlan } from "../sync-nav-from-route-plan";

const ROOT_STORAGE_KEY = cartStorageKey("/");

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
function demoRender(children: ReactNode) {
  return render(<CartProvider>{children}</CartProvider>);
}

afterEach(cleanup);

describe("ecommerce demo boundary", () => {
  it("keeps the store presentation on an addressable home section, not a fifth baseline page", () => {
    const { container } = demoRender(<Home />);
    const section = container.querySelector("#om");
    expect(section?.textContent).toContain("Kort butikspresentation");
    expect(ecommerceManifest.files.some((file) => file.path === "app/om/page.tsx")).toBe(false);
    expect(ecommerceManifest.routeContract?.declaredRoutePaths).not.toContain("/om");
  });

  it("default route delivery leaves no category-page links on the retained home page", () => {
    const plan = buildRoutePlan({
      buildIntent: "website", prompt: "Skapa en webbshop för våra produkter.",
      resolvedScaffold: ecommerceManifest,
    });
    const delivery = resolveScaffoldRouteDelivery(ecommerceManifest.routeContract, plan)!;
    const delivered = ecommerceManifest.files.filter((file) => !delivery.classifyDrop(file.path));
    const files = syncNavItemsFromRoutePlan({
      files: delivered.map((file) => ({ ...file, language: inferFileLanguage(file.path) })),
      routePlan: plan, scaffold: ecommerceManifest,
    }).files;
    const byPath = new Map(files.map((file) => [file.path, file.content]));
    expect(byPath.has("app/products/page.tsx")).toBe(true);
    expect(byPath.has("app/product/[id]/page.tsx")).toBe(true);
    expect(byPath.has("app/categories/page.tsx")).toBe(false);
    expect(byPath.has("app/category/[slug]/page.tsx")).toBe(false);
    expect(byPath.get("app/page.tsx")).toContain('href="#kategorier"');
    expect(byPath.get("app/page.tsx")).not.toContain('href="/categories"');
    expect(byPath.get("app/page.tsx")).not.toContain('href={`/category/');
    for (const path of ["components/site-header.tsx", "components/site-footer.tsx"])
      expect(byPath.get(path)).toContain('href: "/#om"');
  });

  it("an explicit category-page brief still delivers category templates and their navigation", () => {
    const plan = buildRoutePlan({
      buildIntent: "website", prompt: "Build the supplied category-page brief.",
      brief: { pages: [{ path: "/categories", name: "Categories", purpose: "Product categories" }] },
      resolvedScaffold: ecommerceManifest,
    });
    expect(plan.routes.some((route) => route.path === "/categories")).toBe(true);
    const delivery = resolveScaffoldRouteDelivery(ecommerceManifest.routeContract, plan)!;
    expect(delivery.classifyDrop("app/categories/page.tsx")).toBeNull();
    expect(delivery.classifyDrop("app/category/[slug]/page.tsx")).toBeNull();
    const files = syncNavItemsFromRoutePlan({
      files: ecommerceManifest.files.map((file) => ({ ...file, language: inferFileLanguage(file.path) })),
      routePlan: plan, scaffold: ecommerceManifest,
    }).files;
    for (const path of ["components/site-header.tsx", "components/site-footer.tsx"])
      expect(files.find((file) => file.path === path)?.content).toContain('href: "/categories"');
  });

  it("starts with an empty cart rather than invented purchases", () => {
    demoRender(<CartDrawer />);
    expect(screen.getByRole("button", { name: "Öppna varukorg (0)" })).toBeDefined();
  });

  it("cannot start an unconnected checkout", () => {
    demoRender(<CartDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /Öppna varukorg/ }));
    expect((screen.getByRole("button", { name: /kassan/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("labels the catalog as demo rather than promising payment and delivery", () => {
    const { container } = demoRender(<Home />);
    expect(container.textContent).toMatch(/demokatalog/i);
    expect(container.textContent).not.toMatch(/trygga betalningar|snabb leverans/i);
  });

  it("product add-to-cart has a visible result", async () => {
    demoRender(await ProductPage({ params: Promise.resolve({ id: "1" }) }));
    fireEvent.click(screen.getByRole("button", { name: "Lägg i varukorgen: [Produktnamn 1]" }));
    expect(screen.getByRole("status").textContent).toMatch(/demokorgen/);
  });
});

describe("shared local demo cart", () => {
  it("keeps same-origin preview chats isolated while preserving each chat's own cart", () => {
    const first = render(
      <CartProvider storageScope="/chat-a">
        <AddToCart productId="1" />
        <CartContents />
      </CartProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Lägg i varukorgen/ }));
    first.unmount();
    const second = render(
      <CartProvider storageScope="/chat-b">
        <AddToCart productId="2" />
        <CartContents />
      </CartProvider>,
    );
    expect(screen.getByText("Varukorgen är tom.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Lägg i varukorgen/ }));
    second.unmount();
    render(
      <CartProvider storageScope="/chat-a">
        <CartContents />
      </CartProvider>,
    );
    expect(screen.getByText("[Produktnamn 1]")).toBeDefined();
    expect(screen.queryByText("[Produktnamn 2]")).toBeNull();
  });

  it("exposes the current quantity to assistive technology after a change", () => {
    demoRender(
      <>
        <AddToCart productId="1" />
        <CartContents />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Lägg i varukorgen/ }));
    fireEvent.click(screen.getByRole("button", { name: /Öka antal/ }));
    expect(screen.getByRole("status", { name: "Antal [Produktnamn 1]: 2" }).textContent).toBe("2");
    expect(
      screen.getByRole("status", {
        name: `Demototal: ${formatPrice(findProduct("1")!.priceMinor * 2)}`,
      }).textContent,
    ).toBe(formatPrice(findProduct("1")!.priceMinor * 2));
  });

  it("an in-place scope change cannot persist the previous chat's rows into the next", () => {
    const view = render(
      <CartProvider storageScope="/chat-a">
        <AddToCart productId="1" />
        <CartContents />
      </CartProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Lägg i varukorgen/ }));
    view.rerender(
      <CartProvider storageScope="/chat-b">
        <CartContents />
      </CartProvider>,
    );
    expect(screen.getByText("Varukorgen är tom.")).toBeDefined();
    expect(localStorage.getItem(cartStorageKey("/chat-b"))).toBe("[]");
    expect(JSON.parse(localStorage.getItem(cartStorageKey("/chat-a"))!)).toEqual([
      { id: "1", quantity: 1 },
    ]);
  });

  it("add, quantity, totals, remove and remount all use the same catalog/state", () => {
    const view = demoRender(
      <>
        <AddToCart productId="1" />
        <CartContents />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Lägg i varukorgen/ }));
    expect(screen.getByLabelText(/^Demototal:/).textContent).toBe(
      formatPrice(findProduct("1")!.priceMinor),
    );
    fireEvent.click(screen.getByRole("button", { name: /Öka antal/ }));
    expect(screen.getByLabelText(/Antal \[Produktnamn 1\]:/).textContent).toBe("2");
    expect(screen.getByLabelText(/^Demototal:/).textContent).toBe(
      formatPrice(findProduct("1")!.priceMinor * 2),
    );
    expect(JSON.parse(localStorage.getItem(ROOT_STORAGE_KEY)!)).toEqual([{ id: "1", quantity: 2 }]);
    view.unmount();
    demoRender(<CartPage />);
    expect(screen.getByLabelText(/Antal \[Produktnamn 1\]:/).textContent).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: /Minska antal/ }));
    expect(screen.getByLabelText(/Antal \[Produktnamn 1\]:/).textContent).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: /Ta bort/ }));
    expect(screen.getByText("Varukorgen är tom.")).toBeDefined();
    expect(localStorage.getItem(ROOT_STORAGE_KEY)).toBe("[]");
  });

  it("shares listing add actions with the drawer without nested interactive links", () => {
    const { container } = demoRender(
      <>
        <ProductsPage />
        <CartDrawer />
      </>,
    );
    const add = screen.getByRole("button", { name: "Lägg i varukorgen: [Produktnamn 2]" });
    expect(add.closest("a")).toBeNull();
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Öppna varukorg (1)" }));
    expect(within(screen.getByRole("dialog")).getByLabelText(/^Demototal:/).textContent).toBe(
      formatPrice(findProduct("2")!.priceMinor),
    );
    expect(container.querySelectorAll('a[href^="/product/"]')).toHaveLength(6);
  });

  it("storage failure leaves controls usable and discloses lost persistence", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    demoRender(
      <>
        <AddToCart productId="1" />
        <CartContents />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Lägg i varukorgen/ }));
    expect(screen.getByLabelText(/Antal \[Produktnamn 1\]:/).textContent).toBe("1");
    expect(
      screen
        .getAllByRole("status")
        .some((item) => /kanske inte sparas/.test(item.textContent ?? "")),
    ).toBe(true);
  });

  it("uses catalog prices despite forged browser-stored names/prices", () => {
    localStorage.setItem(
      ROOT_STORAGE_KEY,
      JSON.stringify([{ id: "1", quantity: 2, name: "FORGED", priceMinor: -999 }]),
    );
    const { container } = demoRender(<CartContents />);
    expect(container.textContent).not.toContain("FORGED");
    expect(screen.getByLabelText(/^Demototal:/).textContent).toBe(
      formatPrice(findProduct("1")!.priceMinor * 2),
    );
  });

  it("SSR starts empty with add disabled and leaves the previous storage version untouched", () => {
    localStorage.setItem("sajtmaskin-demo-cart:v1", "legacy data");
    const html = renderToStaticMarkup(
      <CartProvider>
        <AddToCart productId="1" />
        <CartContents />
      </CartProvider>,
    );
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
    expect(document.body.textContent).toContain(formatPrice(0));
    demoRender(<CartContents />);
    expect(localStorage.getItem("sajtmaskin-demo-cart:v1")).toBe("legacy data");
  });

  it("caps quantity and removes a row when decreasing to zero", () => {
    localStorage.setItem(ROOT_STORAGE_KEY, JSON.stringify([{ id: "1", quantity: MAX_QUANTITY }]));
    demoRender(
      <>
        <AddToCart productId="1" />
        <CartContents />
      </>,
    );
    expect(
      (screen.getByRole("button", { name: /Lägg i varukorgen/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole("button", { name: /Öka antal/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(changeCartQuantity([{ id: "1", quantity: 1 }], "1", -1)).toEqual([]);
    expect(changeCartQuantity([{ id: "1", quantity: MAX_QUANTITY }], "1", 1)).toEqual([
      { id: "1", quantity: MAX_QUANTITY },
    ]);
    expect(changeCartQuantity([], "unknown", 1)).toEqual([]);
    expect(changeCartQuantity([], "1", 0.5)).toEqual([]);
  });
});

describe("persisted cart validation", () => {
  it.each([
    "broken-json",
    "null",
    "{}",
    '[{"id":"unknown","quantity":1}]',
    '[{"id":"1","quantity":0}]',
    '[{"id":"1","quantity":-1}]',
    '[{"id":"1","quantity":1.5}]',
    '[{"id":"1","quantity":"1"}]',
    '[{"id":"1","quantity":100}]',
    '[{"id":"1","quantity":1},{"id":"1","quantity":2}]',
    "[null]",
  ])("rejects malformed data: %s", (raw) => {
    expect(readCartStorage(raw)).toEqual([]);
  });
  it("accepts valid rows and totals different products in integer minor units", () => {
    const items = readCartStorage('[{"id":"1","quantity":2},{"id":"2","quantity":1}]');
    expect(cartTotals(items)).toEqual({ count: 3, priceMinor: 179700 });
  });
});

describe("catalog routes and materialization", () => {
  it.each(products.map((product) => product.id))(
    "renders linked detail %s with canonical price and no payment promise",
    async (id) => {
      const { container } = demoRender(await ProductPage({ params: Promise.resolve({ id }) }));
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(findProduct(id)!.name);
      expect(container.textContent).toContain(formatPrice(findProduct(id)!.priceMinor));
      expect((screen.getByRole("button", { name: /Köp nu/ }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(container.textContent).not.toMatch(
        /trygg betalning|bästsäljare|kundfavorit|säker checkout/i,
      );
    },
  );
  it.each(categories.map((category) => category.slug))(
    "category %s links only its catalog products",
    async (slug) => {
      const { container } = demoRender(await CategoryPage({ params: Promise.resolve({ slug }) }));
      expect(
        Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/product/"]')).map(
          (link) => link.getAttribute("href"),
        ),
      ).toEqual(
        products
          .filter((product) => product.categorySlug === slug)
          .map((product) => `/product/${product.id}`),
      );
    },
  );
  it("unknown detail/category identities remain 404s", async () => {
    await expect(ProductPage({ params: Promise.resolve({ id: "unknown" }) })).rejects.toThrow();
    await expect(CategoryPage({ params: Promise.resolve({ slug: "unknown" }) })).rejects.toThrow();
  });
  it("materializes provider, catalog, cart and complete UI dependency closure without changing route defaults", () => {
    const generated = ecommerceManifest.files.map((file) => ({
      ...file,
      language: inferFileLanguage(file.path),
    }));
    const files = buildCompleteProject(generated, collectRequiredUiComponents(generated));
    const byPath = new Map(files.map((file) => [file.path, file.content]));
    for (const path of [
      "lib/product-catalog.ts",
      "lib/cart-state.ts",
      "components/cart-provider.tsx",
      "components/cart-contents.tsx",
      "components/product-card.tsx",
      "components/add-to-cart.tsx",
      "app/cart/page.tsx",
    ])
      expect(byPath.has(path)).toBe(true);
    expect(byPath.get("app/layout.tsx")).toContain("<CartProvider storageScope={storageScope}>");
    expect(byPath.get("app/layout.tsx")).toContain(
      'process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim() || "/"',
    );
    expect(byPath.get("components/site-header.tsx")).toContain('href: "/cart"');
    for (const component of ["button", "badge", "card", "sheet"])
      expect(byPath.has(`components/ui/${component}.tsx`)).toBe(true);
    expect(ecommerceManifest.routeContract?.declaredRoutePaths).toContain("/cart");
    expect(ecommerceManifest.routeContract?.requiredRoutes.map((route) => route.path)).toEqual([
      "/products",
    ]);
    expect(ecommerceManifest.routeContract?.deliveryGroups).toEqual([
      ["/products", "/product/[id]"],
      ["/categories", "/category/[slug]"],
    ]);
    expect(ecommerceManifest.features).not.toContain("checkout");
  });
});
