# app/page.tsx

Reason: Useful structural reference

```text
import Image from "next/image";
import logo from "@/assets/logo.svg";
import logoDark from "@/assets/logo-dark.svg";
import vercelLogotypeLight from "@/assets/vercel-logotype-light.svg";
import vercelLogotypeDark from "@/assets/vercel-logotype-dark.svg";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatabaseStatusBadge } from "@/components/DatabaseStatusBadge";
import { AuthButton } from "@/components/AuthButton";
import { PostSection } from "@/components/PostSection";

const DATA = {
  title: "Next.js with MongoDB",
  description:
    "A full-stack React template with Next.js, Vercel, and MongoDB. Ships with forum and auth, or strip it all out.",
  buttons: {
    primary: {
      className: "rounded-full bg-[#00ED64] px-5 py-2.5 font-semibold tracking-tight text-[#001E2B] transition-colors duration-200 hover:bg-[#58C860] lg:px-7 lg:py-3"
    },
    ghost: {
      className: "group flex items-center gap-2 leading-none tracking-tight dark:hover:bg-white/10 hover:bg-black/5 dark:hover:text-white hover:text-black"
    }
  },
  link: {
    text: "View on Github",
    href: "https://github.com/mongodb-developer/nextjs-news-template-mongodb",
  },
  footerLinks: {
    nextjs: {
      text: "Next.js",
      href: "https://nextjs.org"
    },
    mongodb: {
      text: "MongoDB",
      href: "https://www.mongodb.com/?utm_campaign=devrel&utm_source=third-party-content&utm_medium=cta&utm_content=template-nextjs-news-mongodb&utm_term=jesse.hall"
    },
    vercel: {
      text: "Vercel",
      href: "https://vercel.com/marketplace/mongodbatlas"
    },
    betterAuth: {
      text: "Better Auth",
      href: "https://better-auth.com"
    },
    github: {
      text: "GitHub",
      href: "https://github.com/mongodb-developer/nextjs-news-template-mongodb"
    }
  },
};

interface HomeProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = await searchParams;
  const currentPage = parseInt(resolvedSearchParams.page || '1', 10);

  return (
    <div className="flex min-h-screen flex-col justify-center">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col p-8 px-5 md:max-w-lg md:px-0 lg:max-w-xl max-h-[1000px]">

// ... truncated
```
