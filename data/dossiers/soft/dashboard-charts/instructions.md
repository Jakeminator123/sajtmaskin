# When to use

- Use for analytics or dashboard sections that need embedded VisActor/VChart charts.
- Best for KPI cards, reporting panels, SaaS analytics pages, and internal dashboards.
- Use when the host app already owns routing, layout, data fetching, and authentication.

# How to integrate

- Install the listed dependencies before importing the components.
- Render `VisactorChart` only from client-rendered UI or inside client component trees.
- Wrap charts in `ChartCard` to provide a title, description, actions, and consistent spacing.
- Import `salesLineSpec` only as a starter example; map real project data into your own chart specs.
- Use `addThousandsSeparator` and `numberToPercentage` for simple KPI formatting.

# UX rules

- Give every chart a clear title and short description.
- Set a stable height or minimum height on the chart wrapper so it does not collapse.
- Show loading and empty states when chart data is async or unavailable.
- Keep each chart focused on one primary metric or comparison.
- Include surrounding text for the main takeaway; do not rely only on chart color.

# Avoid

- Do not treat this as a complete dashboard shell, navigation system, or data layer.
- Do not ship the sample `salesLineSpec` as production analytics data.
- Do not render VisActor charts from server-only components.
- Do not import template-specific routes, providers, mock data, or global layout code.
- Do not add environment variables or server routes for this soft dossier.

# Verification

- The app builds with no unresolved imports.
- At least one chart renders through `VisactorChart` with a valid VChart spec.
- Chart containers have stable dimensions on first render.
- Empty, loading, and real-data states are handled by the host page.
- Formatting helpers return expected values for representative KPI numbers.
