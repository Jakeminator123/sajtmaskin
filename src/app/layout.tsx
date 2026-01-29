import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AnalyticsTracker, CookieBanner } from "@/components/layout";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Sajtmaskin",
  description: "Skapa professionella webbplatser på minuter med AI",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      style={{ backgroundColor: "#000000" }}
    >
      <body
        className="font-mono antialiased"
        style={{ backgroundColor: "#000000" }}
      >
        <AnalyticsTracker />
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
