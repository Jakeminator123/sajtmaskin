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
 * - Inspector script injected for hover/click detection
 */

const inspectorScript = `
<script>
(function () {
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
})();
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

  return out;
}

function removeCsp(html: string): string {
  return html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");
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
    html = rewriteUrls(html, target.origin, basePath);
    html = injectScript(html);

    // NOTE: X-Frame-Options is handled by middleware.ts which sets SAMEORIGIN
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
