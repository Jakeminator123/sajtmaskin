# When to use

Use this dossier when the site needs **embedded analytics or dashboard-style data visualization** in a Next.js app using **VisActor / VChart**.

Best fit:
- admin dashboards
- product analytics pages
- internal reporting tools
- SaaS app shells with KPI cards and charts

Not a fit:
- simple marketing sites with no real data visualization
- cases where you need a full prebuilt dashboard shell with navigation, auth, and data APIs

# How to integrate

## 1) Install dependencies

This dossier assumes these packages are available:

```bash
npm install @visactor/react-vchart @visactor/vchart clsx tailwind-merge
```

If your app already has a `cn` helper, keep your existing one.

## 2) Keep only the reusable primitives

This template source included a full app layout tied to missing files (`nav`, `providers`, `site config`, global styles). Do **not** reuse that layout directly.

Use the kept files as primitives:
- `components/src/components/container.tsx` for page width/layout
- `components/src/components/icons.tsx` for the VisActor logo
- `components/src/lib/utils.ts` for class merging and number formatting

## 3) Render charts from a client component

VisActor charts should be rendered in a **client component**.

Example chart wrapper:

```tsx
"use client";

import { VChart } from "@visactor/react-vchart";

const spec = {
  type: "line",
  data: [
    {
      id: "revenue",
      values: [
        { month: "Jan", value: 1200 },
        { month: "Feb", value: 1800 },
        { month: "Mar", value: 1600 }
      ]
    }
  ],
  xField: "month",
  yField: "value",
  seriesField: "id",
  axes: [
    { orient: "bottom", type: "band" },
    { orient: "left", type: "linear" }
  ]
};

export function RevenueChart() {
  return <VChart spec={spec} />;
}
```

Or use the reusable wrapper from this dossier:

```tsx
"use client";

import { VisactorChart } from "@/components/visactor-chart";
import { salesLineSpec } from "@/lib/visactor-specs";

export function RevenueChart() {
  return <VisactorChart spec={salesLineSpec} className="h-[320px] w-full" />;
}
```

## 4) Compose charts inside dashboard sections

Use a neutral card/container pattern rather than template-specific page chrome.

```tsx
import Container from "@/components/container";
import { ChartCard } from "@/components/chart-card";
import { RevenueChart } from "@/components/revenue-chart";

export default function AnalyticsPage() {
  return (
    <Container className="py-8">
      <div className="grid gap-6 md:grid-cols-2">
        <ChartCard
          title="Revenue"
          description="Monthly recurring revenue trend"
        >
          <RevenueChart />
        </ChartCard>

        <ChartCard
          title="Active users"
          description="Weekly active users over time"
        >
          <RevenueChart />
        </ChartCard>
      </div>
    </Container>
  );
}
```

## 5) Feed real data into chart specs

The extracted template included Jotai atoms tied to local mock files. That state should not be reused as-is.

Instead, map your own data into a VisActor spec:

```ts
const values = analyticsRows.map((row) => ({
  date: row.date,
  value: row.sessions
}));

const spec = {
  type: "line",
  data: [{ id: "sessions", values }],
  xField: "date",
  yField: "value",
  seriesField: "id"
};
```

If you need client-side filtering, create state around **your real domain data**, not the template's ticket metrics.

## 6) Format KPI numbers with the provided utilities

```ts
import { addThousandsSeparator, numberToPercentage } from "@/lib/utils";

addThousandsSeparator(1234567); // "1,234,567"
numberToPercentage(0.42); // "42%"
```

# UX rules

- Prefer **one clear metric per chart**; avoid overloading a single chart with too many series.
- Always provide a visible chart title and short description.
- Give charts a fixed or minimum height so they do not collapse during hydration.
- Use accessible surrounding text for the main takeaway; do not rely only on color.
- In dashboard layouts, pair charts with 1-3 KPI summaries above or beside them.
- If data can be empty, show an explicit empty state instead of rendering a broken chart.
- Keep container widths constrained for readability; use `Container` or an equivalent wrapper.

# Avoid

- Do not reuse the extracted `app/layout.tsx`; it depends on missing template infrastructure and hardcodes a dashboard shell.
- Do not keep the extracted `atoms.ts` unless you also replace all template-specific imports (`@/data/...`, `@/types/...`) with your own real data layer.
- Do not render VisActor charts from a server-only component.
- Do not ship mock analytics data in production pages.
- Do not hardcode provider branding everywhere; use the logo sparingly.

# Verification

- App builds without unresolved imports from `nav`, `providers`, `site`, `data`, or `types`.
- At least one chart renders via `@visactor/react-vchart` in a client component.
- Chart container has a stable size on first render.
- Number formatting helpers return expected values.
- No template-specific dashboard layout code remains unless you intentionally rebuilt those dependencies.
- If real data is async, loading and empty states are handled cleanly.
