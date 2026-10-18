import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { CartProvider } from "../components/cart-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "[Butiksnamn] — Demokatalog",
  description:
    "Exempelprodukter och lokal demokorg. Ingen betalning eller lagerintegration är ansluten.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The preview host sets this public routing prefix to /{chatId}.
  // Do not let two chats on the same origin share a local cart namespace.
  const storageScope = process.env.SAJTMASKIN_PREVIEW_BASE_PATH?.trim() || "/";
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <CartProvider storageScope={storageScope}>
          <SiteHeader />
          <main className="min-h-[80vh]">{children}</main>
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}
