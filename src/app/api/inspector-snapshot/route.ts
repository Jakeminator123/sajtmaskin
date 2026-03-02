import { NextResponse } from "next/server";
import { chromium } from "playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAVIGATION_TIMEOUT_MS = 25_000;
const NETWORK_IDLE_TIMEOUT_MS = 8_000;

const inspectorScript = `
<script>
window.addEventListener("load", function () {
  if (window.__INSPECTOR_ATTACHED) return;
  window.__INSPECTOR_ATTACHED = true;

  const HOVER_CLASS = "__inspector_hover";
  const SELECT_CLASS = "__inspector_selected";
  let frozen = false;
  let lastHover = null;
  let lastSelected = null;

  const style = document.createElement("style");
  style.textContent =
    ".__inspector_hover{outline:2px solid #8b5cf6 !important;outline-offset:2px !important;background-color:rgba(139, 92, 246, 0.08) !important;}" +
    ".__inspector_selected{outline:3px solid #22c55e !important;outline-offset:2px !important;background-color:rgba(34, 197, 94, 0.1) !important;}" +
    "*{cursor:crosshair !important;}";
  document.head.appendChild(style);

  const cssEscape = (value) => {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
  };

  const buildSelector = (el) => {
    if (el.id) return "#" + cssEscape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== "html") {
      const tag = cur.tagName.toLowerCase();
      const classes = Array.from(cur.classList || []).filter((c) => !c.startsWith("__inspector_"));
      const classPart = classes.length ? "." + classes.slice(0, 2).map(cssEscape).join(".") : "";
      let nth = 1;
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
        nth = siblings.indexOf(cur) + 1;
      }
      parts.unshift(tag + classPart + ":nth-of-type(" + nth + ")");
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  };

  const pickInfo = (el) => {
    const text = (el.innerText || el.textContent || "").trim().replace(/\\s+/g, " ");
    const classes = (el.className || "")
      .toString()
      .split(" ")
      .filter((c) => c && !c.startsWith("__inspector_"))
      .join(" ");
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: classes || null,
      text: text ? text.slice(0, 120) : null,
      selector: buildSelector(el),
    };
  };

  var _parentOrigin = (function() {
    try { return window.parent.location.origin; } catch(e) { return "*"; }
  })();
  const post = (type, payload) => {
    window.parent?.postMessage({ __fromInspector: true, type, payload }, _parentOrigin);
  };

  const clearHover = () => {
    if (lastHover) lastHover.classList.remove(HOVER_CLASS);
    lastHover = null;
  };

  const applyHover = (el) => {
    if (lastHover && lastHover !== el) lastHover.classList.remove(HOVER_CLASS);
    lastHover = el;
    el.classList.add(HOVER_CLASS);
  };

  const clearSelected = () => {
    if (lastSelected) lastSelected.classList.remove(SELECT_CLASS);
    lastSelected = null;
  };

  const applySelected = (el) => {
    if (lastSelected && lastSelected !== el) lastSelected.classList.remove(SELECT_CLASS);
    lastSelected = el;
    el.classList.add(SELECT_CLASS);
  };

  document.addEventListener(
    "mousemove",
    (e) => {
      if (frozen) return;
      const target = e.target;
      if (!target || target === document.documentElement || target === document.body) return;
      applyHover(target);
      post("hover", pickInfo(target));
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!target || target === document.documentElement || target === document.body) return;
      e.preventDefault();
      e.stopPropagation();
      applySelected(target);
      frozen = true;
      post("select", pickInfo(target));
    },
    true
  );

  window.addEventListener("message", (event) => {
    if (_parentOrigin !== "*" && event.origin !== _parentOrigin) return;
    const data = event.data;
    if (!data || data.__fromParentInspector !== true) return;
    if (data.type === "set-freeze") {
      frozen = !!data.value;
      if (!frozen) clearHover();
    }
    if (data.type === "clear-selection") {
      frozen = false;
      clearSelected();
      clearHover();
    }
  });

  post("ready", { url: window.location.href });
});
</script>
`;

function removeCspMeta(html: string): string {
  return html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");
}

function stripScriptsAndInlineHandlers(html: string): string {
  let out = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  out = out.replace(/\son\w+="[^"\n\r]*"/gi, "");
  out = out.replace(/\son\w+='[^'\n\r]*'/gi, "");
  return out;
}

function injectBaseHref(html: string, baseHref: string): string {
  const baseTag = `<base href="${baseHref}" target="_blank">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`);
  }
  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

function rewriteRootRelativeUrls(html: string, origin: string): string {
  return html.replace(
    /\b(href|src)=("|')\/(?!\/)([^"']*)\2/gi,
    (_match, attr, quote, path) => `${attr}=${quote}${origin}/${path}${quote}`,
  );
}

function rewriteRelativeUrls(html: string, baseHref: string): string {
  return html.replace(
    /\b(href|src)=("|')(?![a-z]+:|\/\/|\/|#)([^"']+)\2/gi,
    (_match, attr, quote, path) => `${attr}=${quote}${baseHref}${path}${quote}`,
  );
}

function injectScript(html: string): string {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${inspectorScript}</body>`);
  }
  return `${html}${inspectorScript}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing ?url= parameter" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return NextResponse.json({ error: "Only http/https URLs allowed" }, { status: 400 });
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    });

    await page.goto(target.toString(), {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined);
    await page.waitForTimeout(1200);

    let html = await page.content();
    html = removeCspMeta(html);
    html = stripScriptsAndInlineHandlers(html);

    const baseHref = target.origin + target.pathname.replace(/\/[^/]*$/, "/");
    html = rewriteRootRelativeUrls(html, target.origin);
    html = rewriteRelativeUrls(html, baseHref);
    html = injectBaseHref(html, baseHref);
    html = injectScript(html);

    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-frame-options": "SAMEORIGIN",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown snapshot error";
    return NextResponse.json(
      {
        error:
          "Snapshot-inspektion misslyckades. Kontrollera Playwright-installation och att URL:en är publik.",
        details: message,
      },
      { status: 502 },
    );
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
