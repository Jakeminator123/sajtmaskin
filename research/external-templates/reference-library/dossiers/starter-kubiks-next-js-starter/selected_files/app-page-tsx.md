# app/page.tsx

Reason: Useful structural reference

```text
"use client";

import Image from "next/image";
import { useState } from "react";

const integrations = [
	{
		name: "@kubiks/otel-drizzle",
		description: "OpenTelemetry instrumentation for Drizzle ORM",
		npm: "https://www.npmjs.com/package/@kubiks/otel-drizzle",
		github: "https://github.com/kubiks-inc/otel/tree/main/packages/otel-drizzle",
		status: "available",
	},
	{
		name: "@kubiks/otel-better-auth",
		description: "OpenTelemetry instrumentation for Better Auth",
		npm: "https://www.npmjs.com/package/@kubiks/otel-better-auth",
		github: "https://github.com/kubiks-inc/otel/tree/main/packages/otel-better-auth",
		status: "available",
	},
	{
		name: "@kubiks/otel-resend",
		description: "OpenTelemetry instrumentation for Resend",
		npm: "https://www.npmjs.com/package/@kubiks/otel-resend",
		github: "https://github.com/kubiks-inc/otel/tree/main/packages/otel-resend",
		status: "available",
	},
	{
		name: "@kubiks/otel-autumn",
		description: "OpenTelemetry instrumentation for Autumn",
		npm: "https://www.npmjs.com/package/@kubiks/otel-autumn",
		github: "https://github.com/kubiks-inc/otel/tree/main/packages/otel-autumn",
		status: "available",
	},
	{
		name: "@kubiks/otel-upstash-queues",
		description: "OpenTelemetry instrumentation for Upstash Queues",
		npm: "https://www.npmjs.com/package/@kubiks/otel-upstash-queues",
		github: "https://github.com/kubiks-inc/otel/tree/main/packages/otel-upstash-queues",
		status: "available",
	},
];

const features = [
	{
		title: "Real-time Dashboards",
		description:
			"Monitor your entire application with customizable dashboards. Track requests, errors, performance metrics, and more in real-time.",
	},
	{
		title: "Distributed Tracing",
		description:
			"Follow requests across your entire stack. See database queries, API calls, and third-party integrations in a single trace view.",
	},
	{
		title: "Error Tracking",
		description:
			"Automatic error detection and grouping with full stack traces. Get notified immediately when issues occur in production.",
	},
	{
		title: "Performance Analytics",
		description:
			"Track latency, throughput, and error rates. Identify bottlenecks with p50, p95, and p99 metrics.",
	},
];

const screenshots = [
	{
		image: "/feat-dashboard.png",
		alt: "Kubiks dashboard showing real-time metrics",
	},
	{
		image: "

// ... truncated
```
