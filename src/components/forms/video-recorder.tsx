"use client";

import { useState, useRef, useCallback } from "react";
import { Video, VideoOff, Loader2, Square, X, Shield, Star, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_RECORDING_SECONDS = 180; // 3 minutes

interface PresentationAnalysis {
  overallScore: number;
  toneFeedback: string;
  clarityFeedback: string;
  pitchFeedback: string;
  confidenceFeedback: string;
  keyMessage: string;
  suggestions: string[];
  strengthHighlight: string;
  postureFeedback?: string;
  eyeContactFeedback?: string;
}

interface VideoRecorderProps {
  onTranscript: (transcript: string) => void;
  onAnalysis?: (analysis: PresentationAnalysis) => void;
  onVideoReady?: (blob: Blob) => void;
  language?: "sv" | "en";
  companyName?: string;
  industry?: string;
  className?: string;
}

/**
 * Extract evenly-spaced keyframes from a video blob as base64 JPEG images.
 * Uses an offscreen video element + canvas for capture.
 */
async function extractKeyframes(videoBlob: Blob, count: number = 4): Promise<string[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    const frames: string[] = [];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!duration || duration < 1 || !ctx) {
        URL.revokeObjectURL(url);
        resolve([]);
        return;
      }

      canvas.width = 320; // Small enough for API but readable
      canvas.height = Math.round(320 * (video.videoHeight / video.videoWidth));

      const times: number[] = [];
      for (let i = 0; i < count; i++) {
        times.push((duration * (i + 0.5)) / count);
      }

      let idx = 0;
      const captureNext = () => {
        if (idx >= times.length) {
          URL.revokeObjectURL(url);
          resolve(frames);
          return;
        }
        video.currentTime = times[idx];
      };

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        frames.push(dataUrl);
        idx++;
        captureNext();
      };

      captureNext();
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve([]);
    };
  });
}

export function VideoRecorder({
  onTranscript,
  onAnalysis,
  onVideoReady,
  language = "sv",
  companyName = "",
  industry = "",
  className = "",
}: VideoRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [analysis, setAnalysis] = useState<PresentationAnalysis | null>(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const maxTimerRef = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const stopRecordingInternal = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setVideoUrl(null);
      setShowPreview(false);
      setAnalysis(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9,opus",
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const videoBlob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(videoBlob);
        setVideoUrl(url);
        setShowPreview(true);
        onVideoReady?.(videoBlob);
        await processVideo(videoBlob);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Auto-stop at max duration
      maxTimerRef.current = setTimeout(() => {
        stopRecordingInternal();
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (err) {
      console.error("Failed to start video recording:", err);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Kamera/mikrofon-atkomst nekad. Tillat i webblasaren.");
      } else if (err instanceof Error && err.name === "NotFoundError") {
        setError("Ingen kamera hittades pa din enhet.");
      } else {
        setError("Kunde inte starta videoinspelning.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onVideoReady, stopRecordingInternal]);

  const stopRecording = useCallback(() => {
    stopRecordingInternal();
  }, [stopRecordingInternal]);

  // Transcribe + extract frames + analyze
  const processVideo = useCallback(
    async (videoBlob: Blob) => {
      setIsProcessing(true);
      setError(null);

      try {
        // Step 1: Transcribe audio + extract keyframes in parallel
        setProcessingStep("Analyserar din video -- detta ingar i din sajtbrief...");

        const [transcribeResult, frames] = await Promise.all([
          // Transcribe
          (async () => {
            const formData = new FormData();
            formData.append("audio", videoBlob, "recording.webm");
            formData.append("language", language);
            const res = await fetch("/api/transcribe", { method: "POST", body: formData });
            return res.json();
          })(),
          // Extract 4 evenly-spaced keyframes
          extractKeyframes(videoBlob, 4),
        ]);

        if (!transcribeResult.success) {
          throw new Error(transcribeResult.error || "Transkribering misslyckades");
        }

        const transcript = transcribeResult.transcript || "";
        if (!transcript) {
          setError("Inget tal upptacktes i videon. Forsok igen.");
          return;
        }

        onTranscript(transcript);

        // Step 2: Analyze presentation (transcript + visual frames)
        setProcessingStep("AI granskar din presentation for sajtbriefen...");
        try {
          const analysisRes = await fetch("/api/analyze-presentation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript,
              companyName,
              industry,
              language,
              frames: frames.length > 0 ? frames : undefined,
            }),
          });
          const analysisData = await analysisRes.json();

          if (analysisRes.ok && analysisData.success && analysisData.analysis) {
            setAnalysis(analysisData.analysis);
            onAnalysis?.(analysisData.analysis);
          }
        } catch {
          console.warn("[VideoRecorder] Presentation analysis failed (non-fatal)");
        }
      } catch (err) {
        console.error("Video processing error:", err);
        setError(err instanceof Error ? err.message : "Kunde inte bearbeta videon.");
      } finally {
        setIsProcessing(false);
        setProcessingStep(null);
      }
    },
    [language, companyName, industry, onTranscript, onAnalysis],
  );

  const dismissPreview = useCallback(() => {
    setShowPreview(false);
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
  }, [videoUrl]);

  // ── Privacy gate ────────────────────────────────────────────────
  if (!privacyAccepted) {
    return (
      <div className={`space-y-3 ${className}`}>
        <div className="rounded-lg border border-gray-700/50 bg-gray-900/50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" />
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-200">
                Sekretess vid videoinspelning
              </p>
              <p className="text-xs leading-relaxed text-gray-400">
                Din video bearbetas for att transkribera talet och ge konstruktiv
                feedback pa din presentation. Vi analyserar ton, tydlighet, hallning och
                blickkontakt -- allt for att hjalpa dig kommunicera battre.
              </p>
              <ul className="space-y-1 text-xs text-gray-500">
                <li className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-brand-teal" />
                  Ljudet transkriberas via OpenAI Whisper
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-brand-teal" />
                  Ett fatal stillbilder analyseras av AI for kroppssprak och hallning
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-brand-teal" />
                  Ingen video sparas pa vara servrar
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-brand-teal" />
                  Max 3 minuters inspelning
                </li>
              </ul>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setPrivacyAccepted(true)}
            variant="outline"
            size="sm"
            className="w-full gap-2 border-brand-teal/30 text-brand-teal hover:bg-brand-teal/10"
          >
            <Video className="h-4 w-4" />
            Jag forstar -- aktivera videoinspelning
          </Button>
        </div>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────
  const timeRemaining = MAX_RECORDING_SECONDS - recordingTime;
  const isNearLimit = timeRemaining <= 30;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Video preview area */}
      <div className="relative overflow-hidden rounded-lg border border-gray-700 bg-black">
        <video
          ref={videoRef}
          className={`aspect-video w-full object-cover ${!isRecording && !showPreview ? "hidden" : ""}`}
          playsInline
          {...(showPreview && videoUrl ? { src: videoUrl, controls: true, muted: false } : {})}
        />

        {!isRecording && !showPreview && (
          <div className="flex aspect-video items-center justify-center bg-gray-900/50">
            <div className="text-center">
              <Video className="mx-auto mb-2 h-8 w-8 text-gray-600" />
              <p className="text-xs text-gray-500">Spela in din elevator pitch</p>
              <p className="text-[10px] text-gray-600">AI analyserar bade tal och kroppssprak</p>
            </div>
          </div>
        )}

        {/* Recording indicator with countdown */}
        {isRecording && (
          <div className="absolute top-3 left-3 flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-medium text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              REC {formatTime(recordingTime)}
            </div>
            <div className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              isNearLimit ? "bg-red-500/80 text-white" : "bg-black/50 text-gray-300"
            }`}>
              {formatTime(timeRemaining)} kvar
            </div>
          </div>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="max-w-[260px] text-center">
              <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-brand-teal" />
              <p className="text-sm font-medium text-white">{processingStep}</p>
              <p className="mt-1 text-[10px] text-gray-400">
                Resultatet inkluderas i din webbplats-brief
              </p>
            </div>
          </div>
        )}

        {showPreview && !isProcessing && (
          <button
            onClick={dismissPreview}
            className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          variant={isRecording ? "destructive" : "outline"}
          size="sm"
          className={`gap-2 ${
            isRecording
              ? "border-red-600 bg-red-600 hover:bg-red-700"
              : "border-brand-teal/50 text-brand-teal hover:bg-brand-teal/10"
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Bearbetar...
            </>
          ) : isRecording ? (
            <>
              <Square className="h-3 w-3 fill-current" />
              Stoppa ({formatTime(recordingTime)})
            </>
          ) : (
            <>
              <Video className="h-4 w-4" />
              Spela in presentation
            </>
          )}
        </Button>

        {!isRecording && !isProcessing && (
          <span className="text-xs text-gray-500">Max 3 min</span>
        )}
      </div>

      {/* Analysis results card */}
      {analysis && (
        <div className="rounded-lg border border-brand-teal/20 bg-brand-teal/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-brand-teal">
              <ThumbsUp className="h-4 w-4" />
              Presentationsanalys
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`h-3.5 w-3.5 ${
                    i < Math.round((analysis.overallScore || 0) / 2)
                      ? "fill-brand-amber text-brand-amber"
                      : "text-gray-600"
                  }`}
                />
              ))}
              <span className="ml-1 text-xs text-gray-400">
                {analysis.overallScore}/10
              </span>
            </div>
          </div>

          {analysis.strengthHighlight && (
            <div className="rounded-md bg-brand-teal/10 px-3 py-2 text-xs text-gray-200">
              <strong className="text-brand-teal">Styrka:</strong> {analysis.strengthHighlight}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            {analysis.toneFeedback && (
              <div className="space-y-0.5">
                <span className="text-gray-500">Ton & energi</span>
                <p className="text-gray-300">{analysis.toneFeedback}</p>
              </div>
            )}
            {analysis.clarityFeedback && (
              <div className="space-y-0.5">
                <span className="text-gray-500">Tydlighet</span>
                <p className="text-gray-300">{analysis.clarityFeedback}</p>
              </div>
            )}
            {analysis.pitchFeedback && (
              <div className="space-y-0.5">
                <span className="text-gray-500">Elevator pitch</span>
                <p className="text-gray-300">{analysis.pitchFeedback}</p>
              </div>
            )}
            {analysis.confidenceFeedback && (
              <div className="space-y-0.5">
                <span className="text-gray-500">Sjalvsakerhet</span>
                <p className="text-gray-300">{analysis.confidenceFeedback}</p>
              </div>
            )}
            {analysis.postureFeedback && (
              <div className="space-y-0.5">
                <span className="text-gray-500">Hallning</span>
                <p className="text-gray-300">{analysis.postureFeedback}</p>
              </div>
            )}
            {analysis.eyeContactFeedback && (
              <div className="space-y-0.5">
                <span className="text-gray-500">Blickkontakt</span>
                <p className="text-gray-300">{analysis.eyeContactFeedback}</p>
              </div>
            )}
          </div>

          {analysis.keyMessage && (
            <div className="text-xs">
              <span className="text-gray-500">Huvudbudskap som nadde fram:</span>
              <p className="mt-0.5 text-gray-200 italic">&quot;{analysis.keyMessage}&quot;</p>
            </div>
          )}

          {analysis.suggestions?.length > 0 && (
            <div className="text-xs">
              <span className="text-gray-500">Tips for nasta gang:</span>
              <ul className="mt-1 space-y-0.5">
                {analysis.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-gray-400">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-brand-teal/60" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <VideoOff className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
