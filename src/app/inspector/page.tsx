"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type PickInfo = {
  tag: string;
  id: string | null;
  className: string | null;
  text: string | null;
  selector: string;
};

// -----------------------------------------------------------------------------
// Helpers for building CSS selectors
// -----------------------------------------------------------------------------

function cssEscape(value: string): string {
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}

function buildSelector(el: Element): string {
  const id = (el as HTMLElement).id;
  if (id) return `#${cssEscape(id)}`;

  const parts: string[] = [];
  let cur: Element | null = el;

  while (cur && cur.nodeType === 1 && cur.tagName.toLowerCase() !== "html") {
    const tag = cur.tagName.toLowerCase();

    const classList = Array.from((cur as HTMLElement).classList || []);
    const classPart = classList.length ? "." + classList.slice(0, 2).map(cssEscape).join(".") : "";

    let nth = 1;
    const parent = cur.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      nth = siblings.indexOf(cur) + 1;
    }

    parts.unshift(`${tag}${classPart}:nth-of-type(${nth})`);
    cur = cur.parentElement;
  }

  return parts.join(" > ");
}

function pickInfoFrom(el: Element): PickInfo {
  const h = el as HTMLElement;
  const text = (h.innerText || h.textContent || "").trim().replace(/\s+/g, " ");
  return {
    tag: el.tagName.toLowerCase(),
    id: h.id ? h.id : null,
    className: h.className ? String(h.className) : null,
    text: text ? text.slice(0, 120) : null,
    selector: buildSelector(el),
  };
}

// -----------------------------------------------------------------------------
// Fallback HTML for testing without fetching
// -----------------------------------------------------------------------------

const FALLBACK_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Inspector PoC</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; background: #fafafa; }
      .card { background: white; border: 1px solid #e5e7eb; padding: 20px; border-radius: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
      button { padding: 12px 18px; border-radius: 12px; border: 1px solid #d1d5db; cursor: pointer; background: white; font-weight: 500; }
      button:hover { background: #f3f4f6; }
      a { color: #6366f1; text-decoration: none; }
      a:hover { text-decoration: underline; }
      input { padding: 10px 14px; border-radius: 10px; border: 1px solid #d1d5db; width: 200px; }
      h1 { color: #111827; margin-bottom: 8px; }
      h2 { color: #374151; margin-top: 0; }
      p { color: #6b7280; line-height: 1.6; }
    </style>
  </head>
  <body>
    <h1>🔍 Inspector Test Page</h1>
    <p>Hover over elements to highlight them. Click to select and lock the selection.</p>

    <div class="card">
      <h2>Section One</h2>
      <p>Some text with <a href="https://example.com">a link</a> inside it.</p>
      <button>Click Me</button>
    </div>

    <div class="card">
      <h2>Section Two</h2>
      <label for="demo-input">Input field:</label>
      <input id="demo-input" placeholder="Type something..." />
    </div>

    <div class="card">
      <h2>Nested Elements</h2>
      <div style="display: flex; gap: 8px;">
        <span style="padding: 8px 12px; background: #e0e7ff; border-radius: 8px;">Tag 1</span>
        <span style="padding: 8px 12px; background: #fce7f3; border-radius: 8px;">Tag 2</span>
        <span style="padding: 8px 12px; background: #d1fae5; border-radius: 8px;">Tag 3</span>
      </div>
    </div>
  </body>
</html>`;

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------

export default function InspectorPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [url, setUrl] = useState<string>("https://example.com");
  const [html, setHtml] = useState<string>(FALLBACK_HTML);
  const [loading, setLoading] = useState<boolean>(false);

  const [hovered, setHovered] = useState<PickInfo | null>(null);
  const [selected, setSelected] = useState<PickInfo | null>(null);
  const [freeze, setFreeze] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // CSS injected into the iframe for highlighting
  const inspectorCss = useMemo(() => {
    return `
      .__inspector_hover {
        outline: 2px solid #8b5cf6 !important;
        outline-offset: 2px !important;
        background-color: rgba(139, 92, 246, 0.05) !important;
      }
      .__inspector_selected {
        outline: 3px solid #22c55e !important;
        outline-offset: 2px !important;
        background-color: rgba(34, 197, 94, 0.08) !important;
      }
    `;
  }, []);

  // Set up iframe event listeners whenever html or freeze changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cleanup = () => {};

    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      // Inject our highlighting CSS
      const style = doc.createElement("style");
      style.textContent = inspectorCss;
      doc.head.appendChild(style);

      let lastHover: Element | null = null;
      let lastSelected: Element | null = null;

      const clearHover = () => {
        if (lastHover) lastHover.classList.remove("__inspector_hover");
        lastHover = null;
      };

      const applyHover = (el: Element) => {
        if (lastHover && lastHover !== el) {
          lastHover.classList.remove("__inspector_hover");
        }
        lastHover = el;
        el.classList.add("__inspector_hover");
      };

      const clearSelected = () => {
        if (lastSelected) lastSelected.classList.remove("__inspector_selected");
        lastSelected = null;
      };

      const applySelected = (el: Element) => {
        if (lastSelected && lastSelected !== el) {
          lastSelected.classList.remove("__inspector_selected");
        }
        lastSelected = el;
        el.classList.add("__inspector_selected");
      };

      const onMouseMove = (e: MouseEvent) => {
        if (freeze) return;
        const target = e.target as Element | null;
        if (!target || target === doc.documentElement || target === doc.body) return;

        applyHover(target);
        setHovered(pickInfoFrom(target));
      };

      const onClick = (e: MouseEvent) => {
        const target = e.target as Element | null;
        if (!target || target === doc.documentElement || target === doc.body) return;

        // Prevent navigation
        e.preventDefault();
        e.stopPropagation();

        clearSelected();
        applySelected(target);

        const info = pickInfoFrom(target);
        setSelected(info);
        setFreeze(true);
      };

      doc.addEventListener("mousemove", onMouseMove, true);
      doc.addEventListener("click", onClick, true);

      cleanup = () => {
        doc.removeEventListener("mousemove", onMouseMove, true);
        doc.removeEventListener("click", onClick, true);
        clearHover();
        clearSelected();
      };
    };

    iframe.addEventListener("load", onLoad);

    return () => {
      iframe.removeEventListener("load", onLoad);
      cleanup();
    };
  }, [freeze, inspectorCss]);

  async function loadFromInternet() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/fetch-html?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      const text = await res.text();
      setHtml(text);
      setHovered(null);
      setSelected(null);
      setFreeze(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not load page";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function resetToFallback() {
    setHtml(FALLBACK_HTML);
    setHovered(null);
    setSelected(null);
    setFreeze(false);
    setError(null);
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Left: iframe preview */}
      <div className="flex flex-1 flex-col border-r border-zinc-800">
        {/* URL bar */}
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 p-3">
          <label htmlFor="inspector-url" className="sr-only">
            URL att ladda i inspektören
          </label>
          <input
            id="inspector-url"
            name="inspectorUrl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadFromInternet()}
            placeholder="https://..."
            className="focus:ring-brand-blue/50 flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:ring-2 focus:outline-none"
          />
          <button
            onClick={loadFromInternet}
            disabled={loading}
            className="bg-brand-blue hover:bg-brand-blue/90 rounded-xl px-4 py-2.5 font-medium text-white transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "Load URL"}
          </button>
          <button
            onClick={resetToFallback}
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Reset
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            ⚠️ {error}
          </div>
        )}

        {/* The iframe */}
        <iframe ref={iframeRef} srcDoc={html} className="w-full flex-1 border-0 bg-white" />
      </div>

      {/* Right: Inspector panel */}
      <div className="w-96 overflow-y-auto bg-zinc-900 p-4">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
          <span className="text-2xl">🔍</span> Element Inspector
        </h2>

        {/* Controls */}
        <div className="mb-5 flex gap-2">
          <button
            onClick={() => setFreeze((v) => !v)}
            className={`flex-1 rounded-xl px-4 py-2.5 font-medium transition-colors ${
              freeze
                ? "bg-brand-amber/20 text-brand-amber border-brand-amber/30 border"
                : "border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {freeze ? "🔒 Frozen" : "🔓 Live"}
          </button>
          <button
            onClick={() => {
              setSelected(null);
              setFreeze(false);
            }}
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-medium text-zinc-300 transition-colors hover:bg-zinc-700"
          >
            Clear Selection
          </button>
        </div>

        {/* Hovered element info */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
            <span className="bg-brand-blue h-2 w-2 rounded-full"></span>
            Hovered Element
          </div>
          <pre className="overflow-x-auto rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-3 text-xs whitespace-pre-wrap text-zinc-300">
            {hovered ? JSON.stringify(hovered, null, 2) : "— hover over an element —"}
          </pre>
        </div>

        {/* Selected element info */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-green-500"></span>
            Selected Element (click)
          </div>
          <pre className="overflow-x-auto rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-3 text-xs whitespace-pre-wrap text-zinc-300">
            {selected ? JSON.stringify(selected, null, 2) : "— click to select —"}
          </pre>
        </div>

        {/* Tips */}
        <div className="rounded-xl border border-zinc-700/30 bg-zinc-800/30 p-4">
          <div className="mb-2 text-sm font-medium text-zinc-400">💡 Tips</div>
          <ul className="space-y-1.5 text-xs text-zinc-500">
            <li>
              • Hover to highlight elements in <span className="text-brand-blue">blue</span>
            </li>
            <li>
              • Click to select (locks in <span className="text-green-400">green</span>)
            </li>
            <li>• Use &ldquo;Frozen&rdquo; to pause hover updates</li>
            <li>• CSS selector is auto-generated for each element</li>
          </ul>
        </div>

        {/* Back link */}
        <div className="mt-6 border-t border-zinc-800 pt-4">
          <Link href="/" className="text-sm text-zinc-500 transition-colors hover:text-zinc-300">
            ← Back to Sajtmaskin
          </Link>
        </div>
      </div>
    </div>
  );
}
