import { describe, expect, it } from "vitest";

import {
  bindingHoldsComponentIcons,
  fileSuggestsComponentIcons,
  fileSuggestsStringIcons,
  fixIconComponentValueMisuse,
} from "./icon-component-value-fixer";

/**
 * Prod-regression 2026-09-10 (chat `5d809cc1`, ecommerce/megastore-clean): the
 * fixer rewrote `name={product.icon}` — an ATTRIBUTE value with `icon: string`
 * — into a ternary that renders `<product.icon />`. Preview survived (runtime
 * takes the string branch) but `next build` on Vercel failed on TS2322 /
 * TS2339 / TS2604. The model's original code was correct.
 */
const PRODUCT_PAGE_WITH_STRING_ICONS = `
const products = [
  { id: "1", name: "Anchor", icon: "anchor" },
  { id: "2", name: "Wheel", icon: "wheel" },
];

export default function Page() {
  return (
    <ul>
      {products.map((product) => (
        <li key={product.id}>
          <ProductIcon name={product.icon} />
          <span>{product.name}</span>
        </li>
      ))}
    </ul>
  );
}
`;

const FEATURE_LIST_WITH_COMPONENT_ICONS = `
import { Anchor, Ship } from "lucide-react";

const features = [
  { title: "Kajplats", icon: Anchor },
  { title: "Frakt", icon: Ship },
];

export function Features() {
  return (
    <ul>
      {features.map((feature) => (
        <li key={feature.title}>
          {feature.icon}
          <span>{feature.title}</span>
        </li>
      ))}
    </ul>
  );
}
`;

describe("fixIconComponentValueMisuse", () => {
  it("never rewrites an attribute value like name={product.icon} (prod regression)", () => {
    const result = fixIconComponentValueMisuse(
      PRODUCT_PAGE_WITH_STRING_ICONS,
      "app/products/page.tsx",
    );
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(PRODUCT_PAGE_WITH_STRING_ICONS);
    expect(result.code).toContain("<ProductIcon name={product.icon} />");
    expect(result.code).not.toContain("<product.icon");
  });

  it("rewrites a bare JSX child when the file shows component icons", () => {
    const result = fixIconComponentValueMisuse(
      FEATURE_LIST_WITH_COMPONENT_ICONS,
      "components/features.tsx",
    );
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(
      `{typeof feature.icon === "string" ? feature.icon : <feature.icon className="h-5 w-5" />}`,
    );
    // The child on the following line stays untouched.
    expect(result.code).toContain("<span>{feature.title}</span>");
    expect(result.fixes).toEqual([
      expect.objectContaining({
        fixer: "icon-component-value-fixer",
        file: "components/features.tsx",
      }),
    ]);
  });

  it("rewrites a child that directly follows a closing tag bracket", () => {
    const code = `
const items = [{ label: "A", icon: Anchor }];
export const Row = () => <div className="row">{items[0].icon}</div>;
const Inline = ({ item }: { item: (typeof items)[number] }) => <span>{item.icon}</span>;
`;
    const result = fixIconComponentValueMisuse(code, "components/row.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(
      `<span>{typeof item.icon === "string" ? item.icon : <item.icon className="h-5 w-5" />}</span>`,
    );
    // `items[0].icon` is not a plain identifier chain and is left alone.
    expect(result.code).toContain(`<div className="row">{items[0].icon}</div>`);
  });

  it("leaves a bare child alone when the file only has string icon names", () => {
    const code = `
const links = [{ label: "Hem", icon: "home" }];
export function Nav() {
  return (
    <nav>
      {links.map((link) => (
        <a key={link.label}>
          {link.icon}
          {link.label}
        </a>
      ))}
    </nav>
  );
}
`;
    const result = fixIconComponentValueMisuse(code, "components/nav.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("does not touch icon values that are already rendered as elements", () => {
    const code = `
const tabs = [{ id: "a", icon: Anchor }];
export const Tabs = () => tabs.map((tab) => <tab.icon key={tab.id} className="h-4 w-4" />);
`;
    const result = fixIconComponentValueMisuse(code, "components/tabs.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  /**
   * Review-fynd på PR #1329 (#1): en fil med BÅDE `icon: Component` och
   * `icon: "string"` slog på fil-global evidence och skrev om alla barn —
   * även string-barnen, som då fick samma TS2322/TS2604 som prod-incidenten.
   * Evidence är nu per bindning: `feature` → `features` (komponent) skrivs
   * om, `product` → `products` (string) lämnas.
   */
  it("mixed file: rewrites only the binding whose array holds component icons", () => {
    const code = `
import { Anchor, Ship } from "lucide-react";

const products = [
  { id: "1", name: "Anchor", icon: "anchor" },
  { id: "2", name: "Wheel", icon: "wheel" },
];

const features = [
  { title: "Kajplats", icon: Anchor },
  { title: "Frakt", icon: Ship },
];

export default function Page() {
  return (
    <>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            {product.icon}
            <span>{product.name}</span>
          </li>
        ))}
      </ul>
      <ul>
        {features.map((feature) => (
          <li key={feature.title}>
            {feature.icon}
            <span>{feature.title}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
`;
    const result = fixIconComponentValueMisuse(code, "app/page.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(
      `{typeof feature.icon === "string" ? feature.icon : <feature.icon className="h-5 w-5" />}`,
    );
    // The string-icon binding is untouched: no `<product.icon`, bare child kept.
    expect(result.code).not.toContain("<product.icon");
    expect(result.code).toContain("            {product.icon}\n");
  });

  it("mixed file with an unresolvable binding (prop) falls back to no-op", () => {
    const code = `
import { Anchor } from "lucide-react";
const nav = [{ label: "Hem", icon: "home" }];
const featured = { title: "X", icon: Anchor };
export function Row({ item }: { item: { icon: unknown; label: string } }) {
  return <span>{item.icon}</span>;
}
`;
    const result = fixIconComponentValueMisuse(code, "components/row.tsx");
    expect(result.fixed).toBe(false);
    expect(result.code).toBe(code);
  });

  it("unresolvable binding in a component-only file is still rewritten", () => {
    const code = `
import type { LucideIcon } from "lucide-react";
type Item = { icon: LucideIcon; label: string };
export function Row({ item }: { item: Item }) {
  return <span>{item.icon}</span>;
}
`;
    const result = fixIconComponentValueMisuse(code, "components/row.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(
      `<span>{typeof item.icon === "string" ? item.icon : <item.icon className="h-5 w-5" />}</span>`,
    );
  });

  it("still rewrites key={x.icon} regardless of icon type (both branches are strings)", () => {
    const code = `
const rows = [{ title: "A", icon: "anchor" }];
export const List = () => rows.map((row) => <li key={row.icon}>{row.title}</li>);
`;
    const result = fixIconComponentValueMisuse(code, "components/list.tsx");
    expect(result.fixed).toBe(true);
    expect(result.code).toContain(
      `key={typeof row.icon === "string" ? row.icon : (row.title ?? row.label ?? row.name ?? "icon-item")}`,
    );
    expect(result.code).toContain("{row.title}</li>");
  });
});

describe("fileSuggestsComponentIcons", () => {
  it("detects uppercase component references and component type annotations", () => {
    expect(fileSuggestsComponentIcons(`const a = [{ icon: Anchor }];`)).toBe(true);
    expect(fileSuggestsComponentIcons(`const a = [{ icon: Icons.anchor, x: 1 }];`)).toBe(true);
    expect(fileSuggestsComponentIcons(`type Item = { icon: LucideIcon; title: string };`)).toBe(
      true,
    );
    expect(fileSuggestsComponentIcons(`type Item = { icon?: ComponentType<{ className?: string }> };`)).toBe(
      true,
    );
  });

  it("ignores string icon names and unrelated lowercase identifiers", () => {
    expect(fileSuggestsComponentIcons(`const a = [{ icon: "anchor" }];`)).toBe(false);
    expect(fileSuggestsComponentIcons(`const a = [{ icon: iconName }];`)).toBe(false);
    expect(fileSuggestsComponentIcons(`<Button size="icon" />`)).toBe(false);
  });
});

describe("fileSuggestsStringIcons", () => {
  it("detects string literals and `string` type annotations in icon slots", () => {
    expect(fileSuggestsStringIcons(`const a = [{ icon: "anchor" }];`)).toBe(true);
    expect(fileSuggestsStringIcons(`const a = [{ icon: 'anchor' }];`)).toBe(true);
    expect(fileSuggestsStringIcons("type P = { icon?: string };")).toBe(true);
    expect(fileSuggestsStringIcons(`const a = [{ icon: Anchor }];`)).toBe(false);
  });
});

describe("bindingHoldsComponentIcons", () => {
  const mixed = `
const products = [{ id: "1", icon: "anchor" }];
const features = [{ title: "A", icon: Anchor }];
const both = [{ title: "A", icon: Anchor }, { title: "B", icon: "ship" }];
products.map((product) => product.icon);
features.map(feature => feature.icon);
both.map((entry) => entry.icon);
`;

  it("resolves the iterated array literal per binding", () => {
    expect(bindingHoldsComponentIcons(mixed, "feature")).toBe(true);
    expect(bindingHoldsComponentIcons(mixed, "product")).toBe(false);
  });

  it("refuses a single array that mixes component and string icons", () => {
    expect(bindingHoldsComponentIcons(mixed, "entry")).toBe(false);
  });

  it("handles nested brackets and strings containing brackets inside the literal", () => {
    const code = `
const tabs = [
  { id: "a]", tags: ["x", "y"], icon: Anchor },
  { id: "b", tags: [], icon: Ship },
];
const other = [{ id: "c", icon: "wheel" }];
tabs.map((tab) => tab.icon);
`;
    expect(bindingHoldsComponentIcons(code, "tab")).toBe(true);
  });

  it("falls back to the whole file when the binding is not an array iteration", () => {
    expect(bindingHoldsComponentIcons(`type I = { icon: LucideIcon }; <b>{item.icon}</b>`, "item")).toBe(true);
    expect(bindingHoldsComponentIcons(mixed, "item")).toBe(false);
  });
});
