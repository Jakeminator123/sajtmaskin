export type ShadcnBlockItem = {
  name: string;
  title: string;
  description: string;
};

export type ShadcnBlockCategory = {
  category: string;
  items: ShadcnBlockItem[];
};

export const SHADCN_BLOCKS: ShadcnBlockCategory[] = [
  {
    category: "Authentication",
    items: [
      {
        name: "login-01",
        title: "Simple Login",
        description: "Clean login form with email/password",
      },
      {
        name: "login-02",
        title: "Login with Image",
        description: "Split screen login with hero image",
      },
      { name: "login-03", title: "Login Centered", description: "Centered card login form" },
      {
        name: "login-04",
        title: "Login with Social",
        description: "Login with Google/GitHub buttons",
      },
      { name: "login-05", title: "Login Minimal", description: "Minimalist login form" },
    ],
  },
  {
    category: "Dashboard",
    items: [
      {
        name: "dashboard-01",
        title: "Analytics Dashboard",
        description: "Charts and stats overview",
      },
    ],
  },
  {
    category: "Sidebar",
    items: [
      { name: "sidebar-01", title: "Simple Sidebar", description: "Basic navigation sidebar" },
      {
        name: "sidebar-02",
        title: "Collapsible Sidebar",
        description: "Sidebar with collapse toggle",
      },
      {
        name: "sidebar-03",
        title: "Sidebar with Header",
        description: "Sidebar with branding header",
      },
      { name: "sidebar-04", title: "Floating Sidebar", description: "Floating panel sidebar" },
      {
        name: "sidebar-05",
        title: "Sidebar with Footer",
        description: "Sidebar with user profile footer",
      },
    ],
  },
  {
    category: "Charts",
    items: [
      {
        name: "chart-area-interactive",
        title: "Area Chart",
        description: "Interactive area chart",
      },
      { name: "chart-bar-interactive", title: "Bar Chart", description: "Interactive bar chart" },
      {
        name: "chart-line-interactive",
        title: "Line Chart",
        description: "Interactive line chart",
      },
      { name: "chart-pie-interactive", title: "Pie Chart", description: "Interactive pie chart" },
    ],
  },
];
