# src/app/(protected)/dashboard/page.tsx

Reason: Useful structural reference

```text
import Topics from "@/components/Topics";
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";

export default async function Dashboard() {
  const { getUser, isAuthenticated } = getKindeServerSession();
  const user = await getUser();
  const contentToExplore = [
    {
      title: "Sign up and sign in",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#sign-up-and-sign-in",
    },
    {
      title: "Redirecting after authentication",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#redirecting-after-authentication",
    },
    {
      title: "Log out",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#logout",
    },

    {
      title: "Create organizations",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#create-organizations",
    },
    {
      title: "Sign in to organizations",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#sign-into-organizations",
    },

    {
      title: "Server side methods",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#kinde-auth-data---server",
    },
    {
      title: "Client side methods",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#kinde-auth-data---client",
    },
    {
      title: "Refreshing Kinde data",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#refreshing-kinde-data",
    },
    {
      title: "Kinde Management API",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#kinde-management-api",
    },
    {
      title: "Analytics",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#analytics",
    },
    {
      title: "Internationalization",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#internationalization",
    },
    {
      title: "Audience",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#audience",
    },
    {
      title: "Protecting routes",
      link: "https://docs.kinde.com/developer-tools/sdks/backend/nextjs-sdk/#protecting-routes",
    },
  ];

  return (
    <main className="mx-auto flex h-full w-full max-w-6xl animate-fade-in-up flex-col gap-8 px-4 py-12 opacity-0 md:px-8

// ... truncated
```
