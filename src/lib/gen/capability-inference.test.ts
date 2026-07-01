import { describe, expect, it } from "vitest";
import {
  inferCapabilities,
  buildCapabilityHints,
} from "./capability-inference";

describe("inferCapabilities", () => {
  it("detects app-like cinematic 3D website prompts in Swedish", () => {
    const caps = inferCapabilities(
      "Jag vill ha en hemsida som är mycket app-lik med en massa coola 3dsaker och filmisk neon-känsla.",
    );

    expect(caps.needs3D).toBe(true);
    expect(caps.needsMotion).toBe(true);
    expect(caps.needsAppShell).toBe(true);
    expect(caps.needsPremiumVisuals).toBe(true);
  });

  it("does not treat ordinary portfolio galleries as carousel capabilities", () => {
    const caps = inferCapabilities(
      "Jag vill ha en portfolio med bildgalleri och statistik-grafer.",
    );
    expect(caps.needsCarousel).toBe(false);
    expect(caps.needsCharts).toBe(true);
  });

  it("detects explicit carousel + charts from a mixed prompt", () => {
    const caps = inferCapabilities(
      "Jag vill ha en portfolio med karusell för bilder och statistik-grafer.",
    );
    expect(caps.needsCarousel).toBe(true);
    expect(caps.needsCharts).toBe(true);
  });

  it("detects forms + ecommerce without false positives on hospitality", () => {
    const caps = inferCapabilities("Build a webshop with a checkout form and product pages");
    expect(caps.needsEcommerce).toBe(true);
    expect(caps.needsPayments).toBe(true);
    expect(caps.needsForms).toBe(true);
  });

  it("detects calendar from Swedish 'almanacka' and implies needsForms", () => {
    const caps = inferCapabilities("Jag vill ha en almanacka på sidan där man kan se datum");
    expect(caps.needsCalendar).toBe(true);
    expect(caps.needsForms).toBe(true);
  });

  it("detects calendar from 'boka tid' prompt", () => {
    const caps = inferCapabilities("En sida där kunder kan boka tid för klippning");
    expect(caps.needsCalendar).toBe(true);
    expect(caps.needsForms).toBe(true);
  });

  it("detects theme toggle from 'dark mode' prompt", () => {
    const caps = inferCapabilities("I want a dark mode toggle on the site");
    expect(caps.needsThemeToggle).toBe(true);
  });

  it("detects theme toggle from Swedish 'mörkt tema'", () => {
    const caps = inferCapabilities("Lägg till en knapp för att byta mellan ljust och mörkt tema");
    expect(caps.needsThemeToggle).toBe(true);
  });

  it("detects playable game intent without forcing 3D for ordinary 2D games", () => {
    const caps = inferCapabilities("Bygg ett litet spel där man styr en orm och samlar poäng");
    expect(caps.needsGame).toBe(true);
    expect(caps.needsMotion).toBe(true);
    expect(caps.needs3D).toBe(false);
  });

  it("detects Swedish compound game words such as platformerspel without forcing 3D", () => {
    const caps = inferCapabilities("Bygg ett platformerspel med pixelgrafik och poäng");
    expect(caps.needsGame).toBe(true);
    expect(caps.needsMotion).toBe(true);
    expect(caps.needs3D).toBe(false);
  });

  it("detects game + canvas/WebGL as interactive 3D/canvas work", () => {
    const caps = inferCapabilities("Bygg ett interaktivt canvas game med WebGL och poängräkning");
    expect(caps.needsGame).toBe(true);
    expect(caps.needs3D).toBe(true);
  });

  it("detects command search from 'cmd+k' prompt", () => {
    const caps = inferCapabilities("Add a cmd+k command palette for quick navigation");
    expect(caps.needsCommandSearch).toBe(true);
  });

  it("detects command search from Swedish 'sökpalett'", () => {
    const caps = inferCapabilities("Jag vill ha en sökpalett som öppnas med tangentbordsgenväg");
    expect(caps.needsCommandSearch).toBe(true);
  });

  it("capability-inference detects physics keywords", () => {
    const caps = inferCapabilities("en figur som åker omkring och studsar");
    expect(caps.needs3D).toBe(true);
    expect(caps.needsPhysics).toBe(true);
  });

  it("keeps hovering/floating vocabulary decorative unless physics is explicit", () => {
    const caps = inferCapabilities("a 3d chimp that hovers and floats");
    expect(caps.needs3D).toBe(true);
    expect(caps.needsPhysics).toBe(false);
  });

  it("does not flag physics for plain 3D corner art", () => {
    const caps = inferCapabilities("en 3d-bild i hörnet");
    expect(caps.needs3D).toBe(true);
    expect(caps.needsPhysics).toBe(false);
  });

  it("treats a plain floating coffee-cup follow-up as motion, not 3D", () => {
    const caps = inferCapabilities("Lägg till en svävande kaffekopp på förstasidan");
    expect(caps.needsMotion).toBe(true);
    expect(caps.needs3D).toBe(false);
    expect(caps.needsPhysics).toBe(false);
  });

  it("keeps explicit floating 3D/WebGL coffee-cup prompts on the 3D path", () => {
    const explicit3d = inferCapabilities("svävande 3D-kaffekopp som roterar");
    expect(explicit3d.needsMotion).toBe(true);
    expect(explicit3d.needs3D).toBe(true);

    const webgl = inferCapabilities("flygande kaffekopp i WebGL ovanför hero");
    expect(webgl.needsMotion).toBe(true);
    expect(webgl.needs3D).toBe(true);
  });

  it("suppresses backend/auth/payment capability flags when explicitly negated in a visual-only 3D follow-up", () => {
    const caps = inferCapabilities(
      "Lägg till en flygande 3D-anka. Lägg inte till backend, API-routes, auth, betalning eller externa tjänster.",
    );
    expect(caps.needs3D).toBe(true);
    expect(caps.needsMotion).toBe(true);
    expect(caps.needsAuth).toBe(false);
    expect(caps.needsPayments).toBe(false);
    expect(caps.needsDatabase).toBe(false);
    expect(caps.needsDataUI).toBe(false);
  });

  it("suppresses needsEcommerce when ecommerce is explicitly negated", () => {
    const caps = inferCapabilities(
      "Bygg en storefront som visar produkter, men utan varukorg och utan checkout.",
    );
    expect(caps.needsEcommerce).toBe(false);
  });

  it("suppresses needsEcommerce for an English 'no cart/checkout' display shop", () => {
    const caps = inferCapabilities("A shop page to showcase products without a cart or checkout");
    expect(caps.needsEcommerce).toBe(false);
  });

  it("still infers needsEcommerce for a genuine webshop request", () => {
    const caps = inferCapabilities("Build a webshop with a cart and checkout");
    expect(caps.needsEcommerce).toBe(true);
  });

  it("detects scroll-parallax from English 'parallax scroll'", () => {
    const caps = inferCapabilities("a landing page with parallax scroll effects");
    expect(caps.needsParallax).toBe(true);
    expect(caps.needsMotion).toBe(true);
  });

  it("detects pointer-parallax from Swedish 'följer muspekaren'", () => {
    const caps = inferCapabilities("Hero-kort som följer muspekaren med parallax");
    expect(caps.needsParallax).toBe(true);
  });

  it("detects parallax from generic 'parallax' keyword in Swedish", () => {
    const caps = inferCapabilities("lägg till lite parallax på hjältesektionen");
    expect(caps.needsParallax).toBe(true);
  });

  it("does NOT flag needsParallax for plain motion words", () => {
    const caps = inferCapabilities("fade-in på alla sektioner när de scrolas in");
    expect(caps.needsMotion).toBe(true);
    expect(caps.needsParallax).toBe(false);
  });

  // ---- Phase 6: empirical phrasings the user wants to be reliable ----

  it("phrase 'parallax-header i glas' triggers needsParallax + needsPremiumVisuals", () => {
    const caps = inferCapabilities("Jag vill ha en parallax-header i glas");
    expect(caps.needsParallax).toBe(true);
    expect(caps.needsPremiumVisuals).toBe(true);
  });

  it("phrase 'mouse-parallax på hero-cardet' triggers needsParallax", () => {
    const caps = inferCapabilities("Lägg till mouse-parallax på hero-cardet");
    expect(caps.needsParallax).toBe(true);
  });

  it("phrase 'stripe-betalning som använder mina färger' triggers needsPayments", () => {
    const caps = inferCapabilities(
      "Jag vill ha en stripe-betalning som använder mina färger",
    );
    expect(caps.needsPayments).toBe(true);
  });

  it("Klarna and Swish trigger needsPayments", () => {
    expect(inferCapabilities("Lägg in Klarna-betalning på checkout").needsPayments).toBe(true);
    expect(inferCapabilities("Användaren ska kunna betala med Swish").needsPayments).toBe(true);
  });

  it("does NOT flag needsPayments for plain ecommerce wording without explicit payment provider", () => {
    const caps = inferCapabilities(
      "Visa produkter i en katalog utan onlinebetalning i MVP",
    );
    expect(caps.needsPayments).toBe(false);
  });

  // ---- P31 follow-up bug #3: generic 'betala med X' / 'köpa med X' ----

  it("'betala med kort' triggers needsPayments", () => {
    expect(inferCapabilities("Användaren ska kunna betala med kort").needsPayments).toBe(true);
    expect(inferCapabilities("Vi vill kunna betala med kreditkort på sidan").needsPayments).toBe(true);
  });

  it("'köpa med kort' / 'köp med stripe' triggers needsPayments", () => {
    expect(inferCapabilities("Det ska gå att köpa med kort").needsPayments).toBe(true);
    expect(inferCapabilities("Köp med stripe direkt på produktsidan").needsPayments).toBe(true);
  });

  it("does NOT trigger needsPayments on generic 'betala räkningen' style phrases", () => {
    expect(inferCapabilities("Påminn kunden om att betala räkningen").needsPayments).toBe(false);
    expect(inferCapabilities("Kostar att betala för parkering").needsPayments).toBe(false);
  });

  it("'kreditkort' alone (without provider) triggers needsPayments", () => {
    expect(inferCapabilities("Vi tar kreditkort på plats").needsPayments).toBe(true);
  });
});

describe("buildCapabilityHints (pack-based)", () => {
  it("returns null for empty capabilities", () => {
    const caps = inferCapabilities("en enkel hemsida");
    expect(buildCapabilityHints(caps)).toBeNull();
  });

  it("suppresses motion hint when 3D is active", () => {
    const caps = inferCapabilities("3d animation site with particle effects");
    expect(caps.needs3D).toBe(true);
    expect(caps.needsMotion).toBe(true);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("3D/WebGL");
    expect(hints).not.toContain("Motion/animation requested");
  });

  it("includes motion hint when 3D is not active and parallax is not requested", () => {
    const caps = inferCapabilities("a landing page with smooth fade-in transitions on scroll reveal");
    expect(caps.needsMotion).toBe(true);
    expect(caps.needs3D).toBe(false);
    expect(caps.needsParallax).toBe(false);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("Motion/animation requested");
  });

  it("emits parallax-specific hint instead of generic motion when parallax is requested", () => {
    const caps = inferCapabilities("a landing page with parallax scroll effects");
    expect(caps.needsParallax).toBe(true);
    expect(caps.needsMotion).toBe(true);
    expect(caps.needs3D).toBe(false);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("Parallax requested");
    expect(hints).toContain("ScrollParallaxLayer");
    expect(hints).not.toContain("Motion/animation requested");
  });

  it("parallax hint mentions both DOM and R3F integrations", () => {
    const caps = inferCapabilities("Lägg till mouse-parallax på hero-kortet");
    expect(caps.needsParallax).toBe(true);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("PointerParallaxLayer");
    expect(hints).toContain("usePointerParallax");
    expect(hints).toContain("useFrame");
  });

  it("parallax + 3D produces both 3D and parallax hints", () => {
    const caps = inferCapabilities("3d hero with mouse-parallax that follows the cursor");
    expect(caps.needs3D).toBe(true);
    expect(caps.needsParallax).toBe(true);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("3D/WebGL");
    expect(hints).toContain("Parallax requested");
  });

  it("payments hint mentions Stripe checkout dossier components and key enforcement", () => {
    const caps = inferCapabilities("Lägg in stripe-betalning för bokpaketen");
    expect(caps.needsPayments).toBe(true);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("Payments requested");
    expect(hints).toContain("CheckoutButton");
    expect(hints).toContain("STRIPE_SECRET_KEY");
    expect(hints).toContain("warn-only");
  });

  it("generates hints for previously uncovered capabilities", () => {
    const appShellCaps = inferCapabilities("Build a dashboard with sidebar navigation");
    expect(buildCapabilityHints(appShellCaps)).toContain("App shell");

    const dataUiCaps = inferCapabilities("A data table with sorting and pagination");
    expect(buildCapabilityHints(dataUiCaps)).toContain("Data table");

    const ecommerceCaps = inferCapabilities("An ecommerce storefront with a cart");
    expect(buildCapabilityHints(ecommerceCaps)).toContain("E-commerce");
  });

  it("calendar hint includes react-day-picker and Popover", () => {
    const caps = inferCapabilities("En kalender för att välja datum");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("react-day-picker");
    expect(hints).toContain("Popover");
    expect(hints).toContain("Calendar");
  });

  it("forms hint includes Calendar reference when needsCalendar is also true", () => {
    const caps = inferCapabilities("Ett bokningsformulär med kalender för att välja datum");
    expect(caps.needsCalendar).toBe(true);
    expect(caps.needsForms).toBe(true);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("DatePicker pattern");
  });

  it("forms hint does NOT mention Calendar when needsCalendar is false", () => {
    const caps = inferCapabilities("A contact form with name and email");
    expect(caps.needsForms).toBe(true);
    expect(caps.needsCalendar).toBe(false);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).not.toContain("DatePicker");
  });

  it("command search hint includes cmdk and Dialog", () => {
    const caps = inferCapabilities("Add a cmd+k command palette");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("cmdk");
    expect(hints).toContain("Dialog");
  });

  it("theme toggle hint includes next-themes and useTheme", () => {
    const caps = inferCapabilities("Dark mode toggle on the site");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("next-themes");
    expect(hints).toContain("useTheme");
  });

  it("app shell hint includes dashboard component guidance", () => {
    const caps = inferCapabilities("Build a dashboard with sidebar");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("Chart");
    expect(hints).toContain("Table");
    expect(hints).toContain("Skeleton");
  });

  it("game hint ships the six-point playable contract", () => {
    const caps = inferCapabilities("Bygg ett litet spel med score och kontroller");
    const hints = buildCapabilityHints(caps)!;
    // The hint must surface the mental model from the interactive-game-loop
    // dossier verbatim so the codegen LLM sees identical phrasing in both
    // places. "state + loop + controls + collision + score + restart" is
    // the contract — downgrading any of these turns a game into a mockup.
    expect(hints).toContain("Game / playable mechanic requested");
    expect(hints).toContain("state");
    expect(hints).toContain("loop");
    expect(hints).toContain("controls");
    expect(hints).toContain("collision");
    expect(hints).toContain("restart");
    expect(hints).toContain("interactive-game-loop");
    expect(hints).toContain("\"use client\"");
  });

  it("ecommerce hint includes Drawer and Dialog guidance", () => {
    const caps = inferCapabilities("An ecommerce shop with product pages");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("Drawer");
    expect(hints).toContain("Dialog");
    expect(hints).toContain("Carousel");
  });

  it("3D hint warns against the reduced-motion trap and points at motion-safe:", () => {
    const caps = inferCapabilities("3d animation site with particle effects");
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain(`motion-reduce` + `:hidden`);
    expect(hints).toContain("motion-safe:");
    expect(hints).toContain("Reduced-motion trap");
  });

  it("3D hint upgrades to rapier when physics keywords are present", () => {
    const caps = inferCapabilities("en figur som åker omkring och studsar");
    expect(caps.needsPhysics).toBe(true);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("@react-three/rapier");
    expect(hints).toContain("Physics");
    expect(hints).toContain("RigidBody");
  });

  it("3D hint does not mention rapier for decorative hovering/floating motion", () => {
    const caps = inferCapabilities("lägg till en hovrande 3d-klocka som svävar i hero");
    expect(caps.needs3D).toBe(true);
    expect(caps.needsPhysics).toBe(false);
    const hints = buildCapabilityHints(caps)!;
    expect(hints).toContain("decorative 3D");
    expect(hints).not.toContain("@react-three/rapier");
    expect(hints).not.toContain("<Physics>");
    expect(hints).not.toContain("<RigidBody>");
  });
});
