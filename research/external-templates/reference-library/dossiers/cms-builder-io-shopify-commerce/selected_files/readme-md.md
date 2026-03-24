# README.md

Reason: Setup and architecture context

```text
# Next.js + Shopify + Builder.io example

Demo live at: [headless.builders](https://headless.builders/)

## Goals and Features

- Ultra high performance
- SEO optimized
- Themable
- Personalizable (internationalization, a/b testing, etc)
- Builder.io Visual CMS integrated

## Video walkthrough

Learn how to get started with this Builder + Next.js + Shopify example with this step by step video guide here:

<a href="https://www.youtube.com/watch?v=uIHqPu2t1O0">
  <img width="400" src="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2Fc161ccb26f6446869cba865d014c7caf" />
</a>

## Table of contents

- [Getting Started](#getting-started)
  - [1: Create an account for Builder.io](#1-create-an-account-for-builderio)
  - [2: Your Builder.io private key](#2-your-builderio-private-key)
  - [3: Clone this repository and initialize a Builder.io space](#3-clone-this-repository-and-initialize-a-builderio-space)
  - [4. Shopify private app](#4-shopify-private-app)
  - [5. Connecting Builder to Shopify](#5-connecting-builder-to-shopify)
  - [6. Configure the project to talk to Shopify](#6-configure-the-project-to-talk-to-shopify)
  - [7. Up and Running!](#7-up-and-running)
- [Deploy](#deploy)

<!-- markdown-toc end -->

## Getting Started

**Pre-requisites**

This guide will assume that you have the following software installed:

- nodejs (>=12.0.0)
- npm
- git

You should already have a [Shopify](https://www.shopify.com/online-store) account and store created before starting as well.

**Introduction**

After following this guide you will have

- A Next.js app, ready to deploy to a hosting provider of your choice
- Pulling live collection and product information from Shopify
- Powered by the Builder.io visual CMS

### 1: Create an account for Builder.io

Before we start, head over to Builder.io and [create an account](https://builder.io/signup).

### 2: Your Builder.io private key

Head over to your [organization settings page](https://builder.io/account/organization?root=true) and create a
private key, copy the key for the next step.

- Visit the [organization settings page](https://builder.io/account/organization?root=true), or select
  an organization from the list

![organizations drop down list](./docs/images/builder-io-organizations.png)

- Click "Account" from the left hand sideba

// ... truncated
```
