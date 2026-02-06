"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Globe,
  Search,
  Wand2,
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
    if (typeof window !== "undefined") {
      localStorage.setItem("sajtmaskin_onboarding_seen", "true");
    }
    onComplete({
      existingUrl,
      urlPurpose,
      analyzeFromWeb,
      description,
    });
  };

  const handleSkip = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sajtmaskin_onboarding_seen", "true");
    }
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
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleSkip} />

      {/* Modal */}
      <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-gray-800 bg-black shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 p-2 text-gray-400 transition-colors hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* VIDEO STEP */}
        {step === "video" && (
          <div className="p-6">
            <div className="mb-6 text-center">
              <div className="bg-brand-teal/10 border-brand-teal/30 text-brand-teal mb-4 inline-flex items-center gap-2 border px-4 py-2 text-sm">
                <Wand2 className="h-4 w-4" />
                Välkommen till SajtMaskin
              </div>
              <h2 className="text-2xl font-bold text-white">Din AI-partner för hemsidor</h2>
              <p className="mt-2 text-gray-400">Se denna korta introduktion (ca 2 min)</p>
            </div>

            {/* Video player */}
            <div className="relative mb-4 aspect-video overflow-hidden border border-gray-800 bg-black">
              <video
                ref={videoRef}
                className="h-full w-full"
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
                  default={true}
                />
                Din webbläsare stödjer inte video.
              </video>
            </div>

            {/* Skip button */}
            <div className="flex justify-center">
              <button
                onClick={handleSkipVideo}
                className="flex items-center gap-2 border border-gray-800 bg-gray-900 px-6 py-3 text-gray-300 transition-colors hover:bg-gray-800"
              >
                Hoppa över videon
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* FORM STEP */}
        {step === "form" && (
          <div className="p-6">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-white">Berätta om ditt projekt</h2>
              <p className="mt-2 text-gray-400">Så kan vi hjälpa dig bättre</p>
            </div>

            <div className="space-y-6">
              {/* FIELD 1: Existing URL */}
              <div className="space-y-3">
                <label
                  htmlFor="existing-url"
                  className="flex items-center gap-2 text-sm font-medium text-gray-300"
                >
                  <Globe className="text-brand-teal h-4 w-4" />
                  Har du en befintlig webbplats?
                </label>

                <div className="flex gap-2">
                  <input
                    id="existing-url"
                    type="url"
                    value={existingUrl}
                    onChange={(e) => setExistingUrl(e.target.value)}
                    placeholder="https://ditt-foretag.se"
                    className="focus:border-brand-teal focus:ring-brand-teal flex-1 border border-gray-800 bg-black px-4 py-3 text-white placeholder-gray-500 focus:ring-1 focus:outline-none"
                  />
                </div>

                {/* Purpose dropdown (only show if URL is entered) */}
                {existingUrl && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPurposeDropdown(!showPurposeDropdown)}
                      className="flex w-full items-center justify-between border border-gray-800 bg-black px-4 py-3 text-left transition-colors hover:border-gray-700"
                    >
                      <span className={urlPurpose ? "text-white" : "text-gray-500"}>
                        {urlPurpose ? purposeLabels[urlPurpose] : "Vad vill du göra med denna URL?"}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-gray-400 transition-transform ${
                          showPurposeDropdown ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {showPurposeDropdown && (
                      <div className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden border border-gray-800 bg-black shadow-xl">
                        {(Object.keys(purposeLabels) as UrlPurpose[]).map((purpose) => (
                          <button
                            key={purpose}
                            type="button"
                            onClick={() => {
                              setUrlPurpose(purpose);
                              setShowPurposeDropdown(false);
                            }}
                            className={`w-full px-4 py-3 text-left transition-colors hover:bg-gray-900 ${
                              urlPurpose === purpose
                                ? "bg-brand-teal/10 text-brand-teal"
                                : "text-gray-300"
                            }`}
                          >
                            {purposeLabels[purpose]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* FIELD 2: Analyze from web checkbox */}
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start gap-3 border border-gray-800 bg-gray-900/50 p-4 transition-colors hover:border-gray-700">
                  <input
                    type="checkbox"
                    checked={analyzeFromWeb}
                    onChange={(e) => setAnalyzeFromWeb(e.target.checked)}
                    className="text-brand-teal focus:ring-brand-teal mt-1 h-5 w-5 border-gray-700 bg-black focus:ring-offset-0"
                  />
                  <div>
                    <div className="flex items-center gap-2 font-medium text-white">
                      <Search className="text-brand-teal h-4 w-4" />
                      Analysera mitt företag från internet
                    </div>
                    <p className="mt-1 text-sm text-gray-400">
                      Jag vill att min företagsprofil, kundsegment och annan offentlig information
                      hämtas och analyseras för att skapa en bättre sajt.
                    </p>
                  </div>
                </label>
              </div>

              {/* FIELD 3: Free text description */}
              <div className="space-y-3">
                <label
                  htmlFor="project-description"
                  className="flex items-center gap-2 text-sm font-medium text-gray-300"
                >
                  <FileText className="h-4 w-4 text-gray-400" />
                  Beskriv ditt projekt (valfritt)
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Beskriv vilken typ av sajt du vill skapa, ditt företag, din målgrupp, etc..."
                  rows={4}
                  className="focus:border-brand-teal focus:ring-brand-teal w-full resize-none border border-gray-800 bg-black px-4 py-3 text-white placeholder-gray-500 focus:ring-1 focus:outline-none"
                />
              </div>

              {/* SUBMIT BUTTONS */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="flex-1 border border-gray-800 bg-gray-900 px-6 py-3 text-gray-300 transition-colors hover:bg-gray-800"
                >
                  Hoppa över
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="bg-brand-teal hover:bg-brand-teal/90 flex flex-1 items-center justify-center gap-2 px-6 py-3 font-medium text-white transition-colors"
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
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasSeenOnboarding = localStorage.getItem("sajtmaskin_onboarding_seen");
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
    if (typeof window !== "undefined") {
      localStorage.removeItem("sajtmaskin_onboarding_seen");
    }
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
