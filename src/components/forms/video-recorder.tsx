"use client";

import { useState, useRef, useCallback } from "react";
import { Video, VideoOff, Loader2, Square, X, Shield, Star, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PresentationAnalysis {
  overallScore: number;
  toneFeedback: string;
  clarityFeedback: string;
  pitchFeedback: string;
  confidenceFeedback: string;
  keyMessage: string;
  suggestions: string[];
  strengthHighlight: string;
}

interface VideoRecorderProps {
  /** Called with the transcribed text from the video's audio */
  onTranscript: (transcript: string) => void;
  /** Called with the full presentation analysis */
  onAnalysis?: (analysis: PresentationAnalysis) => void;
  /** Called with the video blob for optional attachment */
  onVideoReady?: (blob: Blob) => void;
  language?: "sv" | "en";
  companyName?: string;
  industry?: string;
  className?: string;
}

/**
 * Video recorder that captures camera + microphone, transcribes with
 * Whisper, and runs a constructive AI analysis of the presentation
 * (tone, clarity, elevator pitch, confidence).
 */
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

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
    } catch (err) {
      console.error("Failed to start video recording:", err);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Kamera/mikrofon-åtkomst nekad. Tillåt i webbläsaren.");
      } else if (err instanceof Error && err.name === "NotFoundError") {
        setError("Ingen kamera hittades på din enhet.");
      } else {
        setError("Kunde inte starta videoinspelning.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onVideoReady]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // Transcribe + analyze
  const processVideo = useCallback(
    async (videoBlob: Blob) => {
      setIsProcessing(true);
      setError(null);

      try {
        // Step 1: Transcribe audio via Whisper
        setProcessingStep("Transkriberar tal...");
        const formData = new FormData();
        formData.append("audio", videoBlob, "recording.webm");
        formData.append("language", language);

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const transcribeData = await transcribeRes.json();

        if (!transcribeRes.ok || !transcribeData.success) {
          throw new Error(transcribeData.error || "Transkribering misslyckades");
        }

        const transcript = transcribeData.transcript || "";
        if (!transcript) {
          setError("Inget tal upptäcktes i videon. Försök igen.");
          return;
        }

        onTranscript(transcript);

        // Step 2: Analyze the presentation
        setProcessingStep("Analyserar din presentation...");
        try {
          const analysisRes = await fetch("/api/analyze-presentation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript, companyName, industry, language }),
          });
          const analysisData = await analysisRes.json();

          if (analysisRes.ok && analysisData.success && analysisData.analysis) {
            setAnalysis(analysisData.analysis);
            onAnalysis?.(analysisData.analysis);
          }
        } catch {
          // Analysis is non-critical -- transcript is already saved
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
                Din video bearbetas enbart för att transkribera talet och ge dig konstruktiv
                feedback på din presentation. Vi analyserar ton, tydlighet och budskap --
                <strong className="text-gray-300"> aldrig ditt utseende</strong>.
              </p>
              <ul className="space-y-1 text-xs text-gray-500">
                <li className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-brand-teal" />
                  Videon skickas till OpenAI Whisper för transkribering
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-brand-teal" />
                  Enbart transkriptionen analyseras av AI -- inte själva videon
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-brand-teal" />
                  Ingen video sparas på våra servrar
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-brand-teal" />
                  Du kan radera all data när som helst
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
            Jag förstår -- aktivera videoinspelning
          </Button>
        </div>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────
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
              <p className="text-[10px] text-gray-600">AI transkriberar och ger feedback</p>
            </div>
          </div>
        )}

        {isRecording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-medium text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            REC {formatTime(recordingTime)}
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-brand-teal" />
              <p className="text-sm text-white">{processingStep || "Bearbetar..."}</p>
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
              {processingStep || "Bearbetar..."}
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

        {isRecording && (
          <span className="text-xs text-gray-500">Max 5 min rekommenderat</span>
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

          {/* Strength highlight */}
          {analysis.strengthHighlight && (
            <div className="rounded-md bg-brand-teal/10 px-3 py-2 text-xs text-gray-200">
              <strong className="text-brand-teal">Styrka:</strong> {analysis.strengthHighlight}
            </div>
          )}

          {/* Feedback grid */}
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
                <span className="text-gray-500">Självsäkerhet</span>
                <p className="text-gray-300">{analysis.confidenceFeedback}</p>
              </div>
            )}
          </div>

          {/* Key message */}
          {analysis.keyMessage && (
            <div className="text-xs">
              <span className="text-gray-500">Huvudbudskap som nådde fram:</span>
              <p className="mt-0.5 text-gray-200 italic">&quot;{analysis.keyMessage}&quot;</p>
            </div>
          )}

          {/* Suggestions */}
          {analysis.suggestions?.length > 0 && (
            <div className="text-xs">
              <span className="text-gray-500">Tips för nästa gång:</span>
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

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <VideoOff className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}
