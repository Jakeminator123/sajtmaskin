"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  FileCode,
  Palette,
  Layout,
  ImageIcon,
  Wand2,
  CheckCircle2,
  Clock,
  Brain,
} from "lucide-react";

// Generation steps with realistic estimated times for v0 Platform API
// Total: ~120-180 seconds for initial generation (v0 API is thorough but takes time)
const GENERATION_STEPS = [
  {
    id: "analyze",
    label: "v0 analyserar din beskrivning",
    icon: Sparkles,
    minTime: 10,
    maxTime: 20,
  },
  {
    id: "design",
    label: "Designar layout och struktur",
    icon: Layout,
    minTime: 20,
    maxTime: 40,
  },
  {
    id: "components",
    label: "Skapar komponenter",
    icon: FileCode,
    minTime: 30,
    maxTime: 60,
  },
  {
    id: "styling",
    label: "Applicerar styling och färger",
    icon: Palette,
    minTime: 15,
    maxTime: 30,
  },
  {
    id: "images",
    label: "Hämtar bilder och media",
    icon: ImageIcon,
    minTime: 10,
    maxTime: 20,
  },
  {
    id: "finalize",
    label: "Kompilerar och skapar preview",
    icon: Wand2,
    minTime: 15,
    maxTime: 30,
  },
];

// Fun facts to show during loading
const FUN_FACTS = [
  "💡 v0 genererar produktionsklar kod - därför tar det 2-3 minuter!",
  "🎨 Tailwind CSS har över 14,000 utility-klasser att välja mellan!",
  "⚡ React renderar bara det som faktiskt ändras - smart, eller hur?",
  "🌐 v0 analyserar hundratals designmönster för att ge dig bästa resultatet",
  "🚀 Next.js driver över 500,000 webbplatser världen över",
  "✨ Varje generering använder de senaste AI-modellerna från Vercel",
  "🎯 En bra landing page kan öka konverteringar med upp till 300%",
  "📱 Alla genererade sidor är automatiskt responsiva",
  "⏳ v0 skapar även en hostad preview åt dig - det är därför det tar tid!",
];

interface GenerationProgressProps {
  isLoading: boolean;
  promptLength?: number;
  isRefinement?: boolean;
  startTime?: number;
  /** v0:s thinking/reasoning i realtid */
  thinking?: string[];
  /** Meddelande för aktuellt steg (från streaming) */
  streamingMessage?: string;
}

export function GenerationProgress({
  isLoading,
  promptLength = 100,
  isRefinement = false,
  startTime,
  thinking = [],
  streamingMessage,
}: GenerationProgressProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentFact, setCurrentFact] = useState(0);

  // Estimate total time based on prompt complexity
  const estimatedTime = useMemo(() => {
    // Base time: 120s for initial generation (v0 API can take 2-3 min), 30s for refinements
    // Real-world data shows initial generations take 90-180 seconds with v0 Platform API
    const baseTime = isRefinement ? 30 : 120;
    const complexityMultiplier = Math.min(promptLength / 100, 2);
    const estimated = baseTime + complexityMultiplier * 30;
    return Math.round(estimated);
  }, [promptLength, isRefinement]);

  // Determine if this is a "long" generation (show game option)
  // Show game option earlier since v0 API initial generations take 90-180+ seconds
  const isLongGeneration = estimatedTime > 60 || elapsedTime > 30;

  // Timer for elapsed time
  useEffect(() => {
    if (!isLoading) {
      setElapsedTime(0);
      setCurrentStep(0);
      return;
    }

    const start = startTime || Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading, startTime]);

  // Progress through steps based on elapsed time
  useEffect(() => {
    if (!isLoading) return;

    const totalSteps = GENERATION_STEPS.length;
    const timePerStep = estimatedTime / totalSteps;

    // Calculate current step based on elapsed time
    const calculatedStep = Math.min(
      Math.floor(elapsedTime / timePerStep),
      totalSteps - 1
    );

    // Add some randomness to make it feel more natural
    const adjustedStep = Math.min(
      calculatedStep + (Math.random() > 0.7 ? 1 : 0),
      totalSteps - 1
    );

    if (adjustedStep > currentStep) {
      setCurrentStep(adjustedStep);
    }
  }, [elapsedTime, isLoading, estimatedTime, currentStep]);

  // Rotate fun facts
  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      setCurrentFact((prev) => (prev + 1) % FUN_FACTS.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [isLoading]);

  // Format time display
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Calculate progress percentage
  const progressPercent = Math.min(
    ((currentStep + 1) / GENERATION_STEPS.length) * 100,
    95
  );

  if (!isLoading) return null;

  return (
    <div className="p-4 bg-gradient-to-br from-gray-900/80 to-gray-900/50 border border-gray-800/80 rounded-xl space-y-4 backdrop-blur-sm">
      {/* Header with time - v0 inspired */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Animated loader rings - v0 style */}
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 border-2 border-teal-500/30 rounded-lg animate-ping" />
            <div className="absolute inset-1 border-2 border-teal-500/40 rounded-lg animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center bg-teal-600/20 rounded-lg backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-teal-400 animate-pulse" />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-100">
              {isRefinement
                ? "Förfinar din sida..."
                : "Skapar din webbplats..."}
            </p>
            <p className="text-xs text-gray-500">
              Uppskattad tid: ~{formatTime(estimatedTime)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg border border-gray-700/50">
          <Clock className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-sm font-mono text-gray-300">{formatTime(elapsedTime)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-600 to-teal-400 transition-all duration-1000 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-teal-400/50 to-transparent animate-pulse"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Custom step message from streaming */}
      {streamingMessage && (
        <div className="flex items-center justify-center gap-2 py-1">
          <div className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-pulse" />
          <span className="text-xs text-teal-400">{streamingMessage}</span>
        </div>
      )}

      {/* Steps */}
      <div className="grid grid-cols-3 gap-2">
        {GENERATION_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = index === currentStep;
          const isComplete = index < currentStep;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-2 p-2 rounded transition-all duration-300 ${
                isActive
                  ? "bg-teal-600/20 border border-teal-500/30"
                  : isComplete
                  ? "bg-gray-800/50 opacity-60"
                  : "opacity-30"
              }`}
            >
              {isComplete ? (
                <CheckCircle2 className="h-4 w-4 text-teal-500 flex-shrink-0" />
              ) : (
                <Icon
                  className={`h-4 w-4 flex-shrink-0 ${
                    isActive ? "text-teal-400 animate-pulse" : "text-gray-500"
                  }`}
                />
              )}
              <span
                className={`text-xs truncate ${
                  isActive
                    ? "text-gray-200"
                    : isComplete
                    ? "text-gray-400"
                    : "text-gray-600"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* AI Thinking - show when we have thinking data */}
      {thinking.length > 0 && (
        <div className="border-t border-gray-800/50 pt-3 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
            <span className="text-xs font-medium text-purple-300">AI-resonemang</span>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1.5 pr-2 scrollbar-thin">
            {thinking.slice(-5).map((thought, i) => (
              <div 
                key={i} 
                className={`text-xs leading-relaxed pl-3 border-l-2 ${
                  i === thinking.length - 1 
                    ? "text-purple-200 border-purple-500" 
                    : "text-gray-500 border-gray-700"
                }`}
              >
                {thought.split("\n").map((line, j) => (
                  <p key={j} className={j > 0 ? "mt-0.5" : ""}>{line}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fun fact - only show when no thinking */}
      {thinking.length === 0 && (
        <div className="text-center py-2">
          <p className="text-xs text-gray-500 italic transition-opacity duration-500">
            {FUN_FACTS[currentFact]}
          </p>
        </div>
      )}

      {/* Patience message for long generations */}
      {isLongGeneration && (
        <div className="border-t border-gray-800 pt-4 text-center">
          <p className="text-sm text-gray-400">
            Detta kan ta en stund... ☕ Ta en kaffe medan du väntar!
          </p>
        </div>
      )}

      {/* Patience message for very long generations */}
      {elapsedTime > 180 && (
        <div className="text-center">
          <p className="text-xs text-amber-500/80">
            ⏳ Komplex sida - v0 jobbar fortfarande! Häng kvar, resultatet blir
            värt väntan.
          </p>
        </div>
      )}
    </div>
  );
}
