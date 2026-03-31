# src/app/layout.tsx

Reason: Layout and navigation reference

```text
import type { Metadata, Viewport } from "next";

import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { basehub } from "basehub";

import { Providers } from "./providers";
import { Header } from "./_components/header";
import { Footer } from "./_components/footer";
import { Newsletter } from "./_sections/newsletter";
import { draftMode } from "next/headers";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  fallback: [
    "Inter",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Oxygen",
    "Ubuntu",
    "Cantarell",
    "Fira Sans",
    "Droid Sans",
    "Helvetica Neue",
    "sans-serif",
  ],
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  fallback: ["monaco", "monospace"],
});

export const generateMetadata = async (): Promise<Metadata> => {
  const data = await basehub({ cache: "no-store", draft: (await draftMode()).isEnabled }).query({
    site: {
      settings: {
        metadata: {
          sitename: true,
          titleTemplate: true,
          defaultTitle: true,
          defaultDescription: true,
          favicon: {
            url: true,
            mimeType: true,
          },
          ogImage: {
            url: true,
          },
          xAccount: {
            url: true,
          },
        },
      },
    },
  });

  const images = [{ url: data.site.settings.metadata.ogImage.url }];

  let xAccount: string | undefined = undefined;

  if (data.site.settings.metadata.xAccount) {
    try {
      const xUrl = new URL(data.site.settings.metadata.xAccount.url);
      const split = xUrl.pathname.split("/");

      xAccount = split[split.length - 1];
    } catch {
      // invalid url noop
    }
  }

  return {
    title: {
      default: data.site.settings.metadata.defaultTitle,
      template: data.site.settings.metadata.titleTemplate,
    },
    applicationName: data.site.settings.metadata.sitename,
    description: data.site.settings.metadata.defaultDescription,
    icons: [
      {
        url: data.site.settings.metadata.favicon.url,
        rel: "icon",
        type: data.site.settings.metadata.favicon.mimeType,
      },
    ],
    openGraph: { type: "website", images, siteName:

// ... truncated
```
