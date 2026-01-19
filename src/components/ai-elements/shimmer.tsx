"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type ShimmerProps = ComponentProps<"span"> & {
  children: string;
};

export const Shimmer = ({ children, className, ...props }: ShimmerProps) => (
  <span className={cn("animate-pulse text-muted-foreground", className)} {...props}>
    {children}
  </span>
);
