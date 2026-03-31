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
import { Switch } from "@/components/ui/switch";

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
      <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-border bg-card shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {/* VIDEO STEP */}
        {step === "video" && (
          <div className="p-6">
            <div className="mb-6 text-center">
              <div className="bg-primary/10 border-primary/30 text-primary mb-4 inline-flex items-center gap-2 border px-4 py-2 text-sm">
                <Wand2 className="h-4 w-4" />
                Välkommen till SajtMaskin
              </div>
              <h2 className="text-2xl font-bold text-foreground">Din AI-partner för hemsidor</h2>
              <p className="mt-2 text-muted-foreground">Se denna korta introduktion (ca 2 min)</p>
            </div>

            {/* Video player */}
            <div className="relative mb-4 aspect-video overflow-hidden border border-border bg-card">
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
                className="flex items-center gap-2 border border-border bg-muted px-6 py-3 text-foreground transition-colors hover:bg-muted"
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
              <h2 className="text-2xl font-bold text-foreground">Berätta om ditt projekt</h2>
              <p className="mt-2 text-muted-foreground">Så kan vi hjälpa dig bättre</p>
            </div>

            <div className="space-y-6">
              {/* FIELD 1: Existing URL */}
              <div className="space-y-3">
                <label
                  htmlFor="existing-url"
                  className="flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  <Globe className="text-primary h-4 w-4" />
                  Har du en befintlig webbplats?
                </label>

                <div className="flex gap-2">
                  <input
                    id="existing-url"
                    type="url"
                    value={existingUrl}
                    onChange={(e) => setExistingUrl(e.target.value)}
                    placeholder="https://ditt-foretag.se"
                    className="focus:border-primary focus:ring-primary flex-1 border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:outline-none"
                  />
                </div>

                {/* Purpose dropdown (only show if URL is entered) */}
                {existingUrl && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPurposeDropdown(!showPurposeDropdown)}
                      className="flex w-full items-center justify-between border border-border bg-background px-4 py-3 text-left transition-colors hover:border-border"
                    >
                      <span className={urlPurpose ? "text-foreground" : "text-muted-foreground"}>
                        {urlPurpose ? purposeLabels[urlPurpose] : "Vad vill du göra med denna URL?"}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${
                          showPurposeDropdown ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {showPurposeDropdown && (
                      <div className="absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden border border-border bg-card shadow-xl">
                        {(Object.keys(purposeLabels) as UrlPurpose[]).map((purpose) => (
                          <button
                            key={purpose}
                            type="button"
                            onClick={() => {
                              setUrlPurpose(purpose);
                              setShowPurposeDropdown(false);
                            }}
                            className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted ${
                              urlPurpose === purpose
                                ? "bg-primary/10 text-primary"
                                : "text-foreground"
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

              {/* FIELD 2: Analyze from web toggle */}
              <div className="space-y-3">
                <label
                  htmlFor="analyze-web"
                  className="flex cursor-pointer items-start gap-3 border border-border bg-muted/50 p-4 transition-colors hover:border-border"
                >
                  <Switch
                    id="analyze-web"
                    checked={analyzeFromWeb}
                    onCheckedChange={setAnalyzeFromWeb}
                    className="mt-1"
                  />
                  <div>
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Search className="text-primary h-4 w-4" />
                      Analysera mitt företag från internet
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
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
                  className="flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Beskriv ditt projekt (valfritt)
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Beskriv vilken typ av sajt du vill skapa, ditt företag, din målgrupp, etc..."
                  rows={4}
                  className="focus:border-primary focus:ring-primary w-full resize-none border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:ring-1 focus:outline-none"
                />
              </div>

              {/* SUBMIT BUTTONS */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="flex-1 border border-border bg-muted px-6 py-3 text-foreground transition-colors hover:bg-muted"
                >
                  Hoppa över
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="bg-primary hover:bg-primary/90 flex flex-1 items-center justify-center gap-2 px-6 py-3 font-medium text-primary-foreground transition-colors"
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
