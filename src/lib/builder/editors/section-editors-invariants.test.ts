import { describe, expect, it } from "vitest";
import { readBlogPostsDraft } from "./blog-posts-editor";
import { readCategoryItemsDraft } from "./category-editor";
import { readFaqItemsDraft } from "./faq-editor";
import { readNavItemsDraft } from "./nav-items-editor";
import { readProductItemsDraft } from "./product-editor";
import { readServiceItemsDraft } from "./services-editor";
import { readStatItemsDraft } from "./stats-editor";
import { readTeamMembers } from "./team-editor";
import { readTestimonialItemsDraft } from "./testimonials-editor";

/**
 * Cross-editor leak invariant.
 *
 * The section editors scrape generated source with regexes. The prod bug
 * (Kaffehörnan) was invisible in the per-editor unit tests because those used a
 * SINGLE clean array. Real generated pages contain MANY sibling arrays whose
 * objects share leading keys (a menu `{ name, price }` next to testimonials
 * `{ name, role, quote }` next to a team `{ name, role, bio }`). A greedy
 * capture then swallowed foreign arrays into the first field.
 *
 * This fixture reproduces that hostile layout once and asserts each editor
 * extracts ONLY its own array — no field may contain a `{`, `}` or a foreign
 * key like `price:`/`slug:`, which is the fingerprint of a cross-array leak.
 */
const HOSTILE_PAGE = [
  "const menu = [",
  '  { name: "Espresso", price: "36 kr" },',
  '  { name: "Cappuccino", price: "46 kr" },',
  "];",
  "const testimonials = [",
  '  { name: "Anna", role: "Stammis", quote: "Bästa kaffet i stan." },',
  '  { name: "Erik", role: "Granne", quote: "Mysigt och gott." },',
  "];",
  "const team = [",
  '  { name: "Bo", role: "Barista", bio: "Brygger allt kaffe." },',
  '  { name: "Cia", role: "Bagare", bio: "Bakar varje morgon." },',
  "];",
  "const products = [",
  '  { id: "p1", name: "Bönor 250g", price: "89 kr" },',
  '  { id: "p2", name: "Bryggare", price: "499 kr" },',
  "];",
  "const categories = [",
  '  { name: "Kaffe", slug: "kaffe" },',
  '  { name: "Bakverk", slug: "bakverk" },',
  "];",
  "const navItems = [",
  '  { label: "Hem", href: "/" },',
  '  { label: "Meny", href: "/meny" },',
  "];",
  "const stats = [",
  '  { label: "Nöjda gäster", value: "98%" },',
  '  { label: "År i branschen", value: "12" },',
  "];",
  "const services = [",
  '  { title: "Catering", description: "Vi levererar fika." },',
  '  { title: "Event", description: "Boka lokalen." },',
  "];",
  "const posts = [",
  '  { slug: "oppning", title: "Vi öppnar!", excerpt: "Nu drar vi igång." },',
  '  { slug: "host", title: "Höstmeny", excerpt: "Nya smaker." },',
  "];",
  "const faqs = [",
  '  { question: "Har ni veganskt?", answer: "Ja, alltid." },',
  '  { question: "Kan man boka?", answer: "Absolut." },',
  "];",
].join("\n");

const PAGE = "app/page.tsx";

/** A leaked capture always drags in a brace or a foreign key. */
function assertNoLeak(values: Array<string | undefined>) {
  for (const value of values) {
    expect(value ?? "").not.toMatch(/[{}]/);
    expect(value ?? "").not.toMatch(/\b(price|slug|href|bio|role|value|excerpt):/);
  }
}

describe("section editors — cross-array leak invariant", () => {
  it("testimonials reads only the testimonials array", () => {
    const result = readTestimonialItemsDraft(PAGE, HOSTILE_PAGE);
    expect(result).toEqual([
      { name: "Anna", role: "Stammis", quote: "Bästa kaffet i stan." },
      { name: "Erik", role: "Granne", quote: "Mysigt och gott." },
    ]);
    assertNoLeak((result ?? []).map((r) => r.name));
  });

  it("team reads only the team array (not testimonials, which also start with name+role)", () => {
    const result = readTeamMembers(PAGE, HOSTILE_PAGE);
    expect(result).toEqual([
      { name: "Bo", role: "Barista", bio: "Brygger allt kaffe." },
      { name: "Cia", role: "Bagare", bio: "Bakar varje morgon." },
    ]);
    assertNoLeak((result ?? []).map((r) => r.name));
  });

  it("products reads only id/name/price objects (skips the menu, which has no id)", () => {
    const result = readProductItemsDraft(PAGE, HOSTILE_PAGE);
    expect(result).toEqual([
      { name: "Bönor 250g", price: "89 kr" },
      { name: "Bryggare", price: "499 kr" },
    ]);
    assertNoLeak((result ?? []).map((r) => r.name));
  });

  it("categories reads only name/slug objects (not the menu name/price)", () => {
    const result = readCategoryItemsDraft(PAGE, HOSTILE_PAGE);
    expect(result).toEqual([{ name: "Kaffe" }, { name: "Bakverk" }]);
    assertNoLeak((result ?? []).map((r) => r.name));
  });

  it("nav reads only label/href objects (not stats label/value)", () => {
    const result = readNavItemsDraft(PAGE, HOSTILE_PAGE);
    expect(result).toEqual([{ label: "Hem" }, { label: "Meny" }]);
    assertNoLeak((result ?? []).map((r) => r.label));
  });

  it("stats reads only label/value objects (not nav label/href)", () => {
    const result = readStatItemsDraft(PAGE, HOSTILE_PAGE);
    expect(result).toEqual([
      { label: "Nöjda gäster", value: "98%" },
      { label: "År i branschen", value: "12" },
    ]);
    assertNoLeak((result ?? []).flatMap((r) => [r.label, r.value]));
  });

  it("services reads only title/description objects", () => {
    const result = readServiceItemsDraft(PAGE, HOSTILE_PAGE);
    expect(result).toEqual([
      { title: "Catering", description: "Vi levererar fika." },
      { title: "Event", description: "Boka lokalen." },
    ]);
    assertNoLeak((result ?? []).flatMap((r) => [r.title, r.description]));
  });

  it("faq reads only question/answer objects", () => {
    const result = readFaqItemsDraft(PAGE, HOSTILE_PAGE);
    expect(result).toEqual([
      { question: "Har ni veganskt?", answer: "Ja, alltid." },
      { question: "Kan man boka?", answer: "Absolut." },
    ]);
    assertNoLeak((result ?? []).flatMap((r) => [r.question, r.answer]));
  });

  it("blog reads only slug/title/excerpt objects", () => {
    const result = readBlogPostsDraft(PAGE, HOSTILE_PAGE);
    expect(result).toEqual([
      { title: "Vi öppnar!", excerpt: "Nu drar vi igång." },
      { title: "Höstmeny", excerpt: "Nya smaker." },
    ]);
    assertNoLeak((result ?? []).flatMap((r) => [r.title, r.excerpt]));
  });
});
