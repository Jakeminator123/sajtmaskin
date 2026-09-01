import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { INSPECT_BRIDGE_MESSAGE } from "./inspect-bridge-feature";
import { INSPECT_BRIDGE_SCRIPT } from "./inspect-bridge-script";

type PostedMessage = { data: Record<string, unknown>; targetOrigin: string };

const PROD_PARENTS = [
  "https://sajtmaskin.vercel.app",
  "https://sajtmaskin.se",
  "https://www.sajtmaskin.se",
  "https://sajtmaskin.com",
  "https://www.sajtmaskin.com",
] as const;

function inspectScriptSrc(parents: readonly string[], identity?: {
  versionId?: string;
  previewSessionId?: string;
  lifecycleToken?: string;
}): string {
  const params = new URLSearchParams();
  for (const origin of parents) params.append("parent", origin);
  if (identity?.versionId) params.set("versionId", identity.versionId);
  if (identity?.previewSessionId) {
    params.set("previewSessionId", identity.previewSessionId);
    params.set("lifecycleToken", identity.lifecycleToken ?? "");
  }
  return `https://sajtmaskin.vercel.app/api/inspect-bridge?${params.toString()}`;
}

function loadInspectScript(opts: { scriptSrc: string; href?: string }) {
  const posts: PostedMessage[] = [];
  const parentWindow = {
    postMessage(data: Record<string, unknown>, targetOrigin: string) {
      posts.push({ data, targetOrigin });
    },
  };
  const dom = new JSDOM(
    `<!doctype html><html><body><h1>Hej</h1><section id="hero">Hero</section></body></html>`,
    {
      url: opts.href ?? "https://preview.example/chat1",
      runScripts: "outside-only",
    },
  );
  const { window } = dom;
  Object.defineProperty(window, "parent", { configurable: true, value: parentWindow });
  const script = window.document.createElement("script");
  script.src = opts.scriptSrc;
  window.document.body.appendChild(script);
  Object.defineProperty(window.document, "currentScript", {
    configurable: true,
    value: script,
  });
  window.eval(INSPECT_BRIDGE_SCRIPT);
  return {
    window,
    parentWindow,
    posts,
    dispatch(init: { source: object; origin: string; data: unknown }) {
      const event = new window.MessageEvent("message", {
        origin: init.origin,
        data: init.data,
      });
      Object.defineProperty(event, "source", { configurable: true, value: init.source });
      window.dispatchEvent(event);
    },
  };
}

function readyPosts(posts: PostedMessage[]) {
  return posts.filter((post) => post.data.type === INSPECT_BRIDGE_MESSAGE.ready);
}

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

describe("INSPECT_BRIDGE_SCRIPT parent allowlist", () => {
  it("postar ready till varje exakt tillåten parent, inklusive .se och .com", () => {
    const identity = {
      versionId: "ver_1",
      previewSessionId: "ps_1",
      lifecycleToken: "life_1",
    };
    const { posts } = loadInspectScript({
      scriptSrc: inspectScriptSrc(PROD_PARENTS, identity),
    });

    const ready = readyPosts(posts);
    expect(ready.map((post) => post.targetOrigin)).toEqual([...PROD_PARENTS]);
    expect(ready.every((post) => post.targetOrigin !== "*")).toBe(true);
    expect(ready[0]?.data.source).toBe("sajtmaskin-inspect");
    expect(ready[0]?.data.identity).toEqual(identity);
    expect(ready.some((post) => post.targetOrigin === "https://sajtmaskin.se")).toBe(true);
    expect(ready.some((post) => post.targetOrigin === "https://sajtmaskin.vercel.app")).toBe(true);
    expect(ready.some((post) => post.targetOrigin === "https://sajtmaskin.com")).toBe(true);
  });

  it("avvisar set-mode från origin utanför allowlistan", () => {
    const harness = loadInspectScript({ scriptSrc: inspectScriptSrc(PROD_PARENTS) });
    harness.dispatch({
      source: harness.parentWindow,
      origin: "https://evil.example",
      data: { type: INSPECT_BRIDGE_MESSAGE.setMode, enabled: true },
    });
    expect(harness.window.document.documentElement.style.cursor).not.toBe("crosshair");
  });

  it("avvisar set-mode med tillåten origin men fel event.source", () => {
    const harness = loadInspectScript({ scriptSrc: inspectScriptSrc(PROD_PARENTS) });
    harness.dispatch({
      source: harness.window,
      origin: "https://sajtmaskin.se",
      data: { type: INSPECT_BRIDGE_MESSAGE.setMode, enabled: true },
    });
    expect(harness.window.document.documentElement.style.cursor).not.toBe("crosshair");
  });

  it("accepterar set-mode från parent-fönstret och en tillåten origin", () => {
    const harness = loadInspectScript({ scriptSrc: inspectScriptSrc(PROD_PARENTS) });
    harness.dispatch({
      source: harness.parentWindow,
      origin: "https://sajtmaskin.se",
      data: { type: INSPECT_BRIDGE_MESSAGE.setMode, enabled: true },
    });
    expect(harness.window.document.documentElement.style.cursor).toBe("crosshair");
  });

  it("accepterar request-sections från rätt parent och postar till hela allowlistan", () => {
    const harness = loadInspectScript({ scriptSrc: inspectScriptSrc(PROD_PARENTS) });
    const before = harness.posts.length;
    harness.dispatch({
      source: harness.parentWindow,
      origin: "https://sajtmaskin.com",
      data: { type: INSPECT_BRIDGE_MESSAGE.requestSections },
    });
    const sectionPosts = harness.posts
      .slice(before)
      .filter((post) => post.data.type === INSPECT_BRIDGE_MESSAGE.sections);
    expect(sectionPosts.map((post) => post.targetOrigin)).toEqual([...PROD_PARENTS]);
    expect(sectionPosts.every((post) => post.data.source === "sajtmaskin-inspect")).toBe(true);
  });

  it("använder location.origin för same-origin-shimmen utan wildcard", () => {
    const harness = loadInspectScript({
      href: "https://sajtmaskin.se/api/preview-render?chatId=c1",
      scriptSrc: "/api/inspect-bridge",
    });
    const ready = readyPosts(harness.posts);
    expect(ready).toHaveLength(1);
    expect(ready[0]?.targetOrigin).toBe("https://sajtmaskin.se");
    expect(ready.every((post) => post.targetOrigin !== "*")).toBe(true);

    harness.dispatch({
      source: harness.window,
      origin: "https://sajtmaskin.se",
      data: { type: INSPECT_BRIDGE_MESSAGE.setMode, enabled: true },
    });
    expect(harness.window.document.documentElement.style.cursor).not.toBe("crosshair");

    harness.dispatch({
      source: harness.parentWindow,
      origin: "https://sajtmaskin.se",
      data: { type: INSPECT_BRIDGE_MESSAGE.setMode, enabled: true },
    });
    expect(harness.window.document.documentElement.style.cursor).toBe("crosshair");
  });

  it("stämplar version/session/lifecycle och postar inte till ogiltig parent-query", () => {
    const { posts } = loadInspectScript({
      scriptSrc: inspectScriptSrc(["*", "https://evil.example/path", "https://sajtmaskin.se"], {
        versionId: "ver_locked",
        previewSessionId: "ps_locked",
        lifecycleToken: "life_locked",
      }),
    });
    const ready = readyPosts(posts);
    expect(ready.map((post) => post.targetOrigin)).toEqual(["https://sajtmaskin.se"]);
    expect(ready[0]?.data.identity).toEqual({
      versionId: "ver_locked",
      previewSessionId: "ps_locked",
      lifecycleToken: "life_locked",
    });
    expect(posts.some((post) => post.targetOrigin === "*")).toBe(false);
  });
});
