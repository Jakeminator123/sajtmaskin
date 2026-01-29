import React from "react"
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'Training Ground AB | Premium Träningskläder & Sportskor',
  description: 'Shoppa premium träningskläder och sportskor från ledande varumärken som Nike, Adidas och Puma. Fri frakt över 499 kr. 1-3 dagars leverans i Sverige. 100% äkta produkter.',
  keywords: ['träningskläder', 'sportskor', 'löparskor', 'nike', 'adidas', 'puma', 'träning', 'sport', 'sverige'],
  authors: [{ name: 'Training Ground AB' }],
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="sv">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
