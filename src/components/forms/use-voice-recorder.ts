"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecordingSession = {
  controller: AbortController;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  context: AudioContext | null;
  timer: ReturnType<typeof setInterval> | null;
  frame: number | null;
  phase: "starting" | "recording" | "transcribing";
  announcedRecording: boolean;
  onRecordingChange?: (recording: boolean) => void;
};

/** Release capture immediately; the recorder can still deliver its final chunk. */
function releaseCapture(session: RecordingSession) {
  if (session.timer !== null) clearInterval(session.timer);
  if (session.frame !== null) cancelAnimationFrame(session.frame);
  session.timer = null;
  session.frame = null;
  session.stream?.getTracks().forEach((track) => track.stop());
  session.stream = null;
  if (session.context) void session.context.close().catch(() => undefined);
  session.context = null;
  if (session.announcedRecording) {
    session.announcedRecording = false;
    session.onRecordingChange?.(false);
  }
}

function disposeSession(session: RecordingSession) {
  session.controller.abort();
  if (session.recorder) {
    session.recorder.ondataavailable = null;
    session.recorder.onstop = null;
    session.recorder.onerror = null;
    if (session.recorder.state !== "inactive") session.recorder.stop();
  }
  releaseCapture(session);
}

const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

export function useVoiceRecorder({
  onTranscript,
  onRecordingChange,
  language,
  disabled,
}: {
  onTranscript: (text: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  language: "sv" | "en";
  disabled: boolean;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) disposeSession(session);
    },
    [],
  );

  const startRecording = useCallback(async () => {
    // This lock also covers the permission prompt, before React updates the UI.
    if (disabled || sessionRef.current) return;
    const session: RecordingSession = {
      controller: new AbortController(),
      stream: null,
      recorder: null,
      context: null,
      timer: null,
      frame: null,
      phase: "starting",
      announcedRecording: false,
      onRecordingChange,
    };
    sessionRef.current = session;
    const ownsSession = () =>
      sessionRef.current === session && !session.controller.signal.aborted;
    const finish = () => {
      sessionRef.current = null;
      disposeSession(session);
      setIsStarting(false);
      setIsRecording(false);
      setIsTranscribing(false);
      setAudioLevel(0);
    };
    setIsStarting(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      if (!ownsSession()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      const mimeType = MIME_TYPES.find((mime) =>
        MediaRecorder.isTypeSupported?.(mime),
      );
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      session.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (ownsSession() && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (!ownsSession()) return;
        finish();
        setError(
          "Inspelningen avbröts. Kontrollera din mikrofon och försök igen.",
        );
      };
      recorder.onstop = async () => {
        if (!ownsSession()) return;
        session.phase = "transcribing";
        releaseCapture(session);
        setIsRecording(false);
        setAudioLevel(0);
        setIsTranscribing(true);
        try {
          // The route accepts container MIME types without codec parameters.
          const type = (recorder.mimeType || chunks[0]?.type || "")
            .split(";")[0]
            .trim();
          const extension = type.split("/")[1];
          const audio = new Blob(chunks, { type });
          if (!audio.size)
            throw new Error("Inget ljud spelades in. Försök igen.");
          if (!extension)
            throw new Error("Ljudformatet stöds inte av webbläsaren.");
          const body = new FormData();
          body.append("audio", audio, `recording.${extension}`);
          body.append("language", language);
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body,
            signal: session.controller.signal,
          });
          if (!ownsSession()) return;
          const data = await response.json();
          if (!ownsSession()) return;
          if (!response.ok || !data.success) {
            throw new Error(data.error || "Transkribering misslyckades");
          }
          const transcript =
            typeof data.transcript === "string" ? data.transcript.trim() : "";
          if (transcript) onTranscript(transcript);
          else setError("Inget tal upptäcktes. Försök igen.");
        } catch (err) {
          if (ownsSession()) {
            setError(
              err instanceof Error
                ? err.message
                : "Kunde inte transkribera. Försök igen.",
            );
          }
        } finally {
          if (ownsSession()) finish();
        }
      };

      recorder.start(1000);
      session.phase = "recording";
      setIsStarting(false);
      setIsRecording(true);
      setRecordingTime(0);
      session.announcedRecording = true;
      onRecordingChange?.(true);
      session.timer = setInterval(() => {
        if (ownsSession()) setRecordingTime((previous) => previous + 1);
      }, 1000);

      // Metering is optional: a missing/suspended AudioContext must not prevent dictation.
      try {
        const context = new AudioContext();
        session.context = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!ownsSession() || session.phase !== "recording") return;
          analyser.getByteFrequencyData(samples);
          setAudioLevel(
            samples.reduce((sum, value) => sum + value, 0) /
              samples.length /
              255,
          );
          session.frame = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch {
        if (session.context)
          void session.context.close().catch(() => undefined);
        session.context = null;
      }
    } catch (err) {
      if (!ownsSession()) return;
      finish();
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Mikrofon-åtkomst nekad. Tillåt mikrofonen i webbläsaren."
          : "Kunde inte starta inspelning. Kontrollera din mikrofon.",
      );
    }
  }, [disabled, language, onRecordingChange, onTranscript]);

  const stopRecording = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.phase !== "recording" || !session.recorder) return;
    session.phase = "transcribing";
    setIsRecording(false);
    setIsTranscribing(true);
    setAudioLevel(0);
    if (session.recorder.state !== "inactive") session.recorder.stop();
    releaseCapture(session);
  }, []);

  return {
    isStarting,
    isRecording,
    isTranscribing,
    recordingTime,
    audioLevel,
    error,
    startRecording,
    stopRecording,
  };
}
