"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type ShimmerProps = ComponentProps<"span"> & {
  children: string;
};

export const Shimmer = ({ children, className, ...props }: ShimmerProps) => (
  <span className={cn("text-muted-foreground animate-pulse", className)} {...props}>
    {children}
  </span>
);
