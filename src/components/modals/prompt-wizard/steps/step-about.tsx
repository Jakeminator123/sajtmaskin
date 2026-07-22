"use client";

import type { Dispatch, SetStateAction } from "react";
import { Building2, Check, ExternalLink, Globe, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceRecorder } from "@/components/forms/voice-recorder";
import { LocationPicker } from "@/components/modals/location-picker";
import { INDUSTRY_OPTIONS, INPUT_CLASS } from "@/components/modals/prompt-wizard/constants";
import type { ScrapedData } from "@/components/modals/prompt-wizard/types";

/** STEP 1: About You (moved verbatim from the prompt-wizard-modal-v2 monolith). */
export function StepAbout({
  companyName,
  setCompanyName,
  industry,
  handleIndustryChange,
  location,
  locationLat,
  locationLng,
  setLocation,
  setLocationLat,
  setLocationLng,
  existingWebsite,
  setExistingWebsite,
  handleScrapeWebsite,
  isScraping,
  scrapedData,
}: {
  companyName: string;
  setCompanyName: Dispatch<SetStateAction<string>>;
  industry: string;
  handleIndustryChange: (newIndustry: string) => void;
  location: string;
  locationLat: number | undefined;
  locationLng: number | undefined;
  setLocation: Dispatch<SetStateAction<string>>;
  setLocationLat: Dispatch<SetStateAction<number | undefined>>;
  setLocationLng: Dispatch<SetStateAction<number | undefined>>;
  existingWebsite: string;
  setExistingWebsite: Dispatch<SetStateAction<string>>;
  handleScrapeWebsite: (url: string) => void;
  isScraping: boolean;
  scrapedData: ScrapedData | null;
}) {
  return (
    <div className="space-y-6">
      {/* Company Name */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Building2 className="h-4 w-4 text-primary" />
          Företagsnamn *
        </label>
        <input
          data-openclaw-text-target="wizard.about.company_name"
          data-openclaw-text-label="Wizard: företagsnamn"
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Ditt företag eller projekt..."
          className={INPUT_CLASS}
          autoFocus
        />
      </div>

      {/* Industry Grid */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Bransch *</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {INDUSTRY_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => handleIndustryChange(option.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 transition-all ${
                industry === option.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/30 bg-card/50 text-muted-foreground hover:border-primary/30 hover:text-foreground hover:bg-card/80"
              }`}
            >
              <option.icon className="h-5 w-5" />
              <span className="text-center text-xs">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Globe className="h-4 w-4 text-primary" />
          Plats <span className="font-normal text-muted-foreground">(valfritt)</span>
        </label>
        <LocationPicker
          value={location}
          lat={locationLat}
          lng={locationLng}
          onLocationChange={(name, lat, lng) => {
            setLocation(name);
            setLocationLat(lat || undefined);
            setLocationLng(lng || undefined);
          }}
          inputClassName={INPUT_CLASS}
        />
      </div>

      {/* Existing Website with Scraper */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ExternalLink className="h-4 w-4 text-primary" />
          Befintlig hemsida?{" "}
          <span className="font-normal text-muted-foreground">(valfritt - vi analyserar den)</span>
        </label>
        <div className="flex gap-2">
          <input
            data-openclaw-text-target="wizard.about.existing_website"
            data-openclaw-text-label="Wizard: befintlig hemsida"
            type="url"
            value={existingWebsite}
            onChange={(e) => setExistingWebsite(e.target.value)}
            placeholder="https://dinhemsida.se"
            className={INPUT_CLASS + " flex-1"}
          />
          {existingWebsite && (
            <Button
              onClick={() => handleScrapeWebsite(existingWebsite)}
              disabled={isScraping}
              variant="outline"
              size="sm"
              className="shrink-0 gap-1"
            >
              {isScraping ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Analysera
            </Button>
          )}
        </div>

        {/* Background analysis indicator */}
        {isScraping && !scrapedData && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
            <div className="flex-1">
              <p className="text-xs font-medium text-primary">Analyserar i bakgrunden...</p>
              <p className="text-[10px] text-muted-foreground">Du kan fortsätta till nästa steg medan vi jobbar</p>
            </div>
          </div>
        )}

        {/* Scraped data card */}
        {scrapedData && (
          <div className="animate-in fade-in slide-in-from-bottom-2 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2 duration-300">
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <Check className="h-3.5 w-3.5" />
              Vi hittade din sida
            </div>
            {scrapedData.title && (
              <p className="text-sm text-foreground">{scrapedData.title}</p>
            )}
            {scrapedData.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{scrapedData.description}</p>
            )}
            <div className="flex gap-3 text-xs text-muted-foreground">
              {scrapedData.wordCount != null && <span>{scrapedData.wordCount} ord</span>}
              {(scrapedData.headings?.length ?? 0) > 0 && (
                <span>{scrapedData.headings!.length} sektioner</span>
              )}
              {scrapedData.hasImages && <span>Har bilder</span>}
            </div>
          </div>
        )}
      </div>

      {/* Voice input */}
      <div className="flex items-center gap-3">
        <VoiceRecorder
          compact
          onTranscript={(text) =>
            setCompanyName((prev) => (prev ? `${prev} ${text}` : text))
          }
        />
        <span className="text-xs text-muted-foreground">Eller berätta med rösten</span>
      </div>
    </div>
  );
}
