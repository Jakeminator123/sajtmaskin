# README.md

Reason: Setup and architecture context

```text
# LaunchPad - Official Strapi Demo

![LaunchPad](./LaunchPad.jpg)

Welcome aboard **LaunchPad**, the official Strapi demo application, where we launch your content into the stratosphere at the speed of _"we-can't-even-measure-it!"_.
This repository contains the following:

- A Strapi project with content-types and data already onboard
- A Next.js client that's primed and ready to fetch the content from Strapi faster than you can say "blast off!"

## 🌌 Get started

Strap yourself in! You can get started with this project on your local machine by following the instructions below, or you can [request a private instance on our website](https://strapi.io/demo)

### Prerequisites

- **Node.js** v18 or higher
- **Yarn** as your package manager (this project uses Yarn internally for its scripts)

> **Don't have Yarn installed?** You can enable it via Node.js Corepack:
> ```sh
> corepack enable
> ```
> Or install it globally via npm:
> ```sh
> npm install -g yarn
> ```

## 1. Clone and Install

To infinity and beyond! Clone the repo and install root dependencies:

```sh
git clone https://github.com/strapi/launchpad.git
cd launchpad
yarn install
```

## 2. Setup

Run the setup script to install dependencies in both projects (Strapi and Next.js) and copy the environment files:

```sh
yarn setup
```

## 3. Seed the Data

Populate your Strapi instance with demo content:

```sh
yarn seed
```

## 4. Start the Development Servers

Launch both Strapi and Next.js concurrently from the root:

```sh
yarn dev
```

This starts the Strapi server first, waits for it to be ready, then starts the Next.js frontend. You're now a spacefaring content master!

Visit http://localhost:1337/admin to create your first Strapi user, and http://localhost:3000 to discover your space rocket website.

## Features Overview ✨

### User

<br />

 - **An intuitive, minimal editor** The editor allows you to pull in dynamic blocks of content. It’s 100% open-source, and it’s fully extensible.<br />
 - **Media Library** Upload images, video or any files and crop and optimize their sizes, without quality loss.<br />
 - **Flexible content management** Build any type of category, section, format or flow to adapt to your needs. <br />
 - **Sort and Filter** Built-in sorting and filtering: you can manage thousands of entries without eff

// ... truncated
```
