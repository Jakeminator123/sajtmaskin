"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { VideoGenerationIntent } from "@/lib/media/video-generation-intent";
import { insertGeneratedVideo, type VideoBuilderHandoff } from "@/lib/media/video-builder-action";
import { getBuilderBridge } from "@/lib/openclaw/builder-bridge";
import {
  VIDEO_GENERATION_PROMPT_MAX_LENGTH,
  VIDEO_GENERATION_SOURCE_MIME_TYPES,
  type VideoGenerationJob,
  type VideoGenerationOrder,
  type VideoGenerationsResponse,
  type VideoGenerationResponse,
} from "@/lib/media/video-generation-contract";

type SourceImage = { id: number; filename: string; mimeType: string; fileType: string; projectId: string | null };
type Context = VideoGenerationsResponse & { projectId: string; images: SourceImage[] };
type Props = {
  projectId?: string;
  chatId?: string | null;
  intent?: VideoGenerationIntent;
  requestId?: string;
  onClose: () => void;
  onSaved?: (job: VideoGenerationJob) => void;
  allowBuilderHandoff?: boolean;
};

const ENDPOINT = "/api/media/video-generations";
const POLL_MS = 2500;

class VideoGenerationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw new VideoGenerationError(
      typeof body?.error === "string" ? body.error : "Kunde inte kontakta videogenereringen.",
      response.status,
    );
  }
  return body as T;
}

function isActive(job: VideoGenerationJob | undefined) {
  return job?.status === "pending" || job?.status === "processing";
}

export function VideoGenerationPanel({ projectId, chatId, intent, onClose, onSaved, requestId, allowBuilderHandoff = false }: Props) {
  const [context, setContext] = useState<Context>();
  const [prompt, setPrompt] = useState(intent?.prompt ?? "");
  const [sourceId, setSourceId] = useState(intent?.sourceMediaId?.toString() ?? "");
  const [job, setJob] = useState<VideoGenerationJob>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [insertionDispatched, setInsertionDispatched] = useState(false);
  const [handoff, setHandoff] = useState<VideoBuilderHandoff>();
  const scope = useRef<AbortController>(null);
  const order = useRef<VideoGenerationOrder>(null);
  const orderedAgainstVersion = useRef<string | undefined>(undefined);
  const posting = useRef(false);
  const paidJobId = useRef<string | null>(null);
  const savedJobs = useRef(new Set<string>());
  const autoTried = useRef(false);
  const insertTried = useRef(false);
  const dispatchedInsertion = useRef(false);
  const [retryOrder, setRetryOrder] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    void (async () => {
      if (!projectId && !chatId) throw new Error("Öppna videobeställningen från en sparad sajt.");
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (chatId) params.set("chatId", chatId);
      const readQuote = (id: string) => readJson<VideoGenerationsResponse>(
        `${ENDPOINT}?projectId=${encodeURIComponent(id)}`,
        { signal: controller.signal },
      );
      const [media, knownQuote] = await Promise.all([
        readJson<{ success: boolean; projectId: string | null; items: SourceImage[] }>(
          `/api/media/upload?${params}`,
          { signal: controller.signal },
        ),
        projectId ? readQuote(projectId) : undefined,
      ]);
      if (!media.success || !media.projectId || (projectId && media.projectId !== projectId)) {
        throw new Error("Kunde inte verifiera vilken sajt som videon ska sparas i.");
      }
      const verifiedProjectId = media.projectId;
      const config = knownQuote ?? await readQuote(verifiedProjectId);
      if (!controller.signal.aborted) {
        const images = media.items.filter((item) =>
          (item.projectId === verifiedProjectId || item.projectId === null) &&
          (item.fileType === "image" || item.fileType === "logo") &&
          VIDEO_GENERATION_SOURCE_MIME_TYPES.includes(item.mimeType) &&
          Number.isSafeInteger(item.id) && item.id > 0,
        );
        setSourceId((current) => images.some((item) => String(item.id) === current) ? current : "");
        setContext({ ...config, images, projectId: verifiedProjectId });
      }
    })().catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Kunde inte öppna Skapa video.");
    });
    return () => controller.abort();
  }, [chatId, projectId]);

  const submit = useCallback(async (maxCredits: number) => {
    const signal = scope.current?.signal;
    if (!signal || signal.aborted || !context?.enabled || posting.current || paidJobId.current) return;
    const source = context.images.find((image) => String(image.id) === sourceId);
    if (!source || !prompt.trim() || prompt.trim().length > VIDEO_GENERATION_PROMPT_MAX_LENGTH || context.quote.credits > maxCredits) return;
    // After an ambiguous network failure, repeat precisely the same order ID.
    const next = order.current ?? {
      projectId: context.projectId,
      sourceMediaId: source.id,
      prompt: prompt.trim(),
      requestId: requestId ?? crypto.randomUUID(),
      maxCredits,
    };
    const bridge = getBuilderBridge();
    if (!order.current && chatId && bridge?.getChatId() === chatId) {
      orderedAgainstVersion.current = bridge.getActiveVersionId() ?? undefined;
    }
    order.current = next;
    posting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await readJson<VideoGenerationResponse>(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
        signal,
      });
      if (signal.aborted) return;
      if (response.job.projectId !== next.projectId) throw new Error("Jobbet gäller fel sajt.");
      paidJobId.current = response.job.id;
      setRetryOrder(false);
      setJob(response.job);
    } catch (reason: unknown) {
      if (signal.aborted) return;
      const rejected = reason instanceof VideoGenerationError && reason.status >= 400 && reason.status < 500;
      // Keep the original receipt through every uncertain retry, even if a
      // later attempt receives a rate limit or another definite HTTP error.
      if (rejected && !retryOrder) order.current = null;
      setRetryOrder(!rejected || retryOrder);
      setError(reason instanceof Error ? reason.message : "Kunde inte beställa videon.");
    } finally {
      posting.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }, [chatId, context, prompt, requestId, retryOrder, sourceId]);

  const approvedCredits = intent?.approvedCredits;
  useEffect(() => {
    if (autoTried.current || approvedCredits === undefined || !context?.enabled ||
        context.quote.credits > approvedCredits || !intent?.sourceMediaId ||
        sourceId !== String(intent.sourceMediaId) || prompt !== intent.prompt || !prompt.trim()) return;
    // The budget is explicit in the user’s command. The price is shown before
    // sending and the API receives the same pre-approved cap.
    const timer = window.setTimeout(() => {
      autoTried.current = true;
      void submit(context.quote.credits);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [approvedCredits, context, intent?.prompt, intent?.sourceMediaId, prompt, sourceId, submit]);

  useEffect(() => {
    if (!job || !isActive(job) || !context || job.projectId !== context.projectId) return;
    const controller = new AbortController();
    let timer: number;
    const poll = async () => {
      try {
        const result = await readJson<VideoGenerationResponse>(
          `${ENDPOINT}/${encodeURIComponent(job.id)}?projectId=${encodeURIComponent(job.projectId)}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        if (result.job.id !== job.id || result.job.projectId !== job.projectId) {
          throw new Error("Jobbet gäller fel sajt.");
        }
        setError("");
        setJob(result.job);
      } catch (reason: unknown) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Kunde inte läsa status. Försöker igen.");
          timer = window.setTimeout(poll, POLL_MS);
        }
      }
    };
    timer = window.setTimeout(poll, POLL_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [context, job]);

  const insert = useCallback(async (ready: VideoGenerationJob) => {
    const signal = scope.current?.signal;
    if (!chatId || !context || !signal || signal.aborted || insertTried.current) return;
    insertTried.current = true;
    setInserting(true);
    try {
      const outcome = await insertGeneratedVideo(ready, {
        chatId,
        projectId: context.projectId,
        placement: intent?.placement,
        versionId: orderedAgainstVersion.current,
      }, signal, {
        allowHandoff: allowBuilderHandoff,
        onDispatch: () => {
          dispatchedInsertion.current = true;
          setInsertionDispatched(true);
        },
      });
      if (!signal.aborted) {
        if (outcome.kind === "sent") setInserted(true);
        else setHandoff(outcome);
      }
    } catch (reason: unknown) {
      if (!signal.aborted) {
        if (!dispatchedInsertion.current) insertTried.current = false;
        setError(reason instanceof Error ? reason.message : "Videon sparades. Kunde inte lägga in den i bygget.");
      }
    } finally {
      if (!signal.aborted) setInserting(false);
    }
  }, [allowBuilderHandoff, chatId, context, intent?.placement]);

  useEffect(() => {
    if (!job || job.status !== "succeeded" || !job.media || savedJobs.current.has(job.id)) return;
    savedJobs.current.add(job.id);
    onSaved?.(job);
  }, [job, onSaved]);
  return (
    <section aria-label="Skapa video" className="space-y-3 rounded-xl border border-current/20 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Skapa video</h3>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Stäng videoskaparen</Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!context && !error && <p role="status">Hämtar pris och startbilder…</p>}
      {context && !context.enabled && <p role="status">Videogenerering är inte tillgänglig för sajten just nu.</p>}
      {context && (context.enabled || job) && <p>{context.quote.durationSeconds} sekunders video · {job?.credits ?? context.quote.credits} krediter</p>}
      {context?.enabled && approvedCredits !== undefined && (!job || context.quote.credits <= approvedCredits) && (
        <p>{context.quote.credits <= approvedCredits
          ? `Godkänt budgettak för videon ${approvedCredits} krediter`
          : `Videopriset överstiger ditt budgettak på ${approvedCredits} krediter. En ny beställning kräver ditt godkännande.`}</p>
      )}
      {context?.enabled && !job && (
        <form className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          void submit(order.current?.maxCredits ?? context.quote.credits);
        }}>
          {intent?.insert && <p>
            Infogning startar en separat debiterad byggtur. Du godkänner byggkostnaden när videon är klar.
            {intent.placement ? ` Placering: ${intent.placement}` : ""}
          </p>}
          <label className="block">
            Startbild från mediebanken
            <select className="block w-full rounded border bg-background p-2 text-foreground" required value={sourceId}
              disabled={busy || retryOrder} onChange={(event) => setSourceId(event.currentTarget.value)}>
              <option value="">Välj en startbild</option>
              {context.images.map((image) => <option key={image.id} value={image.id}>{image.filename}</option>)}
            </select>
          </label>
          {!context.images.length && <p>Ladda upp en PNG-, JPEG- eller WebP-bild i mediebanken för att börja.</p>}
          <label className="block">
            Beskriv hur videon ska röra sig
            <textarea className="block w-full rounded border bg-background p-2 text-foreground" required rows={2} maxLength={VIDEO_GENERATION_PROMPT_MAX_LENGTH}
              value={prompt} disabled={busy || retryOrder} onChange={(event) => setPrompt(event.currentTarget.value)} />
          </label>
          <Button type="submit" size="sm" disabled={busy || !sourceId || !prompt.trim() || prompt.trim().length > VIDEO_GENERATION_PROMPT_MAX_LENGTH}>
            {busy ? "Beställer…" : retryOrder ? "Kontrollera samma beställning" : `Beställ video för ${context.quote.credits} krediter`}
          </Button>
        </form>
      )}
      {job && isActive(job) && <p role="status">Videon genereras. Den sparas i mediebanken när den är klar.</p>}
      {job?.status === "failed" && <p role="alert">{job.error || "Det gick inte att skapa videon."}</p>}
      {job?.status === "succeeded" && job.media && (
        <div className="space-y-2">
          <p role="status">{inserted ? "Videon sparades och skickades till byggaren." : inserting ? "Videon sparades. Skickar till byggaren…" : "Videon har sparats i mediebanken."}</p>
          <a className="underline" href={job.media.url} target="_blank" rel="noreferrer">Öppna {job.media.filename}</a>
          {paidJobId.current === job.id && intent?.insert && !inserting && !inserted && !insertionDispatched && (
            handoff
              ? <a className="ml-2 underline" href={handoff.href} onClick={(event) => {
                try {
                  handoff.prepare();
                } catch {
                  event.preventDefault();
                  setError("Videon finns i mediebanken. Kunde inte öppna infogningen.");
                }
              }}>Öppna rätt sajt och lägg in videon</a>
              : chatId ? (
                <div className="space-y-1">
                  <p>Byggaren debiterar en separat byggtur för att lägga in videon.</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => void insert(job)}>
                    Godkänn byggkostnaden och lägg in videon
                  </Button>
                </div>
              ) : null
          )}
        </div>
      )}
      {!job && context?.jobs.some(isActive) && (
        <div className="space-y-1">
          <p>Pågående beställningar</p>
          {context.jobs.filter(isActive).map((existing) => (
            <Button key={existing.id} type="button" variant="outline" size="sm" disabled={busy || retryOrder}
              onClick={() => setJob(existing)}>Följ video {existing.id.slice(0, 8)}</Button>
          ))}
        </div>
      )}
    </section>
  );
}
