# app/layout.tsx

Reason: Layout and navigation reference

```text
export const revalidate = 60

import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { AuthProvider } from "@/lib/auth-context"
import { AuthDialogProvider } from "@/lib/auth-dialog-context"
import { Toaster } from "@/components/ui/toaster"
import { ForuMsBadge } from "@/components/foru-ms-badge"
import { AuthDialog } from "@/components/auth-dialog"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Customer Support/Community Forum",
  description:
    "A modern, privacy-focused forum solution for customer support and community building.",
  generator: "Next.js",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        <AuthProvider>
          <AuthDialogProvider>
            {children}
            <AuthDialog />
          </AuthDialogProvider>
        </AuthProvider>
        <Toaster />
        <ForuMsBadge />
        <Analytics />
      </body>
    </html>
  )
}
```
