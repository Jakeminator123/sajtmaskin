import { NextResponse } from "next/server";

/**
 * Full HTML proxy that serves the page as a real document (not srcDoc).
 * This allows Next.js apps to hydrate correctly since they have a real origin.
 *
 * Usage: GET /api/proxy-preview?url=https://demo-xxx.vusercontent.net
 *
 * The page is served with:
 * - All relative URLs rewritten to absolute
 * - CSP headers removed
 * - Inspector script injected after page load for hover/click detection
 */

const inspectorScript = `
<script>
// Wait for page load (including Next.js hydration) before attaching inspector
window.addEventListener("load", function () {
  if (window.__INSPECTOR_ATTACHED) return;
  window.__INSPECTOR_ATTACHED = true;

  const HOVER_CLASS = "__inspector_hover";
  const SELECT_CLASS = "__inspector_selected";
  let frozen = false;
  let lastHover = null;
  let lastSelected = null;

  // Add highlight styles
  const style = document.createElement("style");
  style.textContent = \`
    .__inspector_hover {
      outline: 2px solid #8b5cf6 !important;
      outline-offset: 2px !important;
      background-color: rgba(139, 92, 246, 0.08) !important;
    }
    .__inspector_selected {
      outline: 3px solid #22c55e !important;
      outline-offset: 2px !important;
      background-color: rgba(34, 197, 94, 0.1) !important;
    }
    * { cursor: crosshair !important; }
  \`;
  document.head.appendChild(style);

  const cssEscape = (value) =>
    value.replace(/([\\s!"#$%&'()*+,.\\/:;<=>?@\\[\\\\\\]^\\\`{|}~])/g, "\\\\$1");

  const buildSelector = (el) => {
    if (el.id) return "#" + cssEscape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== "html") {
      const tag = cur.tagName.toLowerCase();
      const classes = Array.from(cur.classList || []).filter(
        (c) => !c.startsWith("__inspector_")
      );
      const classPart = classes.length
        ? "." + classes.slice(0, 2).map(cssEscape).join(".")
        : "";
      let nth = 1;
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c) => c.tagName === cur.tagName
        );
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

  const post = (type, payload) => {
    window.parent?.postMessage(
      { __fromInspector: true, type, payload },
      "*"
    );
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
    if (lastSelected && lastSelected !== el) {
      lastSelected.classList.remove(SELECT_CLASS);
    }
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

  // Signal ready
  post("ready", { url: window.location.href });
});
</script>
`;

function rewriteUrls(html: string, baseOrigin: string, basePath: string): string {
  let out = html;

  // Rewrite root-relative URLs (href="/..." or src="/...")
  out = out.replace(/((?:href|src|action)=["'])\/(?!\/)/gi, `$1${baseOrigin}/`);

  // Rewrite bare-relative URLs (href="something.css" not starting with http/data/#)
  // Only match actual relative paths, not absolute URLs or data URIs
  out = out.replace(
    /((?:href|src)=["'])(?!https?:\/\/|data:|#|\/|mailto:|tel:)([^"']+["'])/gi,
    `$1${basePath}$2`,
  );

  // Also rewrite srcset attributes (used by next/image and responsive images)
  out = out.replace(
    /(srcset=["'])([^"']+)(["'])/gi,
    (_match, pre, value, post) => {
      const patched = value.replace(
        /(?:^|,\s*)\/(?!\/)/g,
        (m: string) => m.replace(/\//, `${baseOrigin}/`),
      );
      return `${pre}${patched}${post}`;
    },
  );

  return out;
}

function removeCsp(html: string): string {
  return html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");
}

/**
 * Replace third-party iframes (Google Maps, YouTube, etc.) with placeholders.
 * These embeds cannot work through the proxy and will crash the page.
 * Only applied in inspector mode where the proxy is used.
 */
function neutralizeEmbeds(html: string): string {
  return html.replace(
    /<iframe([^>]*)\ssrc=["'](https?:\/\/(?!(?:localhost|127\.0\.0\.1))[^"']+)["']([^>]*)><\/iframe>/gi,
    (_match, before, src, after) => {
      try {
        const widthMatch = (before + after).match(/width=["']?(\d+)/i);
        const heightMatch = (before + after).match(/height=["']?(\d+)/i);
        const w = widthMatch ? widthMatch[1] + "px" : "100%";
        const h = heightMatch ? heightMatch[1] + "px" : "200px";
        let domain: string;
        try {
          domain = new URL(src).hostname;
        } catch {
          domain = src.slice(0, 40);
        }
        return `<div style="width:${w};height:${h};display:flex;align-items:center;justify-content:center;background:#1a1a2e;border:1px dashed #444;border-radius:8px;color:#888;font-family:sans-serif;font-size:13px;">[Embed: ${domain}]</div>`;
      } catch {
        // If anything fails, return empty div instead of crashing the pipeline
        return `<div style="width:100%;height:200px;background:#1a1a2e;border:1px dashed #444;border-radius:8px;"></div>`;
      }
    },
  );
}

/**
 * Clean preview mode: inject a script that suppresses @property warnings in the console.
 * We can't remove @property rules as Tailwind v4 CSS depends on them.
 * This is optional and only applied when ?clean=1 is passed.
 */
function injectConsoleFilter(html: string): string {
  const consoleFilterScript = `
<script>
(function() {
  // Suppress @property warnings from Tailwind v4
  const originalWarn = console.warn;
  const originalError = console.error;

  const shouldSuppress = (args) => {
    const msg = args[0]?.toString?.() || '';
    return msg.includes('@property') && msg.includes('ignored');
  };

  console.warn = function(...args) {
    if (!shouldSuppress(args)) {
      originalWarn.apply(console, args);
    }
  };

  console.error = function(...args) {
    if (!shouldSuppress(args)) {
      originalError.apply(console, args);
    }
  };
})();
</script>
`;

  // Inject at the very beginning of <head> to catch all warnings
  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>${consoleFilterScript}`);
  }
  if (html.includes("<HEAD>")) {
    return html.replace("<HEAD>", `<HEAD>${consoleFilterScript}`);
  }
  // Fallback: inject after doctype or at start
  return consoleFilterScript + html;
}

/**
 * Inject a <base> tag so that ALL relative URLs (scripts, styles, images,
 * dynamic imports, CSS url(), etc.) resolve to the original v0 demo origin
 * instead of the proxy host. This is the key fix for "black page" in
 * inspector mode - without it, Next.js chunks and CSS fail to load.
 */
function injectBaseTag(html: string, baseHref: string): string {
  const baseTag = `<base href="${baseHref}">`;
  // Avoid duplicate <base> tags; replace any existing base href.
  if (/<base\b[^>]*href=/i.test(html)) {
    return html.replace(/<base\b[^>]*href=["'][^"']*["'][^>]*>/i, baseTag);
  }
  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>${baseTag}`);
  }
  if (html.includes("<HEAD>")) {
    return html.replace("<HEAD>", `<HEAD>${baseTag}`);
  }
  // Fallback: inject at the very start of the document
  return baseTag + html;
}

/**
 * Inject an early script that patches window.fetch and Next.js internals
 * so dynamically loaded resources (code-split chunks, API calls, etc.)
 * also resolve to the original v0 demo origin instead of the proxy host.
 *
 * <base> handles static HTML attributes (src, href) but JS runtime calls
 * like fetch("/_next/...") use window.location.origin by default.
 */
function buildOriginPatchScript(origin: string): string {
  return `
<script>
(function() {
  var O = ${JSON.stringify(origin)};
  var LOCAL = window.location.origin;
  // Patch fetch() so relative /_next/ and /api/ requests go to the real origin
  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === "string") {
      if (input.startsWith("/")) {
        input = O + input;
      } else if (input.startsWith(LOCAL + "/")) {
        input = O + input.slice(LOCAL.length);
      }
    } else if (input instanceof URL && input.origin === LOCAL) {
      input = O + input.pathname + input.search + input.hash;
    } else if (input instanceof Request && input.url.startsWith(LOCAL + "/")) {
      var path = input.url.slice(LOCAL.length);
      input = new Request(O + path, input);
    }
    return _fetch.call(this, input, init);
  };
  // Patch XMLHttpRequest for legacy requests
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === "string") {
      if (url.startsWith("/")) {
        url = O + url;
      } else if (url.startsWith(LOCAL + "/")) {
        url = O + url.slice(LOCAL.length);
      }
    }
    return _xhrOpen.apply(this, [method, url].concat(Array.prototype.slice.call(arguments, 2)));
  };
  // Patch __NEXT_DATA__ assetPrefix when Next.js initializes
  var _desc = Object.getOwnPropertyDescriptor(window, "__NEXT_DATA__");
  if (!_desc || _desc.configurable) {
    var _stored;
    Object.defineProperty(window, "__NEXT_DATA__", {
      configurable: true,
      enumerable: true,
      get: function() { return _stored; },
      set: function(v) {
        if (v && typeof v === "object" && !v.assetPrefix) {
          v.assetPrefix = O;
        }
        _stored = v;
        // After first set, switch to plain property for performance
        Object.defineProperty(window, "__NEXT_DATA__", {
          value: v, writable: true, configurable: true, enumerable: true,
        });
      },
    });
  }
})();
</script>`;
}

function injectScript(html: string): string {
  // Inject before </body> or at end
  if (html.includes("</body>")) {
    return html.replace("</body>", `${inspectorScript}</body>`);
  }
  return html + inspectorScript;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const cleanMode = searchParams.get("clean") === "1";

  if (!url) {
    return new NextResponse("<html><body><h1>Missing ?url= parameter</h1></body></html>", {
      status: 400,
      headers: { "content-type": "text/html" },
    });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new NextResponse("<html><body><h1>Invalid URL format</h1></body></html>", {
      status: 400,
      headers: { "content-type": "text/html" },
    });
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return new NextResponse("<html><body><h1>Only http/https URLs allowed</h1></body></html>", {
      status: 400,
      headers: { "content-type": "text/html" },
    });
  }

  try {
    const res = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      return new NextResponse(
        `<html><body><h1>Failed to fetch: HTTP ${res.status}</h1></body></html>`,
        { status: 502, headers: { "content-type": "text/html" } },
      );
    }

    let html = await res.text();

    // Calculate base path for relative URLs
    const basePath = target.origin + target.pathname.replace(/\/[^/]*$/, "/");

    // Process HTML
    html = removeCsp(html);
    html = neutralizeEmbeds(html);

    // 1. Inject <base> tag FIRST so all relative URLs resolve to the real origin.
    //    This is the primary fix for the "black page" problem: without it,
    //    Next.js chunks, CSS, and images loaded from /_next/ 404 on localhost.
    html = injectBaseTag(html, basePath);

    // 2. Inject origin-patch script early in <head> to intercept fetch() and
    //    XMLHttpRequest calls that use relative URLs at runtime.
    const originPatch = buildOriginPatchScript(target.origin);
    if (html.includes("</head>")) {
      // Put it just before </head> so it runs before any deferred scripts
      html = html.replace("</head>", `${originPatch}</head>`);
    } else if (html.includes("</HEAD>")) {
      html = html.replace("</HEAD>", `${originPatch}</HEAD>`);
    } else {
      html = originPatch + html;
    }

    // 3. Regex-rewrite remaining href/src attributes as a safety net
    //    (redundant with <base> for most cases, but catches edge cases)
    html = rewriteUrls(html, target.origin, basePath);

    // Optional clean mode: inject console filter to suppress @property warnings
    if (cleanMode) {
      html = injectConsoleFilter(html);
    }

    html = injectScript(html);

    // NOTE: X-Frame-Options is handled by proxy.ts which sets SAMEORIGIN
    // for /api/proxy-preview. We don't set it here to avoid the ALLOWALL
    // security vulnerability (clickjacking).
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    return new NextResponse(`<html><body><h1>Error: ${message}</h1></body></html>`, {
      status: 502,
      headers: { "content-type": "text/html" },
    });
  }
}
