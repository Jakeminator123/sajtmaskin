import { describe, expect, it } from "vitest";
import { INSPECT_BRIDGE_MESSAGE } from "./inspect-bridge-feature";
import { INSPECT_BRIDGE_SCRIPT } from "./inspect-bridge-script";

/**
 * Scriptet serveras rått som en sträng och kan inte typkontrolleras mot
 * `INSPECT_BRIDGE_MESSAGE`. Testerna nedan är därför kontraktet: driftar de isär
 * blir bron tyst i previewen utan att något annat går sönder.
 */
describe("INSPECT_BRIDGE_SCRIPT", () => {
  it("känner till exakt de meddelandetyper som parent-sidan lyssnar på", () => {
    for (const type of Object.values(INSPECT_BRIDGE_MESSAGE)) {
      expect(INSPECT_BRIDGE_SCRIPT).toContain(`"${type}"`);
    }
  });

  it("skickar upp fälten som klassificeringen behöver", () => {
    // Egen text (inte barnens) skiljer en literal från en wrapper; `src` och
    // antalet barn avgör bild- respektive textåtgärden.
    expect(INSPECT_BRIDGE_SCRIPT).toContain("ownText: ownTextOf(el)");
    expect(INSPECT_BRIDGE_SCRIPT).toContain("childElementCount:");
    expect(INSPECT_BRIDGE_SCRIPT).toContain('src: clean(el.getAttribute && el.getAttribute("src"))');
  });

  it("stämplar varje child-meddelande med previewens hostägda identitet", () => {
    expect(INSPECT_BRIDGE_SCRIPT).toContain("identity: IDENTITY");
    expect(INSPECT_BRIDGE_SCRIPT).toContain('versionId: qp("versionId")');
    expect(INSPECT_BRIDGE_SCRIPT).toContain('previewSessionId: qp("previewSessionId")');
    expect(INSPECT_BRIDGE_SCRIPT).toContain('lifecycleToken: qp("lifecycleToken")');
  });

  it("lyssnar på drag för rektangelmarkering och följer elementet vid scroll", () => {
    expect(INSPECT_BRIDGE_SCRIPT).toContain('document.addEventListener("mousedown", onDown, true)');
    expect(INSPECT_BRIDGE_SCRIPT).toContain('document.addEventListener("mouseup", onUp, true)');
    expect(INSPECT_BRIDGE_SCRIPT).toContain('window.addEventListener("scroll", onViewportChange, true)');
    expect(INSPECT_BRIDGE_SCRIPT).toContain("post(T.region,");
    expect(INSPECT_BRIDGE_SCRIPT).toContain("post(T.rect,");
  });

  it("städar upp allt drag-tillstånd när läget slås av", () => {
    expect(INSPECT_BRIDGE_SCRIPT).toContain(
      "lastHover = null; tracked = null; dragStart = null; dragging = false; suppressClick = false;",
    );
    expect(INSPECT_BRIDGE_SCRIPT).toContain('document.removeEventListener("mouseup", onUp, true)');
  });

  it("kan rapportera sektionsrektanglar utan att inspect-läget är på", () => {
    expect(INSPECT_BRIDGE_SCRIPT).toContain("function collectSections()");
    expect(INSPECT_BRIDGE_SCRIPT).toContain("post(T.sections,");
    expect(INSPECT_BRIDGE_SCRIPT).toContain("vpPercent:");
    expect(INSPECT_BRIDGE_SCRIPT).toContain("e.data.type === T.requestSections");
  });

  it("hoppar över parent-identiska wrappers så sektionstaket inte svälter footern", () => {
    // P2: MAX_SECTION_CANDIDATES räknas i DOM-ordning; nästlade fullbredds-divs
    // får inte äta alla platser innan <footer> nås.
    expect(INSPECT_BRIDGE_SCRIPT).toContain("function isNearIdenticalParent(el, r, vh)");
    expect(INSPECT_BRIDGE_SCRIPT).toContain("* 0.01");
    expect(INSPECT_BRIDGE_SCRIPT).toContain("if (isNearIdenticalParent(el, r, vh)) continue;");
  });

  it("fångar browser-runtime-fel och postar clientError oberoende av inspect-läge", () => {
    expect(INSPECT_BRIDGE_SCRIPT).toContain(`"${INSPECT_BRIDGE_MESSAGE.clientError}"`);
    expect(INSPECT_BRIDGE_SCRIPT).toContain('window.addEventListener("error"');
    expect(INSPECT_BRIDGE_SCRIPT).toContain('window.addEventListener("unhandledrejection"');
    expect(INSPECT_BRIDGE_SCRIPT).toContain("console.error");
    // Bugbot high: Reacts vanligaste mismatch-texter ("Text content does not
    // match server-rendered HTML") innehåller inte "hydrat" — filtret måste
    // täcka även dem.
    expect(INSPECT_BRIDGE_SCRIPT).toContain("/hydrat|server[- ]rendered|not match|didn.t match|mismatch/i");
    // Bugbot medium: händelser utan message/error (t.ex. resursfel) ska inte
    // postas som uncaught.
    expect(INSPECT_BRIDGE_SCRIPT).toContain("if (!e.message && !e.error) return;");
    expect(INSPECT_BRIDGE_SCRIPT).toContain('postClientError("uncaught"');
    expect(INSPECT_BRIDGE_SCRIPT).toContain('postClientError("unhandledrejection"');
    expect(INSPECT_BRIDGE_SCRIPT).toContain('postClientError("hydration"');
    expect(INSPECT_BRIDGE_SCRIPT).toContain("post(T.clientError,");
    // Tak + dedupe per sidladdning (inte gated på enabled/setMode).
    expect(INSPECT_BRIDGE_SCRIPT).toContain("MAX_CLIENT_ERRORS");
    expect(INSPECT_BRIDGE_SCRIPT).toContain("postedClientErrors");
  });
});
