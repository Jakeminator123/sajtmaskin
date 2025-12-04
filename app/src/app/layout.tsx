import type { Metadata } from "next";
import "./globals.css";
import { AnalyticsTracker } from "@/components/analytics-tracker";

export const metadata: Metadata = {
  title: "Sajtmaskin",
  description: "Built with Next.js, Tailwind CSS and shadcn/ui",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body className="antialiased">
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  );
}
