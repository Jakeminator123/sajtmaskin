"use client";

import { useVoiceRecorder } from "./use-voice-recorder";
import { Mic, MicOff, Loader2, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./voice-recorder.module.css";

interface VoiceRecorderProps {
  onTranscript: (transcript: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  language?: "sv" | "en";
  placeholder?: string;
  className?: string;
  /** Compact mode: renders a small icon button that fits into toolbars */
  compact?: boolean;
  disabled?: boolean;
}

export function VoiceRecorder({
  onTranscript,
  onRecordingChange,
  language = "sv",
  placeholder = "Klicka för att börja prata...",
  className = "",
  compact = false,
  disabled = false,
}: VoiceRecorderProps) {
  const {
    isStarting,
    isRecording,
    isTranscribing,
    recordingTime,
    audioLevel,
    error,
    startRecording,
    stopRecording,
  } = useVoiceRecorder({ onTranscript, onRecordingChange, language, disabled });
  const audioLevelStep = Math.max(0, Math.min(10, Math.round(audioLevel * 10)));
  const levelClasses = [
    styles.level0,
    styles.level1,
    styles.level2,
    styles.level3,
    styles.level4,
    styles.level5,
    styles.level6,
    styles.level7,
    styles.level8,
    styles.level9,
    styles.level10,
  ];
  const barIndexClasses = [
    styles.barIndex1,
    styles.barIndex2,
    styles.barIndex3,
    styles.barIndex4,
    styles.barIndex5,
  ];
  const levelClass = levelClasses[audioLevelStep];

  // Format recording time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // ── Compact mode ──────────────────────────────────────────────────
  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 ${className}`}>
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!isRecording && (isStarting || isTranscribing || disabled)}
          title={
            isStarting
              ? "Väntar på mikrofon..."
              : isTranscribing
                ? "Transkriberar..."
                : isRecording
                  ? `Stoppa inspelning (${formatTime(recordingTime)})`
                  : "Spela in röstmeddelande"
          }
          className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md border transition-all ${
            isRecording
              ? "border-red-500 bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : isTranscribing
                ? "border-border text-muted-foreground cursor-wait opacity-60"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
          } disabled:opacity-50`}
        >
          {isStarting || isTranscribing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isRecording ? (
            <Square className="h-3 w-3 fill-current" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}

          {/* Pulse ring when recording */}
          {isRecording && (
            <span className="absolute inset-0 animate-ping rounded-md border border-red-400/40" />
          )}
        </button>

        {/* Show timer when recording */}
        {isRecording && (
          <span className="text-xs font-mono text-red-400">
            {formatTime(recordingTime)}
          </span>
        )}

        {/* Compact audio bars */}
        {isRecording && (
          <div className="flex items-center gap-0.5">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={`w-0.5 rounded-full bg-red-500 transition-all ${styles.audioBar} ${barIndexClasses[i]} ${levelClass} ${
                  audioLevel > i * 0.3 ? styles.barActive : styles.barInactive
                }`}
                style={{ height: `${8 + audioLevel * (4 + i * 3)}px` }}
              />
            ))}
          </div>
        )}

        {/* Compact error tooltip */}
        {error && (
          <span className="text-xs text-red-400" title={error}>
            <MicOff className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    );
  }

  // ── Full mode ─────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-3">
        {/* Main record button */}
        <Button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!isRecording && (isStarting || isTranscribing || disabled)}
          variant={isRecording ? "destructive" : "outline"}
          size="lg"
          className={`relative min-w-[180px] gap-2 transition-all ${
            isRecording
              ? "border-red-600 bg-red-600 hover:bg-red-700"
              : "border-brand-teal/50 text-brand-teal hover:bg-brand-teal/10 hover:text-brand-teal/80"
          }`}
        >
          {isStarting || isTranscribing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {isStarting ? "Väntar på mikrofon..." : "Transkriberar..."}
            </>
          ) : isRecording ? (
            <>
              <Square className="h-4 w-4 fill-current" />
              Stoppa ({formatTime(recordingTime)})
            </>
          ) : (
            <>
              <Mic className="h-5 w-5" />
              {placeholder}
            </>
          )}

          {/* Audio level indicator */}
          {isRecording && (
            <div
              className={`absolute inset-0 origin-left rounded-md bg-red-400/20 transition-transform ${styles.audioLevelIndicator} ${levelClass}`}
            />
          )}
        </Button>

        {/* Visual audio level bars */}
        {isRecording && (
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`w-1 rounded-full bg-red-500 transition-all ${styles.audioBar} ${barIndexClasses[i]} ${levelClass} ${
                  audioLevel > i * 0.2 ? styles.barActive : styles.barInactive
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <MicOff className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Recording hint */}
      {!isStarting && !isRecording && !isTranscribing && !error && (
        <p className="text-xs text-gray-500">
          <Volume2 className="mr-1 inline h-3 w-3" />
          Beskriv din webbplats med rösten – vi transkriberar automatiskt
        </p>
      )}
    </div>
  );
}
