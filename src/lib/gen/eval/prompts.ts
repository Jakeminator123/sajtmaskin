export interface EvalPrompt {
  id: string;
  prompt: string;
  intent: "website" | "template" | "app";
  expected: {
    minFiles: number;
    maxFiles: number;
    requiredFiles: string[];
    requiredImports: string[];
    shouldCompile: boolean;
  };
}

export const EVAL_PROMPTS: EvalPrompt[] = [
  {
    id: "coffee-shop",
    prompt:
      "Create a landing page for a Swedish coffee shop called Kaffekoppen with a hero section, menu, and contact info",
    intent: "website",
    expected: {
      minFiles: 1,
      maxFiles: 8,
      requiredFiles: ["app/page.tsx"],
      requiredImports: [],
      shouldCompile: true,
    },
  },
  {
    id: "dashboard",
    prompt:
      "Build a dashboard with user statistics cards, a sidebar navigation, and a data table showing recent orders",
    intent: "app",
    expected: {
      minFiles: 2,
      maxFiles: 12,
      requiredFiles: ["app/page.tsx"],
      requiredImports: ["@/components/ui/card"],
      shouldCompile: true,
    },
  },
  {
    id: "portfolio",
    prompt:
      "Create a portfolio website for a photographer with a gallery grid, about section, and contact form",
    intent: "website",
    expected: {
      minFiles: 1,
      maxFiles: 8,
      requiredFiles: ["app/page.tsx"],
      requiredImports: [],
      shouldCompile: true,
    },
  },
  {
    id: "blog",
    prompt:
      "Build a blog homepage with a featured post hero, recent posts grid, and category sidebar",
    intent: "website",
    expected: {
      minFiles: 1,
      maxFiles: 10,
      requiredFiles: ["app/page.tsx"],
      requiredImports: ["@/components/ui/card"],
      shouldCompile: true,
    },
  },
  {
    id: "pricing",
    prompt:
      "Create a SaaS pricing page with three tier cards (Free, Pro, Enterprise), feature comparison, and FAQ accordion",
    intent: "website",
    expected: {
      minFiles: 1,
      maxFiles: 6,
      requiredFiles: ["app/page.tsx"],
      requiredImports: ["@/components/ui/card"],
      shouldCompile: true,
    },
  },
  {
    id: "auth",
    prompt:
      "Build a login page with email/password form, social login buttons, and a registration link",
    intent: "app",
    expected: {
      minFiles: 1,
      maxFiles: 5,
      requiredFiles: ["app/page.tsx"],
      requiredImports: [
        "@/components/ui/input",
        "@/components/ui/button",
      ],
      shouldCompile: true,
    },
  },
  {
    id: "ecommerce",
    prompt:
      "Create a product listing page with filter sidebar, product cards with images and prices, and a shopping cart icon",
    intent: "app",
    expected: {
      minFiles: 1,
      maxFiles: 10,
      requiredFiles: ["app/page.tsx"],
      requiredImports: ["@/components/ui/card"],
      shouldCompile: true,
    },
  },
  {
    id: "restaurant",
    prompt:
      "Build a restaurant website with a hero image, menu sections divided by category, opening hours, and reservation form",
    intent: "website",
    expected: {
      minFiles: 1,
      maxFiles: 8,
      requiredFiles: ["app/page.tsx"],
      requiredImports: ["@/components/ui/button"],
      shouldCompile: true,
    },
  },
  {
    id: "agency",
    prompt:
      "Create a digital agency landing page with services grid, team section, client logos, and a contact form",
    intent: "website",
    expected: {
      minFiles: 1,
      maxFiles: 8,
      requiredFiles: ["app/page.tsx"],
      requiredImports: [],
      shouldCompile: true,
    },
  },
  {
    id: "settings",
    prompt:
      "Build a settings page with tabs for Profile, Notifications, Security, and Billing with forms in each tab",
    intent: "app",
    expected: {
      minFiles: 1,
      maxFiles: 6,
      requiredFiles: ["app/page.tsx"],
      requiredImports: ["@/components/ui/tabs"],
      shouldCompile: true,
    },
  },
];
