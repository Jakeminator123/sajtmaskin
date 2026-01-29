"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QrCode, X, Copy, Check, Download } from "lucide-react";
import Image from "next/image";

interface QrShareProps {
  url: string;
  title?: string;
}

export function QrShare({ url, title = "Dela via QR-kod" }: QrShareProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate QR code URL using QuickChart
  const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(
    url,
  )}&size=200&dark=14b8a6&light=0a0a0a&ecLevel=M&format=png`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = qrCodeUrl;
    link.download = "sajtmaskin-preview-qr.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2 border-gray-700 text-gray-300 hover:bg-gray-800"
        title="Dela via QR-kod"
      >
        <QrCode className="h-4 w-4" />
        <span className="hidden sm:inline">Dela</span>
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Stäng"
            title="Stäng"
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* QR Code */}
        <div className="mb-4 flex justify-center">
          <div className="rounded-lg border border-gray-800 bg-[#0a0a0a] p-4">
            <Image
              src={qrCodeUrl}
              alt="QR-kod för att dela preview"
              width={200}
              height={200}
              className="rounded"
              unoptimized
            />
          </div>
        </div>

        {/* URL display */}
        <div className="mb-4">
          <p className="mb-1 text-xs text-gray-500">Preview URL:</p>
          <div className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800 p-2">
            <span className="flex-1 truncate text-xs text-gray-400">{url}</span>
            <button
              onClick={handleCopy}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
              title="Kopiera URL"
            >
              {copied ? (
                <Check className="text-brand-teal h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="flex-1 gap-2 border-gray-700"
          >
            <Download className="h-4 w-4" />
            Ladda ner QR
          </Button>
          <Button
            size="sm"
            onClick={() => setIsOpen(false)}
            className="bg-brand-teal hover:bg-brand-teal/90 flex-1"
          >
            Stäng
          </Button>
        </div>

        {/* Tip */}
        <p className="mt-4 text-center text-xs text-gray-500">
          💡 Skanna QR-koden med din mobil för att se preview
        </p>
      </div>
    </div>
  );
}
