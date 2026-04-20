import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "App",
  description: "App with Clerk authentication",
};

/**
 * Wrap the entire app in <ClerkProvider> so useUser/useSession/auth() etc.
 * work everywhere. Adapt the appearance object to match the user's brand.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sv">
      <ClerkProvider
        appearance={{
          variables: { colorPrimary: "#000000" },
        }}
      >
        <body className="min-h-screen flex flex-col antialiased">
          {children}
        </body>
      </ClerkProvider>
    </html>
  );
}
