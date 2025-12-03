"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Play,
  Globe,
  Search,
  Sparkles,
  Building2,
  FileText,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

/**
 * OnboardingModal - Welcome modal for first-time visitors
 *
 * Features:
 * 1. Intro video with Swedish subtitles
 * 2. URL input with purpose selection
 * 3. Checkbox to analyze company from web
 * 4. Free text description field
 */

// URL purpose options
type UrlPurpose =
  | "improve" // Jag vill förbättra denna sida
  | "audit" // Jag vill enbart ha en audit
  | "inspiration"; // Jag vill ta inspiration från denna sida

interface OnboardingData {
  existingUrl: string;
  urlPurpose: UrlPurpose | null;
  analyzeFromWeb: boolean;
  description: string;
}

interface OnboardingModalProps {
  onComplete: (data: OnboardingData) => void;
  onSkip: () => void;
}

export function OnboardingModal({ onComplete, onSkip }: OnboardingModalProps) {
  const [step, setStep] = useState<"video" | "form">("video");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Form state
  const [existingUrl, setExistingUrl] = useState("");
  const [urlPurpose, setUrlPurpose] = useState<UrlPurpose | null>(null);
  const [showPurposeDropdown, setShowPurposeDropdown] = useState(false);
  const [analyzeFromWeb, setAnalyzeFromWeb] = useState(false);
  const [description, setDescription] = useState("");

  const handleVideoEnd = () => {
    setStep("form");
  };

  const handleSkipVideo = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setStep("form");
  };

  const handleSubmit = () => {
    localStorage.setItem("sajtmaskin_onboarding_seen", "true");
    onComplete({
      existingUrl,
      urlPurpose,
      analyzeFromWeb,
      description,
    });
  };

  const handleSkip = () => {
    localStorage.setItem("sajtmaskin_onboarding_seen", "true");
    onSkip();
  };

  const purposeLabels: Record<UrlPurpose, string> = {
    improve: "Jag vill förbättra denna sida",
    audit: "Jag vill enbart ha en audit av denna sida",
    inspiration: "Jag vill ta inspiration från denna sida (ej min)",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl mx-4">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* VIDEO STEP */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {step === "video" && (
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-400 text-sm mb-4">
                <Sparkles className="h-4 w-4" />
                Välkommen till SajtMaskin
              </div>
              <h2 className="text-2xl font-bold text-white">
                Din AI-partner för hemsidor
              </h2>
              <p className="text-zinc-400 mt-2">
                Se denna korta introduktion (ca 2 min)
              </p>
            </div>

            {/* Video player */}
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden mb-4">
              <video
                ref={videoRef}
                className="w-full h-full"
                controls
                autoPlay
                onEnded={handleVideoEnd}
              >
                <source src="/video/intro.mp4" type="video/mp4" />
                <track
                  kind="subtitles"
                  src="/video/intro.vtt"
                  srcLang="sv"
                  label="Svenska"
                  default
                />
                Din webbläsare stödjer inte video.
              </video>
            </div>

            {/* Skip button */}
            <div className="flex justify-center">
              <button
                onClick={handleSkipVideo}
                className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
              >
                Hoppa över videon
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* FORM STEP */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {step === "form" && (
          <div className="p-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white">
                Berätta om ditt projekt
              </h2>
              <p className="text-zinc-400 mt-2">Så kan vi hjälpa dig bättre</p>
            </div>

            <div className="space-y-6">
              {/* ─────────────────────────────────────────────────────────────── */}
              {/* FIELD 1: Existing URL */}
              {/* ─────────────────────────────────────────────────────────────── */}
              <div className="space-y-3">
                <label
                  htmlFor="existing-url"
                  className="flex items-center gap-2 text-sm font-medium text-zinc-300"
                >
                  <Globe className="h-4 w-4 text-emerald-500" />
                  Har du en befintlig webbplats?
                </label>

                <div className="flex gap-2">
                  <input
                    id="existing-url"
                    type="url"
                    value={existingUrl}
                    onChange={(e) => setExistingUrl(e.target.value)}
                    placeholder="https://ditt-foretag.se"
                    className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Purpose dropdown (only show if URL is entered) */}
                {existingUrl && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setShowPurposeDropdown(!showPurposeDropdown)
                      }
                      className="w-full flex items-center justify-between px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-left hover:border-zinc-600 transition-colors"
                    >
                      <span
                        className={urlPurpose ? "text-white" : "text-zinc-500"}
                      >
                        {urlPurpose
                          ? purposeLabels[urlPurpose]
                          : "Vad vill du göra med denna URL?"}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-zinc-400 transition-transform ${
                          showPurposeDropdown ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {showPurposeDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-10 overflow-hidden">
                        {(Object.keys(purposeLabels) as UrlPurpose[]).map(
                          (purpose) => (
                            <button
                              key={purpose}
                              type="button"
                              onClick={() => {
                                setUrlPurpose(purpose);
                                setShowPurposeDropdown(false);
                              }}
                              className={`w-full px-4 py-3 text-left hover:bg-zinc-700 transition-colors ${
                                urlPurpose === purpose
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "text-zinc-300"
                              }`}
                            >
                              {purposeLabels[purpose]}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ─────────────────────────────────────────────────────────────── */}
              {/* FIELD 2: Analyze from web checkbox */}
              {/* ─────────────────────────────────────────────────────────────── */}
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg cursor-pointer hover:border-zinc-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={analyzeFromWeb}
                    onChange={(e) => setAnalyzeFromWeb(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                  />
                  <div>
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Search className="h-4 w-4 text-blue-400" />
                      Analysera mitt företag från internet
                    </div>
                    <p className="text-sm text-zinc-400 mt-1">
                      Jag vill att min företagsprofil, kundsegment och annan
                      offentlig information hämtas och analyseras för att skapa
                      en bättre sajt.
                    </p>
                  </div>
                </label>
              </div>

              {/* ─────────────────────────────────────────────────────────────── */}
              {/* FIELD 3: Free text description */}
              {/* ─────────────────────────────────────────────────────────────── */}
              <div className="space-y-3">
                <label
                  htmlFor="project-description"
                  className="flex items-center gap-2 text-sm font-medium text-zinc-300"
                >
                  <FileText className="h-4 w-4 text-purple-400" />
                  Beskriv ditt projekt (valfritt)
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Beskriv vilken typ av sajt du vill skapa, ditt företag, din målgrupp, etc..."
                  rows={4}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              {/* ─────────────────────────────────────────────────────────────── */}
              {/* SUBMIT BUTTONS */}
              {/* ─────────────────────────────────────────────────────────────── */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
                >
                  Hoppa över
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
                >
                  <Building2 className="h-4 w-4" />
                  Kom igång
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hook to manage onboarding state
 */
export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(
    null
  );

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem(
      "sajtmaskin_onboarding_seen"
    );
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  const handleComplete = (data: OnboardingData) => {
    setOnboardingData(data);
    setShowOnboarding(false);
  };

  const handleSkip = () => {
    setShowOnboarding(false);
  };

  const resetOnboarding = () => {
    localStorage.removeItem("sajtmaskin_onboarding_seen");
    setShowOnboarding(true);
    setOnboardingData(null);
  };

  return {
    showOnboarding,
    onboardingData,
    handleComplete,
    handleSkip,
    resetOnboarding,
  };
}
