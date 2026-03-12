# app/page.tsx

Reason: Useful structural reference

```text
"use client";

import { useState } from "react";

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScreenshot = async () => {
    if (!url) {
      setError("Please enter a valid URL.");
      return;
    }
    // Client-side URL validation: must start with http:// or https:// and be a valid URL
    if (!/^https?:\/\//i.test(url.trim())) {
      setError("URL must start with http:// or https://");
      return;
    }
    try {
      new URL(url.trim());
    } catch {
      setError("Invalid URL format. Please enter a valid URL.");
      return;
    }
    setLoading(true);
    setError(null);
    setScreenshot(null);

    try {
      const response = await fetch(
        `/api/screenshot?url=${encodeURIComponent(url)}`
      );
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(
            "Rate limit reached. To ensure this example can be used by others, please try again later."
          );
        }
        throw new Error("Failed to capture screenshot.");
      }
      const blob = await response.blob();
      setScreenshot(URL.createObjectURL(blob));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-4 text-gray-800">
          Puppeteer on Vercel
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Enter a URL below to generate a screenshot using Puppeteer running in
          a Vercel Function.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://vercel.com"
            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-black focus:outline-none"
          />
          <button
            onClick={h

// ... truncated
```
