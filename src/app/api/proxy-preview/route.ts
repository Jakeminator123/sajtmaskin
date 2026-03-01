import { NextResponse } from "next/server";

/**
 * Full HTML proxy for inspector mode. Fetches a v0 demo page, processes
 * the HTML so all sub-resources load through /api/proxy-asset (same-origin),
 * and injects the inspector script for hover/click element detection.
 *
 * Usage: GET /api/proxy-preview?url=https://demo-xxx.vusercontent.net
 *
 * IMPORTANT: The target demo page must be publicly accessible. v0 pages
 * set to "private" will return empty content because this server-side
 * fetch cannot forward the user's v0 session cookies.
 *
 * Pipeline:
 * 1. Fetch HTML from vusercontent.net (server-side)
 * 2. Strip CSP, blocking="render", <base> tags, v0-loading class, embeds
 * 3. Inject JS patches (fetch/XHR/createElement -> /api/proxy-asset)
 * 4. Rewrite static src/href/srcset to /api/proxy-asset URLs
 * 5. Rewrite CSS url() references to proxy URLs
 * 6. (Optional) Console filter for @property warnings (?clean=1)
 * 7. Inject inspector script (hover/click detection via postMessage)
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildProxyErrorHtml(message: string): string {
  const safeMessage = escapeHtml(message);
  return `<!doctype html>
<html data-proxy-preview-error="1" lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Preview unavailable</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background: #0b0b0f;
        color: #e5e7eb;
        display: grid;
        place-items: center;
        min-height: 100vh;
        padding: 24px;
      }
      .card {
        max-width: 720px;
        width: 100%;
        border: 1px solid #2a2a35;
        border-radius: 12px;
        background: #12121a;
        padding: 18px 20px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 18px;
      }
      p {
        margin: 0;
        color: #a1a1aa;
        font-size: 14px;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Preview unavailable</h1>
      <p>${safeMessage}</p>
    </div>
  </body>
</html>`;
}

function rewriteUrls(html: string, baseOrigin: string, basePath: string): string {
  const PROXY = "/api/proxy-asset?url=";
  let out = html;

  out = out.replace(
    /((?:href|src|action)=["'])(\/(?!\/)[^"']*)/gi,
    (_match: string, pre: string, path: string) =>
      `${pre}${PROXY}${encodeURIComponent(baseOrigin + path)}`,
  );

  out = out.replace(
    /((?:href|src)=["'])(?!https?:\/\/|data:|#|\/|mailto:|tel:|javascript:)([^"']+)/gi,
    (_match: string, pre: string, relPath: string) =>
      `${pre}${PROXY}${encodeURIComponent(basePath + relPath)}`,
  );

  out = out.replace(
    /(srcset=["'])([^"']+)(["'])/gi,
    (_match, pre, value, post) => {
      const patched = (value as string).replace(
        /(^|,\s*)(\/(?!\/)[^\s,]+)/g,
        (_m: string, sep: string, path: string) =>
          `${sep}${PROXY}${encodeURIComponent(baseOrigin + path)}`,
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
 * Inject an early script that patches window.fetch, XHR and __NEXT_DATA__
 * so dynamically loaded resources are routed through /api/proxy-asset
 * instead of hitting the original origin (CORS) or localhost (404).
 */
function buildOriginPatchScript(origin: string): string {
  return `
<script>
(function() {
  var O = ${JSON.stringify(origin)};
  var LOCAL = window.location.origin;
  var P = "/api/proxy-asset?url=";
  function px(u) { return P + encodeURIComponent(u); }
  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    if (typeof input === "string") {
      if (input.startsWith("/") && !input.startsWith("//") && !input.startsWith(P)) {
        input = px(O + input);
      } else if (input.startsWith(LOCAL + "/")) {
        input = px(O + input.slice(LOCAL.length));
      } else if (input.startsWith(O)) {
        input = px(input);
      }
    } else if (input instanceof URL) {
      if (input.origin === LOCAL) {
        input = px(O + input.pathname + input.search + input.hash);
      } else if (input.href.startsWith(O)) {
        input = px(input.href);
      }
    } else if (input instanceof Request) {
      if (input.url.startsWith(LOCAL + "/")) {
        input = new Request(px(O + input.url.slice(LOCAL.length)), input);
      } else if (input.url.startsWith(O)) {
        input = new Request(px(input.url), input);
      }
    }
    return _fetch.call(this, input, init);
  };
  var _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (typeof url === "string") {
      if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith(P)) {
        url = px(O + url);
      } else if (url.startsWith(LOCAL + "/")) {
        url = px(O + url.slice(LOCAL.length));
      } else if (url.startsWith(O)) {
        url = px(url);
      }
    }
    return _xhrOpen.apply(this, [method, url].concat(Array.prototype.slice.call(arguments, 2)));
  };
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
        Object.defineProperty(window, "__NEXT_DATA__", {
          value: v, writable: true, configurable: true, enumerable: true,
        });
      },
    });
  }
})();
</script>`;
}

/**
 * Patch document.createElement so dynamically created <script> and <link>
 * elements have their src/href routed through /api/proxy-asset. Next.js
 * App Router creates these at runtime for code-split chunks. Without this
 * patch, they would 404 on localhost or hit CORS on vusercontent.
 *
 * Disable with ?nodynamic=1 for A/B testing.
 */
function buildDynamicScriptPatch(origin: string): string {
  return `
<script>
(function() {
  var O = ${JSON.stringify(origin)};
  var LOCAL = window.location.origin;
  var P = "/api/proxy-asset?url=";

  function rewriteUrl(v) {
    if (typeof v !== "string") return v;
    if (v.startsWith(P)) return v;
    if (v.startsWith("/") && !v.startsWith("//")) return P + encodeURIComponent(O + v);
    if (v.startsWith(LOCAL + "/")) return P + encodeURIComponent(O + v.slice(LOCAL.length));
    if (v.startsWith(O)) return P + encodeURIComponent(v);
    return v;
  }

  var _create = document.createElement.bind(document);
  var scriptSrcDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, "src");
  var linkHrefDesc = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, "href");

  document.createElement = function(tag, opts) {
    var el = _create(tag, opts);
    var t = (typeof tag === "string" ? tag : "").toLowerCase();

    if (t === "script" && scriptSrcDesc) {
      Object.defineProperty(el, "src", {
        configurable: true,
        enumerable: true,
        get: function() { return scriptSrcDesc.get.call(this); },
        set: function(v) { scriptSrcDesc.set.call(this, rewriteUrl(v)); }
      });
    }

    if (t === "link" && linkHrefDesc) {
      Object.defineProperty(el, "href", {
        configurable: true,
        enumerable: true,
        get: function() { return linkHrefDesc.get.call(this); },
        set: function(v) { linkHrefDesc.set.call(this, rewriteUrl(v)); }
      });
    }

    return el;
  };
})();
</script>`;
}

/**
 * Strip `allow-same-origin` from every sandbox attribute in the proxied HTML.
 * Nested iframes in v0-generated pages sometimes have this combination, which
 * triggers a browser security warning. Since the page is already served through
 * the proxy (different origin from the real vusercontent.net), same-origin
 * access inside nested iframes is meaningless anyway.
 */
function removeAllowSameOriginFromSandboxes(html: string): string {
  return html.replace(
    /(sandbox=["'])([^"']*)(["'])/gi,
    (_match, pre, value, post) => {
      const cleaned = (value as string)
        .split(/\s+/)
        .filter((t) => t !== "allow-same-origin")
        .join(" ")
        .trim();
      return `${pre}${cleaned}${post}`;
    },
  );
}

function removeBaseTags(html: string): string {
  return html.replace(/<base\b[^>]*>/gi, "");
}

function removeRenderBlocking(html: string): string {
  html = html.replace(/<link[^>]*\brel=["']expect["'][^>]*>/gi, "");
  html = html.replace(/\s*blocking=["'][^"']*["']/gi, "");
  html = html.replace(
    /(<body\b[^>]*\bclass=["'])([^"']*)["']/gi,
    (_m: string, pre: string, cls: string) => {
      const cleaned = cls.replace(/\bv0-loading\b/g, "").trim();
      return cleaned ? `${pre}${cleaned}"` : pre.replace(/\s*class=$/, "") + '"';
    },
  );
  return html;
}

function rewriteCssUrls(html: string, origin: string): string {
  const PROXY = "/api/proxy-asset?url=";
  return html.replace(
    /url\(\s*(['"]?)(\/(?!\/|api\/proxy-asset)[^)'"]*)\1\s*\)/gi,
    (_m: string, quote: string, path: string) =>
      `url(${quote}${PROXY}${encodeURIComponent(origin + path)}${quote})`,
  );
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
  const noDynamicPatch = searchParams.get("nodynamic") === "1";
  const stripNestedSandboxSameOrigin = searchParams.get("stripsandbox") === "1";

  if (!url) {
    return new NextResponse(buildProxyErrorHtml("Missing ?url= parameter"), {
      status: 400,
      headers: { "content-type": "text/html" },
    });
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new NextResponse(buildProxyErrorHtml("Invalid URL format"), {
      status: 400,
      headers: { "content-type": "text/html" },
    });
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    return new NextResponse(buildProxyErrorHtml("Only http/https URLs allowed"), {
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
      return new NextResponse(buildProxyErrorHtml(`Failed to fetch: HTTP ${res.status}`), {
        status: 502,
        headers: { "content-type": "text/html" },
      });
    }

    let html = await res.text();

    // Calculate base path for relative URLs
    const basePath = target.origin + target.pathname.replace(/\/[^/]*$/, "/");

    // Process HTML
    html = removeCsp(html);
    if (stripNestedSandboxSameOrigin) {
      html = removeAllowSameOriginFromSandboxes(html);
    }
    html = neutralizeEmbeds(html);
    html = removeBaseTags(html);
    html = removeRenderBlocking(html);

    // 1. Inject runtime patches early in <head>. These intercept fetch(),
    //    XHR, and dynamically created script/link elements so all resource
    //    requests are routed through /api/proxy-asset (same-origin).
    const originPatch = buildOriginPatchScript(target.origin);
    if (html.includes("</head>")) {
      html = html.replace("</head>", `${originPatch}</head>`);
    } else if (html.includes("</HEAD>")) {
      html = html.replace("</HEAD>", `${originPatch}</HEAD>`);
    } else {
      html = originPatch + html;
    }

    if (!noDynamicPatch) {
      const dynamicPatch = buildDynamicScriptPatch(target.origin);
      if (html.includes("</head>")) {
        html = html.replace("</head>", `${dynamicPatch}</head>`);
      } else if (html.includes("</HEAD>")) {
        html = html.replace("</HEAD>", `${dynamicPatch}</HEAD>`);
      } else {
        html = dynamicPatch + html;
      }
    }

    // 2. Rewrite static HTML attributes (src, href, srcset) to proxy URLs
    html = rewriteUrls(html, target.origin, basePath);

    // 3. Rewrite CSS url() references in inline <style> and style attributes
    html = rewriteCssUrls(html, target.origin);

    // Optional clean mode: inject console filter to suppress @property warnings
    if (cleanMode) {
      html = injectConsoleFilter(html);
    }

    html = injectScript(html);

    // X-Frame-Options SAMEORIGIN allows embedding in our own builder iframe.
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
        "x-frame-options": "SAMEORIGIN",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    return new NextResponse(buildProxyErrorHtml(`Error: ${message}`), {
      status: 502,
      headers: { "content-type": "text/html" },
    });
  }
}
