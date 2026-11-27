"use client";

import { FileCode2, FileType2, Folder } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { SITE_THEMES, type SiteVersion } from "../_lib/mock-data";

type LabFile = { path: string; code: string };

function buildFiles(version: SiteVersion): LabFile[] {
  const { content } = version;
  const theme = SITE_THEMES[version.theme];
  return [
    {
      path: "app/page.tsx",
      code: `import { Hero } from "@/components/hero";
import { Offer } from "@/components/offer";
import { Hours } from "@/components/hours";
import { Contact } from "@/components/contact";${content.booking ? '\nimport { Booking } from "@/components/booking";' : ""}

export default function Page() {
  return (
    <main>
      <Hero />
      <Offer />${content.booking ? "\n      <Booking />" : ""}
      <Hours />
      <Contact />
    </main>
  );
}`,
    },
    {
      path: "components/hero.tsx",
      code: `export function Hero() {
  return (
    <section className="hero">
      <p className="eyebrow">${content.hero.eyebrow} · ${content.city}</p>
      <h1>${content.hero.title}</h1>
      <p className="lead">${content.hero.lead}</p>
      <a href="#meny" className="button">${content.hero.cta}</a>
    </section>
  );
}`,
    },
    {
      path: "components/offer.tsx",
      code: `const items = [
${content.offers.map((offer) => `  { name: "${offer.name}", price: "${offer.price}" },`).join("\n")}
];

export function Offer() {
  return (
    <section id="meny">
      <h2>${content.offerTitle}</h2>
      <ul>
        {items.map((item) => (
          <li key={item.name}>{item.name} – {item.price}</li>
        ))}
      </ul>
    </section>
  );
}`,
    },
    {
      path: "app/globals.css",
      code: `:root {
  --background: ${theme.bg};
  --foreground: ${theme.text};
  --muted: ${theme.muted};
  --accent: ${theme.accent};
}

body {
  background: var(--background);
  color: var(--foreground);
}`,
    },
  ];
}

const TOKEN =
  /(\/\/.*$|"[^"\n]*"|`[^`]*`|\b(?:import|from|export|function|return|const|default)\b|<\/?[A-Za-z][\w.]*|#[0-9a-fA-F]{3,8}\b|--[\w-]+)/gm;

function highlight(code: string) {
  const parts: { text: string; kind: string }[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: code.slice(last, index), kind: "plain" });
    const token = match[0];
    const kind =
      token.startsWith('"') || token.startsWith("`")
        ? "string"
        : token.startsWith("<")
          ? "tag"
          : token.startsWith("#") || token.startsWith("--")
            ? "value"
            : token.startsWith("//")
              ? "comment"
              : "keyword";
    parts.push({ text: token, kind });
    last = index + token.length;
  }
  if (last < code.length) parts.push({ text: code.slice(last), kind: "plain" });
  return parts;
}

const KIND_CLASS: Record<string, string> = {
  plain: "text-[#d6deeb]",
  string: "text-[#ecc48d]",
  tag: "text-[#7fdbca]",
  keyword: "text-[#c792ea]",
  value: "text-[#f78c6c]",
  comment: "text-[#637777]",
};

export function CodeView({ version }: { version: SiteVersion }) {
  const files = useMemo(() => buildFiles(version), [version]);
  const [activePath, setActivePath] = useState(files[0].path);
  const file = files.find((f) => f.path === activePath) ?? files[0];
  const lines = file.code.split("\n");

  return (
    <div className="flex h-full min-h-0 bg-[#0a0d14] text-[13px]">
      <nav
        aria-label="Filer"
        className="hidden w-52 shrink-0 border-r border-white/[0.06] p-2 sm:block"
      >
        <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium tracking-wider text-[var(--lab-muted)] uppercase">
          <Folder className="size-3.5" /> {version.content.brand.toLowerCase().replace(/\s+/g, "-")}
        </p>
        {files.map((f) => (
          <button
            key={f.path}
            type="button"
            onClick={() => setActivePath(f.path)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-[12px] transition-colors",
              f.path === file.path
                ? "bg-white/[0.08] text-white"
                : "text-[var(--lab-muted)] hover:text-white",
            )}
          >
            {f.path.endsWith(".css") ? (
              <FileType2 className="size-3.5 shrink-0" />
            ) : (
              <FileCode2 className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{f.path}</span>
          </button>
        ))}
      </nav>
      <div className="lab-scrollbar min-w-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-white/[0.06] bg-[#0a0d14]/95 px-4 py-2 font-mono text-[11.5px] text-[var(--lab-muted)] backdrop-blur">
          {file.path}
          <span className="ml-auto rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px]">
            v{version.number}
          </span>
        </div>
        <pre className="p-4 font-mono text-[12.5px] leading-6">
          {lines.map((line, index) => (
            <div key={index} className="flex">
              <span className="w-8 shrink-0 pr-3 text-right text-white/20 select-none">
                {index + 1}
              </span>
              <code>
                {highlight(line).map((part, partIndex) => (
                  <span key={partIndex} className={KIND_CLASS[part.kind]}>
                    {part.text}
                  </span>
                ))}
              </code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
