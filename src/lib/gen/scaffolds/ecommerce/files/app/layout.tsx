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
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <CartProvider>
          <SiteHeader />
          <main className="min-h-[80vh]">{children}</main>
          <SiteFooter />
        </CartProvider>
      </body>
    </html>
  );
}
