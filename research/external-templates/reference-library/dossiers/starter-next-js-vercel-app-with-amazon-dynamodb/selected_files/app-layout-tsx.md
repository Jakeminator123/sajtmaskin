# app/layout.tsx

Reason: Layout and navigation reference

```text
import type { Metadata } from "next";
import "./globals.css";
import { Geist_Mono } from "next/font/google";

export const metadata: Metadata = {
  title: "DynamoDB Movies Demo",
  description: "List movies from an Amazon DynamoDB table.",
};

const geist = Geist_Mono({
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.className} antialiased bg-white dark:bg-black`}>
        {children}
      </body>
    </html>
  );
}
```
