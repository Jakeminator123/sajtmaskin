"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Check,
  Globe,
  Loader2,
  Search,
  Download,
  Rocket,
  FileCode,
  Lock,
  Settings,
  Tag,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

interface DomainResult {
  domain: string;
  available: boolean | null;
  tld: string;
}

interface DomainPrice {
  price: number;
  currency: string;
  loading?: boolean;
  vercelCost?: number;
}

interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface FinalizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (includeBackoffice: boolean, password?: string) => void;
  onPublish?: (includeBackoffice: boolean, password?: string) => void;
  projectTitle?: string;
  projectId?: string;
  fileCount?: number;
  isDownloading?: boolean;
  isPublishing?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_PASSWORD_LENGTH = 6;

const INITIAL_CONTACT_INFO: ContactInfo = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address1: "",
  city: "",
  state: "",
  zip: "",
  country: "SE",
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Project summary card */
function ProjectSummary({ title, fileCount }: { title: string; fileCount: number }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
      <div className="flex items-center gap-3">
        <FileCode className="text-brand-teal h-5 w-5" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-white">{title}</p>
          <p className="text-xs text-gray-500">{fileCount} filer</p>
        </div>
      </div>
    </div>
  );
}

/** Backoffice toggle with password input */
function BackofficeSection({
  enabled,
  onToggle,
  password,
  onPasswordChange,
}: {
  enabled: boolean;
  onToggle: () => void;
  password: string;
  onPasswordChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div
        onClick={onToggle}
        className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
          enabled ? "border-brand-teal bg-brand-teal/10" : "border-gray-700 hover:border-gray-600"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
              enabled ? "border-brand-teal bg-brand-teal" : "border-gray-600"
            }`}
          >
            {enabled && <Check className="h-3 w-3 text-white" />}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Settings className="text-brand-teal h-4 w-4" />
              <span className="text-sm font-medium text-white">Inkludera Admin-panel</span>
              <span className="bg-brand-teal/20 text-brand-teal rounded px-1.5 py-0.5 text-[10px]">
                Rekommenderas
              </span>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              Redigera texter, bilder och färger på{" "}
              <code className="text-brand-teal">/backoffice</code>
            </p>
          </div>
        </div>
      </div>

      {/* Password input */}
      {enabled && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/30 p-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-300">Välj lösenord</span>
            <div className="relative mt-2">
              <Lock className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="Minst 6 tecken"
                className="focus:border-brand-teal w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pr-4 pl-9 text-sm text-white placeholder-gray-500 focus:outline-none"
              />
            </div>
          </label>
          {password.length > 0 && password.length < MIN_PASSWORD_LENGTH && (
            <p className="text-brand-amber mt-2 text-xs">
              Lösenordet måste vara minst {MIN_PASSWORD_LENGTH} tecken
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Download action button */
function DownloadAction({
  onDownload,
  isDownloading,
  disabled,
  includeBackoffice,
}: {
  onDownload: () => void;
  isDownloading: boolean;
  disabled: boolean;
  includeBackoffice: boolean;
}) {
  return (
    <div className="from-brand-teal/20 to-brand-warm/20 border-brand-teal/30 rounded-xl border bg-gradient-to-r p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Ladda ner sajt</h3>
          <p className="mt-0.5 text-xs text-gray-400">
            {includeBackoffice ? "Med admin-panel" : "Utan admin-panel"}
          </p>
        </div>
        <Button
          onClick={onDownload}
          disabled={isDownloading || disabled}
          className="bg-brand-teal hover:bg-brand-teal/90 shrink-0 gap-2 text-white"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Ladda ner
        </Button>
      </div>
    </div>
  );
}

/** Collapsible domain section */
function DomainSection({
  projectId,
  onPurchaseSuccess,
}: {
  projectId?: string;
  onPurchaseSuccess: (domain: string, url: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [domainResults, setDomainResults] = useState<DomainResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [domainPrices, setDomainPrices] = useState<Record<string, DomainPrice>>({});
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);

  // Search for domain
  const handleSearch = useCallback(async () => {
    if (!domainInput.trim()) return;

    let domain = domainInput.toLowerCase().trim();
    if (!domain.includes(".")) domain += ".se";

    setIsSearching(true);

    try {
      const res = await fetch("/api/domain-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: domain.split(".")[0] }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.suggestions?.length > 0) {
          setDomainResults(data.suggestions.slice(0, 6));
        }
      }
    } catch (err) {
      console.error("Domain search failed:", err);
    } finally {
      setIsSearching(false);
    }
  }, [domainInput]);

  // Fetch prices for available domains
  useEffect(() => {
    const availableDomains = domainResults.filter((r) => r.available === true);

    availableDomains.forEach(async (result) => {
      if (domainPrices[result.domain]) return;

      setDomainPrices((prev) => ({
        ...prev,
        [result.domain]: { price: 0, currency: "SEK", loading: true },
      }));

      try {
        const res = await fetch(
          `/api/vercel/domains/price?domain=${encodeURIComponent(result.domain)}`,
        );
        const data = await res.json();
        if (data.success) {
          setDomainPrices((prev) => ({
            ...prev,
            [result.domain]: {
              price: data.price,
              vercelCost: data.vercelCost,
              currency: data.currency || "SEK",
              loading: false,
            },
          }));
        }
      } catch {
        setDomainPrices((prev) => ({
          ...prev,
          [result.domain]: { price: 0, currency: "SEK", loading: false },
        }));
      }
    });
  }, [domainResults, domainPrices]);

  const handleSelectDomain = (domain: string) => {
    setSelectedDomain(domain);
    setShowPurchaseForm(true);
  };

  const handleCancelPurchase = () => {
    setSelectedDomain(null);
    setShowPurchaseForm(false);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800">
      {/* Header - clickable to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-gray-800/30"
      >
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-400">Valfritt: Köp egen domän</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="space-y-4 p-4 pt-0">
          {/* Search form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex gap-2"
          >
            <Input
              type="text"
              placeholder="t.ex. minsite.se"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              className="flex-1 border-gray-700 bg-gray-800 text-gray-200 placeholder:text-gray-500"
            />
            <Button
              type="submit"
              disabled={isSearching || !domainInput.trim()}
              className="bg-gray-700 px-3 hover:bg-gray-600"
            >
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </form>

          {/* Results */}
          {domainResults.length > 0 && !showPurchaseForm && (
            <div className="space-y-2">
              {domainResults.map((result) => (
                <DomainResultItem
                  key={result.domain}
                  result={result}
                  price={domainPrices[result.domain]}
                  onSelect={() => handleSelectDomain(result.domain)}
                  canPurchase={!!projectId && result.available === true}
                />
              ))}
            </div>
          )}

          {/* Purchase form */}
          {showPurchaseForm && selectedDomain && projectId && (
            <DomainPurchaseForm
              domain={selectedDomain}
              projectId={projectId}
              onCancel={handleCancelPurchase}
              onSuccess={(url) => onPurchaseSuccess(selectedDomain, url)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Single domain result item */
function DomainResultItem({
  result,
  price,
  onSelect,
  canPurchase,
}: {
  result: DomainResult;
  price?: DomainPrice;
  onSelect: () => void;
  canPurchase: boolean;
}) {
  const isAvailable = result.available === true;
  const isTaken = result.available === false;

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/50 p-3">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
            isAvailable ? "bg-green-500/20" : isTaken ? "bg-red-500/20" : "bg-gray-700"
          }`}
        >
          {isAvailable ? (
            <Check className="h-3 w-3 text-green-400" />
          ) : isTaken ? (
            <X className="h-3 w-3 text-red-400" />
          ) : (
            <span className="text-[10px] text-gray-500">?</span>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-200">{result.domain}</p>
          <p
            className={`text-[10px] ${
              isAvailable ? "text-green-400" : isTaken ? "text-red-400" : "text-gray-500"
            }`}
          >
            {isAvailable ? "Ledig" : isTaken ? "Upptagen" : "Okänd status"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isAvailable && price && (
          <span className="text-brand-teal flex items-center gap-1 text-xs">
            <Tag className="h-3 w-3" />
            {price.loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : price.price > 0 ? (
              `${price.price} ${price.currency}/år`
            ) : (
              "—"
            )}
          </span>
        )}
        {isAvailable && (
          <Button
            size="sm"
            onClick={onSelect}
            disabled={!canPurchase}
            className="bg-brand-teal hover:bg-brand-teal/90 h-7 px-2 text-xs"
          >
            Välj
          </Button>
        )}
        {!isAvailable && !isTaken && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              window.open(`https://vercel.com/domains?search=${result.domain}`, "_blank")
            }
            className="h-7 border-gray-700 px-2 text-xs text-gray-400"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Domain purchase form */
function DomainPurchaseForm({
  domain,
  projectId,
  onCancel,
  onSuccess,
}: {
  domain: string;
  projectId: string;
  onCancel: () => void;
  onSuccess: (url: string) => void;
}) {
  const [contact, setContact] = useState<ContactInfo>(INITIAL_CONTACT_INFO);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (field: keyof ContactInfo, value: string) => {
    setContact((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Normalize and validate
    const normalized = {
      ...contact,
      firstName: contact.firstName.trim(),
      lastName: contact.lastName.trim(),
      email: contact.email.trim(),
      phone: contact.phone.trim(),
      address1: contact.address1.trim(),
      city: contact.city.trim(),
      zip: contact.zip.trim(),
      country: contact.country.trim() || "SE",
      state: contact.state.trim() || contact.city.trim() || "-",
    };

    const required = ["firstName", "lastName", "email", "phone", "address1", "city", "zip"];
    for (const field of required) {
      if (!normalized[field as keyof ContactInfo]) {
        setError(`Fyll i ${field}`);
        return;
      }
    }

    setIsPurchasing(true);
    setError(null);

    try {
      const res = await fetch("/api/vercel/purchase-and-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          domain,
          years: 1,
          contactInfo: normalized,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Köpet misslyckades");

      onSuccess(data.customDomainUrl || data.deploymentUrl);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Publicering misslyckades. Kontrollera din anslutning och försök igen.",
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-700 bg-gray-800/50 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">Köp {domain}</h4>
        <button onClick={onCancel} className="text-gray-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <InputField
          label="Förnamn"
          value={contact.firstName}
          onChange={(v) => updateField("firstName", v)}
        />
        <InputField
          label="Efternamn"
          value={contact.lastName}
          onChange={(v) => updateField("lastName", v)}
        />
        <InputField
          label="E-post"
          type="email"
          value={contact.email}
          onChange={(v) => updateField("email", v)}
          className="col-span-2"
        />
        <InputField
          label="Telefon"
          type="tel"
          value={contact.phone}
          onChange={(v) => updateField("phone", v)}
          className="col-span-2"
        />
        <InputField
          label="Adress"
          value={contact.address1}
          onChange={(v) => updateField("address1", v)}
          className="col-span-2"
        />
        <InputField label="Stad" value={contact.city} onChange={(v) => updateField("city", v)} />
        <InputField label="Postnr" value={contact.zip} onChange={(v) => updateField("zip", v)} />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isPurchasing}
          className="flex-1 border-gray-700 text-gray-300"
        >
          Avbryt
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isPurchasing}
          className="bg-brand-teal hover:bg-brand-teal/90 flex-1 gap-2 text-white"
        >
          {isPurchasing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Köper...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              Köp & deploya
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/** Simple input field */
function InputField({
  label,
  type = "text",
  value,
  onChange,
  className = "",
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs text-gray-400">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-gray-700 bg-gray-800 text-sm text-gray-200"
      />
    </div>
  );
}

/** Success message */
function SuccessMessage({ domain, url }: { domain: string; url: string }) {
  return (
    <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4">
      <div className="flex items-start gap-3">
        <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
        <div>
          <h4 className="text-sm font-medium text-green-400">{domain} är nu live!</h4>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-teal hover:text-brand-teal/80 text-sm break-all underline"
          >
            {url}
          </a>
          <p className="mt-1 text-xs text-gray-500">DNS kan ta upp till 48h att spridas.</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function FinalizeModal({
  isOpen,
  onClose,
  onDownload,
  projectTitle = "Min webbplats",
  projectId,
  fileCount = 0,
  isDownloading = false,
}: FinalizeModalProps) {
  // State - minimal and focused
  const [includeBackoffice, setIncludeBackoffice] = useState(true);
  const [password, setPassword] = useState("");
  const [purchaseSuccess, setPurchaseSuccess] = useState<{
    domain: string;
    url: string;
  } | null>(null);

  // Derived state
  const canDownload = !includeBackoffice || password.length >= MIN_PASSWORD_LENGTH;

  // Handlers
  const handleDownload = () => {
    if (!canDownload) return;
    onDownload(includeBackoffice, includeBackoffice ? password : undefined);
  };

  const handlePurchaseSuccess = (domain: string, url: string) => {
    setPurchaseSuccess({ domain, url });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 p-5">
          <div className="flex items-center gap-3">
            <div className="bg-brand-teal/20 flex h-10 w-10 items-center justify-center rounded-lg">
              <Check className="text-brand-teal h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Klar!</h2>
              <p className="text-xs text-gray-500">Din sajt är redo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* 1. Project summary */}
          <ProjectSummary title={projectTitle} fileCount={fileCount} />

          {/* 2. Backoffice option */}
          <BackofficeSection
            enabled={includeBackoffice}
            onToggle={() => {
              setIncludeBackoffice(!includeBackoffice);
              if (includeBackoffice) setPassword("");
            }}
            password={password}
            onPasswordChange={setPassword}
          />

          {/* 3. Download action */}
          <DownloadAction
            onDownload={handleDownload}
            isDownloading={isDownloading}
            disabled={!canDownload}
            includeBackoffice={includeBackoffice}
          />

          {/* 4. Optional domain purchase */}
          {!purchaseSuccess && (
            <DomainSection projectId={projectId} onPurchaseSuccess={handlePurchaseSuccess} />
          )}

          {/* 5. Success message */}
          {purchaseSuccess && (
            <SuccessMessage domain={purchaseSuccess.domain} url={purchaseSuccess.url} />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 p-4">
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            Stäng
          </Button>
        </div>
      </div>
    </div>
  );
}
