"use client";

import React from "react";
import { VChart } from "@visactor/react-vchart";

export type VisactorChartProps = {
  spec: Record<string, unknown>;
  className?: string;
  style?: React.CSSProperties;
  option?: Record<string, unknown>;
  onReady?: (instance: unknown) => void;
};

export function VisactorChart({
  spec,
  className,
  style,
  option,
  onReady,
}: VisactorChartProps) {
  return (
    <div className={className} style={style}>
      <VChart spec={spec} option={option} onReady={onReady} />
    </div>
  );
}
