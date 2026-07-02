/**
 * Injicerat inspector-bridge-script (kör INNE i preview-sidan).
 *
 * Single source of truth — serveras av `/api/inspect-bridge` och laddas som
 * `<script src>` av (a) preview-host-proxyn (tier-2, cross-origin) och
 * (b) own-engine-shimmen (`build-preview-document.ts`, same-origin).
 *
 * Eftersom scriptet kör i preview-sidans EGEN origin kan det läsa DOMen direkt
 * (`elementFromPoint`) — ingen Playwright/worker behövs. Det postar element-info
 * upp till buildern via `postMessage`. Inert tills parent skickar `set-mode`.
 *
 * Plain ES5/ES2017 (serveras rått, ingen transpilering). Håll i synk med
 * `INSPECT_BRIDGE_MESSAGE` i `inspect-bridge-feature.ts`.
 */
export const INSPECT_BRIDGE_SCRIPT = String.raw`(function () {
  "use strict";
  var me = document.currentScript;
  function qp(name) {
    try { return new URL(me && me.src ? me.src : location.href).searchParams.get(name); } catch (e) { return null; }
  }
  var PARENT = qp("parent") || "";
  var T = {
    setMode: "sajtmaskin:inspect:set-mode",
    hover: "sajtmaskin:inspect:hover",
    pick: "sajtmaskin:inspect:pick",
    ready: "sajtmaskin:inspect:ready"
  };
  var enabled = false;
  var box = null;
  var lastHover = null;
  var BOX_ID = "__sajtmaskin_inspect_box__";
  function ensureBox() {
    if (box) return box;
    box = document.createElement("div");
    box.id = BOX_ID;
    var s = box.style;
    s.position = "fixed"; s.zIndex = "2147483647"; s.pointerEvents = "none";
    s.border = "2px solid #34d399"; s.background = "rgba(16,185,129,0.12)";
    s.borderRadius = "2px"; s.transition = "all 40ms linear"; s.display = "none";
    s.boxShadow = "0 0 0 1px rgba(0,0,0,0.25)";
    (document.body || document.documentElement).appendChild(box);
    return box;
  }
  function clean(v) { return v ? String(v).replace(/\s+/g, " ").trim().slice(0, 160) : null; }
  function cssEscape(v) {
    try { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
    catch (e) { return String(v); }
  }
  function selectorFor(el) {
    var parts = []; var cur = el;
    while (cur && cur.nodeType === 1) {
      var tag = cur.tagName.toLowerCase(); if (tag === "html") break;
      var id = cur.getAttribute("id"); if (id) { parts.unshift("#" + cssEscape(id)); break; }
      var cls = (cur.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2)
        .map(function (c) { return "." + cssEscape(c); }).join("");
      var nth = 1, p = cur.parentElement;
      if (p) {
        var sib = Array.prototype.filter.call(p.children, function (c) { return c.tagName === cur.tagName; });
        nth = Math.max(1, sib.indexOf(cur) + 1);
      }
      parts.unshift(tag + cls + ":nth-of-type(" + nth + ")"); cur = p;
    }
    return parts.join(" > ") || null;
  }
  function isRoot(el) { var t = el && el.tagName ? el.tagName.toLowerCase() : ""; return t === "html" || t === "body"; }
  function describe(el) {
    if (!el) return null;
    var heading = el.closest ? el.closest("h1,h2,h3,h4,h5,h6") : null;
    if (!heading && el.closest) {
      var sec = el.closest("section,article,main,aside,nav,header,footer") || el.parentElement;
      heading = sec && sec.querySelector ? sec.querySelector("h1,h2,h3,h4,h5,h6") : null;
    }
    var r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: (typeof el.className === "string" ? el.className.trim() : "") || null,
      text: clean(el.innerText || el.textContent),
      ariaLabel: clean(el.getAttribute && el.getAttribute("aria-label")),
      role: clean(el.getAttribute && el.getAttribute("role")),
      href: el.tagName === "A" ? clean(el.href) : clean(el.getAttribute && el.getAttribute("href")),
      selector: selectorFor(el),
      nearestHeading: heading ? clean(heading.innerText || heading.textContent) : null,
      rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      viewport: { w: window.innerWidth, h: window.innerHeight }
    };
  }
  function post(type, payload) {
    try { window.parent.postMessage({ type: type, source: "sajtmaskin-inspect", payload: payload }, PARENT || "*"); } catch (e) {}
  }
  function pickAt(x, y) {
    var stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
    for (var i = 0; i < stack.length; i++) {
      if (stack[i] && !isRoot(stack[i]) && stack[i].id !== BOX_ID) return stack[i];
    }
    return stack[0] || null;
  }
  function onMove(e) {
    if (!enabled) return;
    var el = pickAt(e.clientX, e.clientY); if (!el) return;
    var r = el.getBoundingClientRect(); var b = ensureBox();
    b.style.display = "block"; b.style.left = r.left + "px"; b.style.top = r.top + "px";
    b.style.width = r.width + "px"; b.style.height = r.height + "px";
    if (el !== lastHover) { lastHover = el; post(T.hover, describe(el)); }
  }
  function onClick(e) {
    if (!enabled) return;
    e.preventDefault(); e.stopPropagation();
    var el = pickAt(e.clientX, e.clientY); if (!el) return;
    // Inspect-kluster B (#164/#197): skicka den faktiska KLICKPUNKTEN med i
    // payloaden. Parent räknade tidigare fram elementets mittpunkt från rect,
    // vilket pekar fel för stora element (hero/sektioner) — användaren
    // klickade t.ex. på en knapp i kanten men punkten hamnade i mitten.
    var d = describe(el);
    if (d) d.click = { x: Math.round(e.clientX), y: Math.round(e.clientY) };
    post(T.pick, d);
  }
  function setEnabled(v) {
    enabled = !!v;
    if (enabled) {
      ensureBox();
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onClick, true);
      document.documentElement.style.cursor = "crosshair";
    } else {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      if (box) box.style.display = "none";
      lastHover = null;
      document.documentElement.style.cursor = "";
    }
  }
  function originOk(origin) { if (!PARENT) return true; return origin === PARENT; }
  window.addEventListener("message", function (e) {
    if (!e || !e.data || e.data.type !== T.setMode) return;
    if (!originOk(e.origin)) return;
    setEnabled(!!e.data.enabled);
  });
  post(T.ready, { href: location.href });
})();
`;
