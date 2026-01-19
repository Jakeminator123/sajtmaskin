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
    url
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
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Stäng"
            title="Stäng"
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-4">
          <div className="bg-[#0a0a0a] p-4 rounded-lg border border-gray-800">
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
          <p className="text-xs text-gray-500 mb-1">Preview URL:</p>
          <div className="flex items-center gap-2 p-2 bg-gray-800 rounded border border-gray-700">
            <span className="text-xs text-gray-400 truncate flex-1">{url}</span>
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              title="Kopiera URL"
            >
              {copied ? (
                <Check className="h-4 w-4 text-teal-500" />
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
            className="flex-1 bg-teal-600 hover:bg-teal-500"
          >
            Stäng
          </Button>
        </div>

        {/* Tip */}
        <p className="text-xs text-gray-500 text-center mt-4">
          💡 Skanna QR-koden med din mobil för att se preview
        </p>
      </div>
    </div>
  );
}
