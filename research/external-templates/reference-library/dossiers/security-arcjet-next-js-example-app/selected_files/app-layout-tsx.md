# app/layout.tsx

Reason: Layout and navigation reference

```text
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import LogoDark from "@/assets/logo-dark.svg";

import LogoLight from "@/assets/logo-light.svg";
import { siteConfig } from "@/config/site";

import "@/styles/styles.css";
import { IconCancel } from "@/components/icons/Cancel";
import { IconMenu } from "@/components/icons/Menu";
import { NavLink } from "@/components/NavLink";
import { PopoverTarget } from "@/components/PopoverTarget";

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: [
    {
      rel: "icon",
      type: "image/x-icon",
      url: "/favicon.png",
      media: "(prefers-color-scheme: dark)",
    },
    {
      rel: "icon",
      type: "image/png",
      url: "/favicon-light.png",
      media: "(prefers-color-scheme: light)",
    },
  ],
};

type Props = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: Props) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          defer
          src="https://plausible.io/js/script.js"
          data-domain="arcjet.com"
        />
      </head>
      <body className="layout">
        <header className="header">
          <Link href="/">
            <Image
              src={LogoLight}
              alt="Arcjet Example app"
              height={30}
              width={310}
              className="light"
            />
            <Image
              src={LogoDark}
              alt="Arcjet Example app"
              height={30}
              width={310}
              className="dark"
            />
          </Link>
          <div className="header-end">
            <button
              className="hamburger-menu"
              popoverTarget="navigation"
              popoverTargetAction="toggle"
            >
              <IconMenu classes={["hamburger-menu-menu-icon"]} />
              <IconCancel classes={["hamburger-menu-cancel-icon"]} />
            </button>
            <PopoverTarget id="navigation" closeAtWidthPx={1024}>
              <ul className="navigation-links">
                <li>
                  <NavLink className="navigation-link" hre

// ... truncated
```
