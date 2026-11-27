"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PublicSourcePage, SelectedSourcePage } from "@/lib/openclaw/source-page";

interface ImportedSourceImage {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
}

export function SourcePagePanel({
  disabled,
  importImage = true,
  chatId,
  onUse,
}: {
  disabled?: boolean;
  importImage?: boolean;
  chatId?: string | null;
  onUse: (source: SelectedSourcePage, image?: ImportedSourceImage) => void;
}) {
  const id = useId();
  const [link, setLink] = useState("");
  const [page, setPage] = useState<PublicSourcePage>();
  const [passage, setPassage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [permit, setPermit] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setError("");
    try {
      await action(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : "Källan gick inte att använda.");
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
      activeRequest.current = null;
    }
  }

  function readPage() {
    void run(async (signal) => {
      setPage(undefined);
      setPassage("");
      setImageUrl("");
      setPermit(false);
      const response = await fetch("/api/openclaw/source-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link }),
        signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sidan gick inte att läsa.");
      if (!signal.aborted) setPage(data);
    });
  }

  function usePage() {
    if (!page || (!passage && !imageUrl)) return;
    const image = page.images.find((candidate) => candidate.url === imageUrl);
    const source = { url: page.url, passage, image };
    const accept = (imported?: ImportedSourceImage) => {
      onUse(source, imported);
      setPassage("");
      setImageUrl("");
      setPermit(false);
    };
    if (!image || !importImage) {
      accept();
      return;
    }
    if (!permit) return;
    void run(async (signal) => {
      const response = await fetch("/api/media/upload-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: image.url,
          filename: "kallbild",
          source: "sajtagent-source",
          sourcePageUrl: page.url,
          ...(chatId ? { chatId } : {}),
        }),
        signal,
      });
      const data = await response.json();
      if (!response.ok || !data.media || data.media.storageType === "local") {
        throw new Error(data.error || "Bilden gick inte att spara för bygget.");
      }
      if (!signal.aborted) {
        accept({
          id: String(data.media.id ?? data.media.url),
          url: data.media.url,
          filename: data.media.filename,
          mimeType: data.media.contentType,
        });
      }
    });
  }

  return (
    <details className="max-w-full text-sm">
      <summary className="cursor-pointer">Läs en webbsida</summary>
      <div className="mt-2 grid gap-2">
        <p>Skriv ”Sök på webben …” i chatten när du vill söka bredare.</p>
        <label htmlFor={id}>Publik URL</label>
        <input id={id} type="url" className="rounded border p-2" value={link}
          maxLength={2048} onChange={(event) => { setLink(event.target.value); setPage(undefined); }}
          disabled={pending || disabled} />
        <button type="button" className="rounded border px-2 py-1"
          disabled={!link.trim() || pending || disabled} onClick={readPage}>
          {pending && !page ? "Läser sidan…" : "Läs sidan"}
        </button>
        {page && (
          <>
            <p className="break-all">{page.title || page.url}</p>
            {page.passages.length === 0 && page.images.length === 0 && <p>Hittade inget textstycke eller bild.</p>}
            {page.passages.length > 0 && (
              <label>
                Textstycke
                <select className="block w-full rounded border p-2" value={passage} disabled={pending || disabled}
                  onChange={(event) => setPassage(event.target.value)}>
                  <option value="">Välj text</option>
                  {page.passages.map((text) => <option key={text} value={text}>{text.slice(0, 160)}</option>)}
                </select>
              </label>
            )}
            {passage && <p className="max-h-32 overflow-auto whitespace-pre-wrap">{passage}</p>}
            {page.images.length > 0 && (
              <label>
                Bild
                <select className="block w-full rounded border p-2" value={imageUrl} disabled={pending || disabled}
                  onChange={(event) => { setImageUrl(event.target.value); setPermit(false); }}>
                  <option value="">Välj bild</option>
                  {page.images.map(({ url, alt }) => <option key={url} value={url}>{alt || url}</option>)}
                </select>
              </label>
            )}
            {imageUrl && <a href={imageUrl} target="_blank" rel="noopener noreferrer">Visa vald bild</a>}
            {imageUrl && importImage && (
              <label>
                <input type="checkbox" checked={permit} disabled={pending || disabled}
                  onChange={(event) => setPermit(event.target.checked)} /> Jag får återanvända bilden
              </label>
            )}
            <button type="button" className="rounded border px-2 py-1"
              disabled={pending || disabled || (!passage && !imageUrl) || Boolean(importImage && imageUrl && !permit)} onClick={usePage}>
              Använd i utkastet
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
