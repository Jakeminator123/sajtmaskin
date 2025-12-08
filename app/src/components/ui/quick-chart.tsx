"use client";

import Image from "next/image";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * QuickChart Component
 *
 * Renders charts as images using QuickChart.io API.
 * No API key needed! Charts render server-side and return as PNG.
 *
 * Uses Chart.js configuration format.
 * Great for simple stats visualization without loading heavy chart libraries.
 */

export type ChartType =
  | "bar"
  | "line"
  | "pie"
  | "doughnut"
  | "radar"
  | "polarArea";

interface ChartDataset {
  label?: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
}

interface QuickChartConfig {
  type: ChartType;
  data: {
    labels: string[];
    datasets: ChartDataset[];
  };
  options?: {
    title?: {
      display: boolean;
      text: string;
      fontColor?: string;
    };
    legend?: {
      display: boolean;
      position?: "top" | "bottom" | "left" | "right";
      labels?: {
        fontColor?: string;
      };
    };
    scales?: {
      y?: {
        beginAtZero?: boolean;
        ticks?: {
          fontColor?: string;
        };
        grid?: {
          color?: string;
        };
      };
      x?: {
        ticks?: {
          fontColor?: string;
        };
        grid?: {
          color?: string;
        };
      };
    };
    plugins?: {
      legend?: {
        display: boolean;
      };
    };
  };
}

interface QuickChartProps {
  config: QuickChartConfig;
  width?: number;
  height?: number;
  backgroundColor?: string;
  className?: string;
  alt?: string;
}

export function QuickChart({
  config,
  width = 400,
  height = 300,
  backgroundColor = "transparent",
  className,
  alt = "Chart",
}: QuickChartProps) {
  const chartUrl = useMemo(() => {
    const chartJson = JSON.stringify(config);
    const encodedConfig = encodeURIComponent(chartJson);
    return `https://quickchart.io/chart?c=${encodedConfig}&w=${width}&h=${height}&bkg=${encodeURIComponent(
      backgroundColor
    )}&f=png`;
  }, [config, width, height, backgroundColor]);

  return (
    <Image
      src={chartUrl}
      alt={alt}
      width={width}
      height={height}
      className={cn("", className)}
      unoptimized // External URL
    />
  );
}

// Pre-built chart components for common use cases

interface SimpleBarChartProps {
  labels: string[];
  data: number[];
  title?: string;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}

export function SimpleBarChart({
  labels,
  data,
  title,
  color = "#14b8a6", // teal-500
  width = 400,
  height = 250,
  className,
}: SimpleBarChartProps) {
  const config: QuickChartConfig = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: color,
          borderColor: color,
          borderWidth: 1,
        },
      ],
    },
    options: {
      title: title
        ? { display: true, text: title, fontColor: "#e4e4e7" }
        : undefined,
      legend: { display: false },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { fontColor: "#a1a1aa" },
          grid: { color: "#27272a" },
        },
        x: {
          ticks: { fontColor: "#a1a1aa" },
          grid: { color: "#27272a" },
        },
      },
    },
  };

  return (
    <QuickChart
      config={config}
      width={width}
      height={height}
      backgroundColor="#0a0a0a"
      className={className}
      alt={title || "Bar chart"}
    />
  );
}

interface SimpleLineChartProps {
  labels: string[];
  data: number[];
  title?: string;
  color?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export function SimpleLineChart({
  labels,
  data,
  title,
  color = "#14b8a6",
  fill = false,
  width = 400,
  height = 250,
  className,
}: SimpleLineChartProps) {
  const config: QuickChartConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: color,
          backgroundColor: fill ? `${color}33` : "transparent",
          fill,
          borderWidth: 2,
        },
      ],
    },
    options: {
      title: title
        ? { display: true, text: title, fontColor: "#e4e4e7" }
        : undefined,
      legend: { display: false },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { fontColor: "#a1a1aa" },
          grid: { color: "#27272a" },
        },
        x: {
          ticks: { fontColor: "#a1a1aa" },
          grid: { color: "#27272a" },
        },
      },
    },
  };

  return (
    <QuickChart
      config={config}
      width={width}
      height={height}
      backgroundColor="#0a0a0a"
      className={className}
      alt={title || "Line chart"}
    />
  );
}

interface SimplePieChartProps {
  labels: string[];
  data: number[];
  title?: string;
  colors?: string[];
  width?: number;
  height?: number;
  className?: string;
}

export function SimplePieChart({
  labels,
  data,
  title,
  colors = ["#14b8a6", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"],
  width = 300,
  height = 300,
  className,
}: SimplePieChartProps) {
  const config: QuickChartConfig = {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors.slice(0, data.length),
        },
      ],
    },
    options: {
      title: title
        ? { display: true, text: title, fontColor: "#e4e4e7" }
        : undefined,
      legend: {
        display: true,
        position: "bottom",
        labels: { fontColor: "#a1a1aa" },
      },
    },
  };

  return (
    <QuickChart
      config={config}
      width={width}
      height={height}
      backgroundColor="#0a0a0a"
      className={className}
      alt={title || "Pie chart"}
    />
  );
}
