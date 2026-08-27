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
  var IDENTITY = {
    versionId: qp("versionId"),
    previewSessionId: qp("previewSessionId"),
    lifecycleToken: qp("lifecycleToken")
  };
  var T = {
    setMode: "sajtmaskin:inspect:set-mode",
    hover: "sajtmaskin:inspect:hover",
    pick: "sajtmaskin:inspect:pick",
    ready: "sajtmaskin:inspect:ready",
    rect: "sajtmaskin:inspect:rect",
    region: "sajtmaskin:inspect:region",
    requestSections: "sajtmaskin:inspect:request-sections",
    sections: "sajtmaskin:inspect:sections",
    clientError: "sajtmaskin:inspect:client-error"
  };
  var MAX_SECTION_CANDIDATES = 40;
  var MAX_CLIENT_ERRORS = 5;
  var postedClientErrors = 0;
  var seenClientErrorMessages = Object.create(null);
  var enabled = false;
  var box = null;
  var selBox = null;
  var lastHover = null;
  var tracked = null;
  var marks = [];
  var dragStart = null;
  var dragging = false;
  var suppressClick = false;
  var rafPending = false;
  var DRAG_THRESHOLD = 6;
  var MAX_REGION_CANDIDATES = 400;
  var MAX_REGION_ELEMENTS = 30;
  var BOX_ID = "__sajtmaskin_inspect_box__";
  var SEL_ID = "__sajtmaskin_inspect_selection__";
  var MARK_ATTR = "data-sajtmaskin-inspect-mark";
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
  function ensureSelBox() {
    if (selBox) return selBox;
    selBox = document.createElement("div");
    selBox.id = SEL_ID;
    var s = selBox.style;
    s.position = "fixed"; s.zIndex = "2147483646"; s.pointerEvents = "none";
    s.border = "1px dashed #60a5fa"; s.background = "rgba(96,165,250,0.12)";
    s.display = "none";
    (document.body || document.documentElement).appendChild(selBox);
    return selBox;
  }
  function cleanMax(v, max) { return v ? String(v).replace(/\s+/g, " ").trim().slice(0, max) : null; }
  function clean(v) { return cleanMax(v, 160); }
  function ownTextOf(el) {
    var out = "";
    var kids = el && el.childNodes ? el.childNodes : [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].nodeType === 3) out += kids[i].nodeValue || "";
    }
    return cleanMax(out, 400);
  }
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
  function sourcePathOf(el) {
    var cur = el;
    while (cur && cur.nodeType === 1) {
      var v = cur.getAttribute ? cur.getAttribute("data-sajtmaskin-source") : null;
      if (v) return cleanMax(v, 240);
      cur = cur.parentElement;
    }
    return null;
  }
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
      // Bara elementets EGNA textnoder. innerText tar med barnens text,
      // så utan detta ser en wrapper ut som om den hade en egen textliteral.
      ownText: ownTextOf(el),
      childElementCount: el.children ? el.children.length : 0,
      src: clean(el.getAttribute && el.getAttribute("src")),
      alt: clean(el.getAttribute && el.getAttribute("alt")),
      ariaLabel: clean(el.getAttribute && el.getAttribute("aria-label")),
      role: clean(el.getAttribute && el.getAttribute("role")),
      href: el.tagName === "A" ? clean(el.href) : clean(el.getAttribute && el.getAttribute("href")),
      selector: selectorFor(el),
      nearestHeading: heading ? clean(heading.innerText || heading.textContent) : null,
      sourcePath: sourcePathOf(el),
      rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      viewport: { w: window.innerWidth, h: window.innerHeight }
    };
  }
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  }
  function schedule(fn) {
    if (window.requestAnimationFrame) window.requestAnimationFrame(fn);
    else setTimeout(fn, 16);
  }
  function post(type, payload) {
    try { window.parent.postMessage({ type: type, source: "sajtmaskin-inspect", identity: IDENTITY, payload: payload }, PARENT || "*"); } catch (e) {}
  }
  function truncateStr(v, max) {
    if (v == null) return "";
    var s = String(v);
    return s.length > max ? s.slice(0, max) : s;
  }
  function postClientError(kind, message, stack) {
    if (postedClientErrors >= MAX_CLIENT_ERRORS) return;
    var msg = truncateStr(message, 500).trim();
    if (!msg) return;
    if (seenClientErrorMessages[msg]) return;
    seenClientErrorMessages[msg] = 1;
    postedClientErrors += 1;
    var payload = {
      kind: kind,
      message: msg,
      href: location.pathname || "/"
    };
    if (stack) payload.stack = truncateStr(stack, 1000);
    post(T.clientError, payload);
  }
  function messageFromUnknown(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (v && typeof v.message === "string") return v.message;
    try { return String(v); } catch (e) { return ""; }
  }
  function stackFromUnknown(v) {
    if (v && typeof v.stack === "string") return v.stack;
    return "";
  }
  window.addEventListener("error", function (e) {
    if (!e) return;
    if (!e.message && !e.error) return;
    var msg = e.message || messageFromUnknown(e.error) || "Script error";
    var stack = stackFromUnknown(e.error) || "";
    postClientError("uncaught", msg, stack);
  });
  window.addEventListener("unhandledrejection", function (e) {
    if (!e) return;
    var reason = e.reason;
    postClientError("unhandledrejection", messageFromUnknown(reason) || "Unhandled rejection", stackFromUnknown(reason));
  });
  (function wrapConsoleError() {
    var orig = console.error;
    if (typeof orig !== "function") return;
    console.error = function () {
      try {
        var first = arguments.length > 0 ? arguments[0] : "";
        var text = typeof first === "string" ? first : messageFromUnknown(first);
        if (text && /hydrat|server[- ]rendered|not match|didn.t match|mismatch/i.test(text)) {
          var stack = "";
          for (var i = 0; i < arguments.length; i++) {
            var s = stackFromUnknown(arguments[i]);
            if (s) { stack = s; break; }
          }
          postClientError("hydration", text, stack);
        }
      } catch (ignore) {}
      return orig.apply(console, arguments);
    };
  })();
  function pickAt(x, y) {
    var stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
    for (var i = 0; i < stack.length; i++) {
      if (stack[i] && !isRoot(stack[i]) && stack[i].id !== BOX_ID) return stack[i];
    }
    return stack[0] || null;
  }
  function clearMarks() {
    for (var i = 0; i < marks.length; i++) {
      if (marks[i] && marks[i].parentNode) marks[i].parentNode.removeChild(marks[i]);
    }
    marks = [];
  }
  function markElements(els) {
    clearMarks();
    var host = document.body || document.documentElement;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      var m = document.createElement("div");
      m.setAttribute(MARK_ATTR, "1");
      var s = m.style;
      s.position = "fixed"; s.zIndex = "2147483645"; s.pointerEvents = "none";
      s.border = "2px solid #60a5fa"; s.background = "rgba(96,165,250,0.10)";
      s.left = r.left + "px"; s.top = r.top + "px";
      s.width = r.width + "px"; s.height = r.height + "px";
      host.appendChild(m);
      marks.push(m);
    }
  }
  function intersects(r, b) {
    return r.left < b.x + b.width && r.right > b.x && r.top < b.y + b.height && r.bottom > b.y;
  }
  /** Ytterst liggande element vars rect skär rektangeln (inga nästlade dubbletter). */
  function elementsInRect(b) {
    var all = document.body ? document.body.querySelectorAll("*") : [];
    var hits = [];
    for (var i = 0; i < all.length && hits.length < MAX_REGION_CANDIDATES; i++) {
      var el = all[i];
      if (el.id === BOX_ID || el.id === SEL_ID || el.getAttribute(MARK_ATTR)) continue;
      var t = el.tagName ? el.tagName.toLowerCase() : "";
      if (t === "script" || t === "style" || t === "link" || t === "meta" || t === "br") continue;
      var r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (!intersects(r, b)) continue;
      hits.push(el);
    }
    var outer = [];
    for (var j = 0; j < hits.length && outer.length < MAX_REGION_ELEMENTS; j++) {
      var nested = false;
      for (var k = 0; k < hits.length; k++) {
        if (k !== j && hits[k].contains(hits[j])) { nested = true; break; }
      }
      if (!nested) outer.push(hits[j]);
    }
    return outer;
  }
  function postTrackedRect() {
    if (!enabled || !tracked) return;
    if (!document.contains(tracked)) { tracked = null; return; }
    post(T.rect, { rect: rectOf(tracked), viewport: { w: window.innerWidth, h: window.innerHeight } });
  }
  /**
   * True när barnets vertikala utsträckning är nästan identisk med förälderns
   * (topp- och bottendiff < 1 % av viewporten). Speglar
   * isNearIdenticalParentSectionRect i section-analyzer.ts — håll i synk.
   * querySelectorAll är document-order (förälder före barn), så den yttersta
   * i en wrapper-stack räknas mot taket; nästlade dubbletter hoppas över.
   */
  function isNearIdenticalParent(el, r, vh) {
    var parent = el.parentElement;
    if (!parent || !parent.getBoundingClientRect) return false;
    var pr = parent.getBoundingClientRect();
    var threshold = (vh || 1) * 0.01;
    return Math.abs(r.top - pr.top) < threshold && Math.abs(r.bottom - pr.bottom) < threshold;
  }
  /**
   * Sektionskandidater för placement-overlay (drag-and-drop). Körs även när
   * inspect-läget är av — placering stänger inspect men behöver fortfarande
   * DOM-rektanglar i prod där Playwright/element-map saknas.
   */
  function collectSections() {
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    var nodes = document.querySelectorAll("section,main,header,footer,article,div");
    var out = [];
    for (var i = 0; i < nodes.length && out.length < MAX_SECTION_CANDIDATES; i++) {
      var el = nodes[i];
      if (!el || el.id === BOX_ID || el.id === SEL_ID || (el.getAttribute && el.getAttribute(MARK_ATTR))) continue;
      var r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      var vpW = (r.width / vw) * 100;
      var vpH = (r.height / vh) * 100;
      // Samma grova storleksgolv som extractSectionZones — håll payloaden liten.
      if (vpW < 45 || vpH < 8) continue;
      // Wrapper-stack: räkna bara yttersta mot MAX_SECTION_CANDIDATES.
      if (isNearIdenticalParent(el, r, vh)) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: (typeof el.className === "string" ? el.className.trim() : "") || null,
        text: cleanMax(el.innerText || el.textContent, 80),
        selector: selectorFor(el),
        rect: {
          x: Math.round(r.left),
          y: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height)
        },
        vpPercent: {
          x: Number(((r.left / vw) * 100).toFixed(2)),
          y: Number(((r.top / vh) * 100).toFixed(2)),
          w: Number(vpW.toFixed(2)),
          h: Number(vpH.toFixed(2))
        },
        viewport: { w: vw, h: vh }
      });
    }
    return out;
  }
  function postSections() {
    post(T.sections, {
      elements: collectSections(),
      viewport: { w: window.innerWidth, h: window.innerHeight }
    });
  }
  function onViewportChange() {
    if (!enabled || !tracked || rafPending) return;
    rafPending = true;
    schedule(function () { rafPending = false; postTrackedRect(); });
  }
  function onMove(e) {
    if (!enabled) return;
    if (dragStart) {
      if (!dragging &&
        Math.abs(e.clientX - dragStart.x) < DRAG_THRESHOLD &&
        Math.abs(e.clientY - dragStart.y) < DRAG_THRESHOLD) return;
      dragging = true;
      if (box) box.style.display = "none";
      var sb = ensureSelBox();
      sb.style.display = "block";
      sb.style.left = Math.min(dragStart.x, e.clientX) + "px";
      sb.style.top = Math.min(dragStart.y, e.clientY) + "px";
      sb.style.width = Math.abs(e.clientX - dragStart.x) + "px";
      sb.style.height = Math.abs(e.clientY - dragStart.y) + "px";
      return;
    }
    var el = pickAt(e.clientX, e.clientY); if (!el) return;
    var r = el.getBoundingClientRect(); var b = ensureBox();
    b.style.display = "block"; b.style.left = r.left + "px"; b.style.top = r.top + "px";
    b.style.width = r.width + "px"; b.style.height = r.height + "px";
    if (el !== lastHover) { lastHover = el; post(T.hover, describe(el)); }
  }
  function onDown(e) {
    if (!enabled || e.button !== 0) return;
    clearMarks();
    dragStart = { x: e.clientX, y: e.clientY };
    dragging = false;
  }
  function onUp(e) {
    if (!enabled) { dragStart = null; return; }
    if (dragging) {
      var b = {
        x: Math.min(dragStart.x, e.clientX),
        y: Math.min(dragStart.y, e.clientY),
        width: Math.abs(e.clientX - dragStart.x),
        height: Math.abs(e.clientY - dragStart.y)
      };
      var els = elementsInRect(b);
      var payload = [];
      for (var i = 0; i < els.length; i++) payload.push(describe(els[i]));
      markElements(els);
      tracked = null;
      // Rektangeln är i VIEWPORT-koordinater. Skicka med sidans scroll-läge:
      // den som sedan ska fotografera ytan laddar sidan på nytt vid scroll 0
      // och måste rulla tillbaka hit, annars beskär den fel del av dokumentet.
      post(T.region, {
        rect: b,
        elements: payload,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) }
      });
      // Mouseup följs av ett click-event — utan spärren skulle rektangeln
      // också plocka ett enskilt element och öppna elementmenyn.
      suppressClick = true;
    }
    dragStart = null; dragging = false;
    if (selBox) selBox.style.display = "none";
  }
  function onClick(e) {
    if (!enabled) return;
    e.preventDefault(); e.stopPropagation();
    if (suppressClick) { suppressClick = false; return; }
    var el = pickAt(e.clientX, e.clientY); if (!el) return;
    // Inspect-kluster B (#164/#197): skicka den faktiska KLICKPUNKTEN med i
    // payloaden. Parent räknade tidigare fram elementets mittpunkt från rect,
    // vilket pekar fel för stora element (hero/sektioner) — användaren
    // klickade t.ex. på en knapp i kanten men punkten hamnade i mitten.
    var d = describe(el);
    if (d) d.click = { x: Math.round(e.clientX), y: Math.round(e.clientY) };
    tracked = el;
    post(T.pick, d);
  }
  function setEnabled(v) {
    enabled = !!v;
    if (enabled) {
      ensureBox();
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mousedown", onDown, true);
      document.addEventListener("mouseup", onUp, true);
      document.addEventListener("click", onClick, true);
      window.addEventListener("scroll", onViewportChange, true);
      window.addEventListener("resize", onViewportChange, true);
      document.documentElement.style.cursor = "crosshair";
    } else {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("mouseup", onUp, true);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange, true);
      if (box) box.style.display = "none";
      if (selBox) selBox.style.display = "none";
      clearMarks();
      lastHover = null; tracked = null; dragStart = null; dragging = false; suppressClick = false;
      document.documentElement.style.cursor = "";
    }
  }
  function originOk(origin) { if (!PARENT) return true; return origin === PARENT; }
  window.addEventListener("message", function (e) {
    if (!e || !e.data || typeof e.data.type !== "string") return;
    if (!originOk(e.origin)) return;
    if (e.data.type === T.setMode) {
      setEnabled(!!e.data.enabled);
      return;
    }
    // Placement frågar efter zoner utan att slå på inspect-läget.
    if (e.data.type === T.requestSections) {
      postSections();
    }
  });
  post(T.ready, { href: location.href });
})();
`;
