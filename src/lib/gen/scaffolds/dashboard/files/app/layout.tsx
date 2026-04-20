import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Analytics and overview dashboard with stats, tables, and charts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <div className="flex h-screen overflow-hidden">
          <DashboardSidebar />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </div>
      </body>
    </html>
  );
}
