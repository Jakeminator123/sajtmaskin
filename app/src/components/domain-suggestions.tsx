"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Globe,
  Check,
  X,
  Loader2,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Diamond,
} from "lucide-react";

interface DomainSuggestion {
  domain: string;
  available: boolean | null;
  tld: string;
}

interface DomainSuggestionsProps {
  companyName?: string;
  industry?: string;
  onClose?: () => void;
  isOpen: boolean;
}

// Free searches per session
const FREE_SEARCHES = 3;

export function DomainSuggestions({
  companyName: initialCompanyName = "",
  industry = "",
  onClose,
  isOpen,
}: DomainSuggestionsProps) {
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [suggestions, setSuggestions] = useState<DomainSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchCount, setSearchCount] = useState(0);

  const fetchSuggestions = useCallback(
    async (name: string) => {
      if (!name.trim()) return;

      // Track search count
      setSearchCount((prev) => prev + 1);

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/domain-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName: name,
            industry,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch suggestions");
        }

        const data = await response.json();
        setSuggestions(data.suggestions || []);
      } catch (err) {
        console.error("Domain suggestions error:", err);
        setError("Kunde inte hämta domänförslag. Försök igen.");
      } finally {
        setIsLoading(false);
      }
    },
    [industry]
  );

  // Get remaining free searches
  const remainingSearches = Math.max(0, FREE_SEARCHES - searchCount);

  // Fetch suggestions when opened with a company name
  useEffect(() => {
    if (
      isOpen &&
      initialCompanyName &&
      suggestions.length === 0 &&
      !isLoading
    ) {
      fetchSuggestions(initialCompanyName);
    }
  }, [
    isOpen,
    initialCompanyName,
    suggestions.length,
    isLoading,
    fetchSuggestions,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSuggestions(companyName);
  };

  const getRegistrarUrl = (domain: string) => {
    // Link to a registrar search
    const tld = domain.split(".").pop();
    if (tld === "se") {
      return `https://www.iis.se/domaner/domannamn/?domain=${domain}`;
    }
    return `https://www.namecheap.com/domains/registration/results/?domain=${domain}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gradient-to-r from-teal-600/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-600/20 flex items-center justify-center">
              <Globe className="h-5 w-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-100">
                Domänförslag
              </h2>
              <p className="text-xs text-gray-500">
                AI-genererade namn med tillgänglighetskoll
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Free searches indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 rounded-md">
              <Diamond className="h-3.5 w-3.5 text-teal-400" />
              <span className="text-xs text-gray-400">
                {remainingSearches > 0
                  ? `${remainingSearches} gratis`
                  : "Obegränsat"}
              </span>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="p-4 border-b border-gray-800">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="Företagsnamn eller projektnamn..."
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="flex-1 bg-gray-800 border-gray-700 text-gray-200 placeholder:text-gray-500"
            />
            <Button
              type="submit"
              disabled={isLoading || !companyName.trim()}
              className="bg-teal-600 hover:bg-teal-500 gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Sök
            </Button>
          </div>
        </form>

        {/* Results */}
        <div className="p-4 max-h-[400px] overflow-y-auto">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
              <p className="text-sm text-gray-400">
                Genererar och kollar domäner...
              </p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm mb-3">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchSuggestions(companyName)}
                className="gap-2 border-gray-700"
              >
                <RefreshCw className="h-4 w-4" />
                Försök igen
              </Button>
            </div>
          )}

          {!isLoading && !error && suggestions.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                Skriv ditt företagsnamn och klicka Sök för att få domänförslag
              </p>
            </div>
          )}

          {!isLoading && suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.domain}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-800 hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Status Icon */}
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        suggestion.available === true
                          ? "bg-green-500/20"
                          : suggestion.available === false
                          ? "bg-red-500/20"
                          : "bg-gray-700"
                      }`}
                    >
                      {suggestion.available === true ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : suggestion.available === false ? (
                        <X className="h-4 w-4 text-red-400" />
                      ) : (
                        <span className="text-gray-500 text-xs">?</span>
                      )}
                    </div>

                    {/* Domain Name */}
                    <div>
                      <p className="font-medium text-gray-200">
                        {suggestion.domain}
                      </p>
                      <p
                        className={`text-xs ${
                          suggestion.available === true
                            ? "text-green-400"
                            : suggestion.available === false
                            ? "text-red-400"
                            : "text-gray-500"
                        }`}
                      >
                        {suggestion.available === true
                          ? "Verkar ledig!"
                          : suggestion.available === false
                          ? "Upptagen"
                          : "Kunde ej verifiera"}
                      </p>
                    </div>
                  </div>

                  {/* Action Button */}
                  <a
                    href={getRegistrarUrl(suggestion.domain)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                      suggestion.available === true
                        ? "bg-teal-600 hover:bg-teal-500 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-300"
                    }`}
                  >
                    {suggestion.available === true ? "Registrera" : "Kolla"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50">
          <p className="text-xs text-gray-500 text-center">
            Tillgänglighet är ungefärlig - verifiera alltid hos registrar
          </p>
        </div>
      </div>
    </div>
  );
}

// Compact inline version for showing in chat
interface DomainSuggestionsInlineProps {
  companyName: string;
}

export function DomainSuggestionsInline({
  companyName,
}: DomainSuggestionsInlineProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-400 text-sm transition-colors"
      >
        <Globe className="h-4 w-4" />
        Hitta domännamn
      </button>

      <DomainSuggestions
        companyName={companyName}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
