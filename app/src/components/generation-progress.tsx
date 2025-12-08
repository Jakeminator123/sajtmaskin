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
  Gamepad2,
} from "lucide-react";
import { PongGame } from "./pong-game";
import { Button } from "@/components/ui/button";

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
}

export function GenerationProgress({
  isLoading,
  promptLength = 100,
  isRefinement = false,
  startTime,
}: GenerationProgressProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showGame, setShowGame] = useState(false);
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
      setShowGame(false);
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
    <div className="p-4 bg-gray-900/50 border border-gray-800 rounded-lg space-y-4">
      {/* Header with time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-600 rounded flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-200">
              {isRefinement
                ? "Förfinar din sida..."
                : "Skapar din webbplats..."}
            </p>
            <p className="text-xs text-gray-500">
              Uppskattad tid: ~{formatTime(estimatedTime)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <Clock className="h-4 w-4" />
          <span className="text-sm font-mono">{formatTime(elapsedTime)}</span>
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

      {/* Fun fact */}
      <div className="text-center py-2">
        <p className="text-xs text-gray-500 italic transition-opacity duration-500">
          {FUN_FACTS[currentFact]}
        </p>
      </div>

      {/* Game section (shows for long generations) */}
      {isLongGeneration && (
        <div className="border-t border-gray-800 pt-4">
          {!showGame ? (
            <div className="text-center space-y-2">
              <p className="text-sm text-gray-400">
                Detta kan ta en stund... 🕐
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGame(true)}
                className="border-gray-700 hover:bg-gray-800"
              >
                <Gamepad2 className="h-4 w-4 mr-2" />
                Spela Pong medan du väntar!
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  🏓 Underhållning medan du väntar
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowGame(false)}
                  className="h-6 px-2 text-xs text-gray-500 hover:text-gray-300"
                >
                  Stäng
                </Button>
              </div>
              <div className="flex justify-center">
                <PongGame compact />
              </div>
            </div>
          )}
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
