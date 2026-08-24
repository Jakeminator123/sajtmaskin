"use client";

import React from "react";
import { VChart } from "@visactor/react-vchart";

type VChartProps = React.ComponentProps<typeof VChart>;

export type VisactorChartProps = {
  spec: NonNullable<VChartProps["spec"]>;
  className?: string;
  style?: React.CSSProperties;
  options?: VChartProps["options"];
  onReady?: VChartProps["onReady"];
};

export function VisactorChart({
  spec,
  className,
  style,
  options,
  onReady,
}: VisactorChartProps) {
  return (
    <div className={className} style={style}>
      <VChart spec={spec} options={options} onReady={onReady} />
    </div>
  );
}
