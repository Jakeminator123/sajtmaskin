# README.md

Reason: Setup and architecture context

```text
# Optimizely SaaS CMS + Next.js 15

A comprehensive starter template for building modern websites with Optimizely SaaS CMS and Next.js 15 App Router. This template serves as an excellent starting point for projects integrating with Optimizely SaaS CMS.

This project was built based on a free course on how to get started with Optimizely SaaS CMS. You can find step-by-step information on how this project was built at: https://opti-masterclass.vercel.app

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fszymonuryga%2FOptimizely-SaaS-CMS-Next.js-15&env=OPTIMIZELY_API_URL,OPTIMIZELY_SINGLE_KEY,OPTIMIZELY_PREVIEW_SECRET,OPTIMIZELY_REVALIDATE_SECRET,OPTIMIZELY_START_PAGE_URL,NEXT_PUBLIC_CMS_URL)

> Note: This template requires an Optimizely SaaS CMS instance to retrieve content. Please connect with the [Optimizely](https://www.optimizely.com/products/content-management/) team to receive CMS access.

## Features

- ⚡ **Next.js 15** with App Router
- 🏗️ **Static Site Generation (SSG)** for optimal performance
- 🔄 **On-Demand Cache Revalidation** via webhooks for real-time content updates
- 👁️ **Draft Mode** for content previews
- 🌐 **Multi-language Support** with automatic language detection
- 🧩 **Block Factory Mapper** for dynamic content rendering
- 🎨 **Visual Builder Integration** for intuitive content editing
- 🔍 **SEO Optimized** with metadata support
- 💅 **Tailwind CSS & shadcn/ui** for beautiful, responsive designs
- 📊 **TypeScript** for type safety
- 📝 **GraphQL Codegen** for type-safe API calls

## Important Note

- This repository includes an `ExportedFile.episerverdata` file in the root folder, which contains all initial content for Optimizely SaaS CMS. You can import this file into your Optimizely instance to get started with pre-configured content.
- This template focuses on core functionality that is common to all projects, such as fetching content from Optimizely Graph, preview functionality, routing, Visual Builder and cache revalidation. The design is intentionally simple and serves as an example — each project will have its own design requirements.

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- An Optimizely SaaS CMS instance
- Optimizely Content Graph API key

### Setup Instructions

- Clone the repository:

// ... truncated
```
