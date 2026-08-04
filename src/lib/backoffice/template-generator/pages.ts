import type { ContentManifest } from "../content-extractor";


/**
 * Generate the login page component
 */
export function generateLoginPage(): string {
  return `"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";

export default function BackofficePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/backoffice/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.success) {
        router.push("/backoffice/dashboard");
      } else {
        setError(data.error || "Fel lösenord");
      }
    } catch {
      setError("Något gick fel. Försök igen.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-teal/10 rounded-full mb-4">
              <Lock className="h-8 w-8 text-brand-teal" />
            </div>
            <h1 className="text-2xl font-bold text-white">Backoffice</h1>
            <p className="text-gray-400 mt-2">Logga in för att redigera din sajt</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm text-gray-400 mb-2">
                Lösenord
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-teal transition-colors"
                  placeholder="Ange lösenord"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-brand-teal hover:bg-brand-teal/90 disabled:bg-brand-teal/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loggar in...
                </>
              ) : (
                "Logga in"
              )}
            </button>
          </form>
        </div>

        {/* Footer removed for white-label */}
      </div>
    </div>
  );
}
`;
}

/**
 * Generate the dashboard page
 */
export function generateDashboardPage(manifest: ContentManifest): string {
  const textCount = manifest.content.filter((c) => c.type === "text").length;
  const imageCount = manifest.content.filter((c) => c.type === "image").length;
  const productCount = manifest.products.length;

  return `"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Type,
  Image,
  Palette,
  Package,
  Settings,
  LogOut,
  ChevronRight,
  RefreshCw
} from "lucide-react";

const MENU_ITEMS = [
  {
    href: "/backoffice/content",
    icon: Type,
    label: "Texter",
    description: "Redigera rubriker och text",
    count: ${textCount}
  },
  {
    href: "/backoffice/images",
    icon: Image,
    label: "Bilder",
    description: "Byt ut bilder på sajten",
    count: ${imageCount}
  },
  {
    href: "/backoffice/colors",
    icon: Palette,
    label: "Färger",
    description: "Anpassa färgtema",
    count: null
  },
  ${
    productCount > 0
      ? `{
    href: "/backoffice/products",
    icon: Package,
    label: "Produkter",
    description: "Hantera produkter och priser",
    count: ${productCount}
  },`
      : ""
  }
  {
    href: "/backoffice/settings",
    icon: Settings,
    label: "Inställningar",
    description: "Byt lösenord och mer",
    count: null
  },
];

export default function DashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/backoffice/auth")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push("/backoffice");
        } else {
          setIsLoading(false);
        }
      })
      .catch(() => router.push("/backoffice"));
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/backoffice/auth", { method: "DELETE" });
    router.push("/backoffice");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 text-brand-teal animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Backoffice</h1>
            <p className="text-sm text-gray-400">Hantera din webbplats</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              target="_blank"
              className="text-sm text-brand-teal hover:text-brand-teal/80"
            >
              Visa sajt →
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logga ut
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid gap-4 md:grid-cols-2">
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group bg-gray-900 border border-gray-800 hover:border-brand-teal/50 rounded-xl p-6 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-brand-teal/10 rounded-lg group-hover:bg-brand-teal/20 transition-colors">
                    <item.icon className="h-6 w-6 text-brand-teal" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white group-hover:text-brand-teal transition-colors">
                      {item.label}
                    </h2>
                    <p className="text-sm text-gray-400">{item.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.count !== null && (
                    <span className="text-sm text-gray-500">{item.count}</span>
                  )}
                  <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-brand-teal transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick stats */}
        <div className="mt-8 p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Översikt</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">${textCount}</p>
              <p className="text-sm text-gray-500">Texter</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">${imageCount}</p>
              <p className="text-sm text-gray-500">Bilder</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">${productCount}</p>
              <p className="text-sm text-gray-500">Produkter</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
`;
}

/**
 * Generate the content editing page
 */
export function generateContentPage(_manifest: ContentManifest): string {
  // Manifest currently unused in placeholder generator
  void _manifest;

  return `"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Check, Search } from "lucide-react";

interface ContentItem {
  id: string;
  type: string;
  value: string;
  context: string;
}

// Section labels
const SECTION_LABELS: Record<string, string> = {
  hero: "Hero-sektion",
  header: "Sidhuvud",
  footer: "Sidfot",
  about: "Om oss",
  contact: "Kontakt",
  pricing: "Priser",
  features: "Funktioner",
  testimonials: "Omdömen",
  products: "Produkter",
  team: "Team",
  gallery: "Galleri",
  faq: "Vanliga frågor",
  cta: "Call to action",
  general: "Övrigt",
};

export default function ContentPage() {
  const router = useRouter();
  const [content, setContent] = useState<ContentItem[]>([]);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/backoffice/auth")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push("/backoffice");
          return;
        }
        return fetch("/api/backoffice/content");
      })
      .then((res) => res?.json())
      .then((data) => {
        if (!data) return;
        const textContent = data.content.filter((c: ContentItem) => c.type === "text");
        setContent(textContent);
        const initial: Record<string, string> = {};
        textContent.forEach((c: ContentItem) => {
          initial[c.id] = c.value;
        });
        setEditedContent(initial);
      })
      .catch(() => router.push("/backoffice"))
      .finally(() => setIsLoading(false));
  }, [router]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/backoffice/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: editedContent }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Group content by section
  const groupedContent = content.reduce((acc, item) => {
    if (!acc[item.context]) acc[item.context] = [];
    acc[item.context].push(item);
    return acc;
  }, {} as Record<string, ContentItem[]>);

  // Filter by search
  const filteredGroups = Object.entries(groupedContent).filter(([section, items]) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      section.toLowerCase().includes(searchLower) ||
      items.some((item) => item.value.toLowerCase().includes(searchLower))
    );
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-brand-teal animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/backoffice/dashboard"
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Texter</h1>
              <p className="text-sm text-gray-400">{content.length} redigerbara texter</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-teal hover:bg-brand-teal/90 disabled:bg-brand-teal/50 text-white rounded-lg transition-colors"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? "Sparat!" : "Spara ändringar"}
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök texter..."
            className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-teal"
          />
        </div>
      </div>

      {/* Content list */}
      <main className="max-w-4xl mx-auto px-4 pb-8">
        <div className="space-y-6">
          {filteredGroups.map(([section, items]) => (
            <div key={section} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800">
                <h2 className="font-medium text-white">
                  {SECTION_LABELS[section] || section}
                </h2>
              </div>
              <div className="divide-y divide-gray-800">
                {items.map((item) => (
                  <div key={item.id} className="p-4">
                    <label className="block text-sm text-gray-400 mb-2">
                      {item.id}
                    </label>
                    <textarea
                      value={editedContent[item.id] || ""}
                      onChange={(e) =>
                        setEditedContent((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      rows={Math.min(4, Math.ceil(item.value.length / 60))}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-teal resize-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
`;
}

/**
 * Generate the images editing page
 */
export function generateImagesPage(): string {
  return `"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Loader2, Check, Image as ImageIcon } from "lucide-react";

interface ImageItem {
  id: string;
  value: string;
  context: string;
}

export default function ImagesPage() {
  const router = useRouter();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/backoffice/auth")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push("/backoffice");
          return;
        }
        return fetch("/api/backoffice/content");
      })
      .then((res) => res?.json())
      .then((data) => {
        if (!data) return;
        const imageContent = data.content.filter((c: ImageItem) => c.type === "image");
        setImages(imageContent);
      })
      .catch(() => router.push("/backoffice"))
      .finally(() => setIsLoading(false));
  }, [router]);

  const handleUpload = async (id: string, file: File) => {
    setUploadingId(id);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("contentId", id);

    try {
      const res = await fetch("/api/backoffice/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === id ? { ...img, value: data.url } : img
          )
        );
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-brand-teal animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/backoffice/dashboard"
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Bilder</h1>
            <p className="text-sm text-gray-400">{images.length} bilder på sajten</p>
          </div>
        </div>
      </header>

      {/* Images grid */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {images.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Inga bilder hittades på sajten</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {images.map((image) => (
              <div
                key={image.id}
                className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
              >
                <div className="aspect-video bg-gray-800 relative">
                  {image.value ? (
                    <img
                      src={image.value}
                      alt={image.id}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-600">
                      <ImageIcon className="h-12 w-12" />
                    </div>
                  )}
                  {uploadingId === image.id && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-sm text-gray-400 mb-3">{image.context}</p>
                  <label className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg cursor-pointer transition-colors">
                    <Upload className="h-4 w-4" />
                    Byt bild
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(image.id, file);
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
`;
}

/**
 * Generate the colors editing page
 */
export function generateColorsPage(manifest: ContentManifest): string {
  const { primary, secondary, accent, background, text } = manifest.colors;

  return `"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2, Check, RefreshCw } from "lucide-react";

interface ColorTheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

const DEFAULT_COLORS: ColorTheme = {
  primary: "${primary}",
  secondary: "${secondary}",
  accent: "${accent}",
  background: "${background}",
  text: "${text}",
};

const COLOR_LABELS: Record<keyof ColorTheme, string> = {
  primary: "Primär",
  secondary: "Sekundär",
  accent: "Accent",
  background: "Bakgrund",
  text: "Text",
};

export default function ColorsPage() {
  const router = useRouter();
  const [colors, setColors] = useState<ColorTheme>(DEFAULT_COLORS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/backoffice/auth")
      .then((res) => res.json())
      .then((data) => {
        if (!data.authenticated) {
          router.push("/backoffice");
          return;
        }
        return fetch("/api/backoffice/colors");
      })
      .then((res) => res?.json())
      .then((data) => {
        if (!data) return;
        if (data.colors) setColors(data.colors);
      })
      .catch(() => router.push("/backoffice"))
      .finally(() => setIsLoading(false));
  }, [router]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/backoffice/colors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colors }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setColors(DEFAULT_COLORS);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-brand-teal animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/backoffice/dashboard"
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Färger</h1>
              <p className="text-sm text-gray-400">Anpassa sajtens färgtema</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Återställ
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-brand-teal hover:bg-brand-teal/90 disabled:bg-brand-teal/50 text-white rounded-lg transition-colors"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "Sparat!" : "Spara"}
            </button>
          </div>
        </div>
      </header>

      {/* Color pickers */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="divide-y divide-gray-800">
            {(Object.keys(colors) as (keyof ColorTheme)[]).map((key) => (
              <div key={key} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{COLOR_LABELS[key]}</p>
                  <p className="text-sm text-gray-500">{colors[key]}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg border border-gray-700"
                    style={{ backgroundColor: colors[key] }}
                  />
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(e) =>
                      setColors((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="w-12 h-10 cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-400 mb-4">Förhandsvisning</h3>
          <div
            className="rounded-xl p-8"
            style={{ backgroundColor: colors.background }}
          >
            <h2 style={{ color: colors.text }} className="text-2xl font-bold mb-2">
              Rubrik
            </h2>
            <p style={{ color: colors.text }} className="mb-4 opacity-70">
              Detta är en exempeltext som visar hur texten ser ut.
            </p>
            <div className="flex gap-3">
              <button
                className="px-4 py-2 rounded-lg text-white"
                style={{ backgroundColor: colors.primary }}
              >
                Primär knapp
              </button>
              <button
                className="px-4 py-2 rounded-lg text-white"
                style={{ backgroundColor: colors.accent }}
              >
                Accent knapp
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
`;
}

/**
 * Generate the layout file for backoffice
 */
export function generateLayout(): string {
  return `import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Backoffice",
  description: "Hantera din webbplats",
};

export default function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
`;
}
