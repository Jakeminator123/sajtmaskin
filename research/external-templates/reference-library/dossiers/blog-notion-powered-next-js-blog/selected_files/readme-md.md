# README.md

Reason: Setup and architecture context

```text
# Notion-Powered Next.js Blog Template

A modern, fast, and customizable blog template powered by Notion as a CMS and Next.js. This template allows you to use Notion as your content management system while serving your blog with Next.js.

## Features

- 🚀 Built with Next.js 14+ and App Router
- 📝 Use Notion as a CMS
- 🎨 Beautiful and responsive design
- ⚡ Fast page loads with static generation
- 🔍 SEO optimized
- 📱 Mobile-friendly
- 🌙 Dark mode support
- ✨ Syntax highlighting for code blocks
- 📊 Table support
- 🖼️ Image optimization
- 📅 Reading time and word count

## Prerequisites

- Node.js 18.17.1 or later
- A Notion account
- Basic knowledge of Next.js and React

## Getting Started

### 1. Clone the Template

1. Visit this Notion template: [Blog Template](https://exclusive-gatsby-850.notion.site/20a186dad999800dbb94f239f907215d?v=20a186dad99980228480000c8707478c&source=github)
2. Click "Duplicate" to clone it to your workspace
3. Clone this repository to your local machine

### 2. Set Up Notion Integration

1. Go to [Notion Developers](https://www.notion.so/my-integrations)
2. Click "New integration"
3. Fill in the integration details:
   - Name: Choose a name for your integration
   - Select the workspace where you cloned the blog template
   - Choose "Internal integration"
4. Under "Capabilities", select only "Read content" (uncheck Insert content and Update content)
5. Copy the "Internal Integration Token" (this will be your `NOTION_TOKEN`)

### 3. Connect Integration to Your Database

1. Go to your cloned Notion blog page
2. Click the "•••" (three dots) in the top right corner
3. Go to "Connections" -> find your integration and click "Connect"

### 4. Get Your Database ID

1. Open your Notion database in the browser
2. Copy the ID from the URL. For example:
   ```
   https://www.notion.so/20bf471a8ac78080a3d4dad6ed77ca17?v=...
                        └───────── Database ID ─────────┘
   ```

### 5. Environment Setup

1. Create a `.env.local` file in your project root:
   ```env
   NOTION_TOKEN=your_integration_token_here
   NOTION_DATABASE_ID=your_database_id_here
   NEXT_PUBLIC_SITE_URL=your_site_url_here
   ```

### 6. Install and Run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to see your blog.

## Customizing the Template

### Adding New

// ... truncated
```
