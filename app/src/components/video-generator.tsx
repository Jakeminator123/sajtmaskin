"use client";

/**
 * VideoGenerator Component
 * ========================
 *
 * UI for generating videos with OpenAI's Sora API.
 *
 * Features:
 * - Text input for video description
 * - Quality selector (fast/pro)
 * - Progress indicator with polling
 * - Video player for results
 * - Download button
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Video,
  Download,
  Play,
  Pause,
  RefreshCw,
  Sparkles,
  Diamond,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";

type VideoStatus = "idle" | "queued" | "in_progress" | "completed" | "failed";
type VideoQuality = "fast" | "pro";

interface VideoGeneratorProps {
  projectId?: string;
  onVideoGenerated?: (videoUrl: string) => void;
  disabled?: boolean;
  diamonds?: number;
  className?: string;
}

export function VideoGenerator({
  projectId,
  onVideoGenerated,
  disabled = false,
  diamonds = 0,
  className,
}: VideoGeneratorProps) {
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<VideoQuality>("fast");
  const [status, setStatus] = useState<VideoStatus>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Cost based on quality
  const cost = quality === "pro" ? 15 : 10;
  const canAfford = diamonds >= cost;

  // Poll for video status
  const pollStatus = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/generate-video?id=${id}`);
        const data = await response.json();

        if (data.status === "completed") {
          setStatus("completed");
          setVideoUrl(data.downloadUrl);
          onVideoGenerated?.(data.downloadUrl);

          // Stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } else if (data.status === "failed") {
          setStatus("failed");
          setError(data.error || "Videogenerering misslyckades");

          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } else {
          setStatus(data.status);
          setProgress(data.progress);
        }
      } catch (err) {
        console.error("[VideoGenerator] Poll error:", err);
      }
    },
    [onVideoGenerated]
  );

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Start video generation
  const handleGenerate = async () => {
    if (!prompt.trim() || disabled || !canAfford) return;

    // Clear any existing polling interval before starting new generation
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    setStatus("queued");
    setError(null);
    setVideoUrl(null);
    setProgress(null);

    try {
      const response = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          quality,
          projectId,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setStatus("failed");
        setError(data.error || "Kunde inte starta videogenerering");
        return;
      }

      setStatus(data.status);

      // Start polling every 5 seconds
      pollingRef.current = setInterval(() => {
        pollStatus(data.videoId);
      }, 5000);
    } catch (err) {
      setStatus("failed");
      setError("Nätverksfel - försök igen");
      console.error("[VideoGenerator] Error:", err);
    }
  };

  // Reset to try again
  const handleReset = () => {
    setStatus("idle");
    setVideoUrl(null);
    setError(null);
    setProgress(null);

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  // Toggle video playback
  const togglePlayback = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-red-400" />
          <h3 className="font-semibold text-white">Videogenerering</h3>
          <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded">
            Sora
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Diamond className="h-3 w-3 text-amber-400" />
          <span className={cn(!canAfford && "text-red-400")}>{cost}</span>
        </div>
      </div>

      {/* Completed state - Video player */}
      {status === "completed" && videoUrl && (
        <div className="space-y-3">
          <div className="relative rounded-lg overflow-hidden bg-black border border-gray-800">
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full aspect-video"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            <button
              onClick={togglePlayback}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
            >
              {isPlaying ? (
                <Pause className="h-12 w-12 text-white" />
              ) : (
                <Play className="h-12 w-12 text-white" />
              )}
            </button>
          </div>

          <div className="flex gap-2">
            <a href={videoUrl} download className="flex-1">
              <Button
                variant="outline"
                className="w-full gap-2 border-gray-700"
              >
                <Download className="h-4 w-4" />
                Ladda ner
              </Button>
            </a>
            <Button
              variant="outline"
              onClick={handleReset}
              className="gap-2 border-gray-700"
            >
              <RefreshCw className="h-4 w-4" />
              Ny video
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle className="h-4 w-4" />
            Video klar!
          </div>
        </div>
      )}

      {/* Processing state */}
      {(status === "queued" || status === "in_progress") && (
        <div className="p-6 rounded-lg border border-gray-800 bg-gray-900/50">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-red-500/30 border-t-red-500 animate-spin" />
              <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-red-400" />
            </div>

            <div>
              <p className="font-medium text-white">
                {status === "queued" ? "I kö..." : "Genererar video..."}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Detta kan ta 1-2 minuter
              </p>
            </div>

            {progress !== null && (
              <div className="w-full max-w-xs">
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{progress}%</p>
              </div>
            )}

            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              <span>
                Uppskattad tid: {quality === "pro" ? "~2 min" : "~1 min"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {status === "failed" && (
        <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-400 font-medium">
                Videogenerering misslyckades
              </p>
              <p className="text-xs text-red-300/70 mt-1">
                {error || "Okänt fel"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="mt-2 text-red-400 hover:text-red-300"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Försök igen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Idle state - Input form */}
      {status === "idle" && (
        <div className="space-y-4">
          {/* Quality selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setQuality("fast")}
              className={cn(
                "flex-1 p-3 rounded-lg border transition-all text-left",
                quality === "fast"
                  ? "border-red-500 bg-red-500/10"
                  : "border-gray-700 hover:border-gray-600"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-white text-sm">Snabb</span>
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Diamond className="h-3 w-3" />
                  10
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">sora-2 • ~1 minut</p>
            </button>

            <button
              onClick={() => setQuality("pro")}
              className={cn(
                "flex-1 p-3 rounded-lg border transition-all text-left",
                quality === "pro"
                  ? "border-purple-500 bg-purple-500/10"
                  : "border-gray-700 hover:border-gray-600"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-white text-sm">Pro</span>
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Diamond className="h-3 w-3" />
                  15
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                sora-2-pro • ~2 minuter
              </p>
            </button>
          </div>

          {/* Prompt input */}
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Beskriv din video</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="En lugn video av soluppgång över havet med mjuka vågor..."
              rows={3}
              disabled={disabled}
              className="w-full px-4 py-3 bg-gray-800/80 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500 resize-none"
            />
            <p className="text-xs text-gray-500">
              Minst 10 tecken. Beskriv scen, rörelse, ljus och stämning.
            </p>
          </div>

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={
              disabled || !prompt.trim() || prompt.length < 10 || !canAfford
            }
            className={cn(
              "w-full gap-2",
              quality === "pro"
                ? "bg-purple-600 hover:bg-purple-500"
                : "bg-red-600 hover:bg-red-500"
            )}
          >
            <Video className="h-4 w-4" />
            Generera video
            <span className="flex items-center gap-1 text-xs opacity-80">
              <Diamond className="h-3 w-3" />
              {cost}
            </span>
          </Button>

          {!canAfford && (
            <p className="text-xs text-center text-red-400">
              Du behöver {cost} diamanter för att generera video
            </p>
          )}
        </div>
      )}
    </div>
  );
}
