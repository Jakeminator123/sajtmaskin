"use client";

/**
 * Message Component (AI Elements)
 *
 * Displays chat messages with support for different roles and content types.
 * Based on Vercel AI Elements specification.
 */

import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils/utils";

// ============================================================================
// MESSAGE ROOT
// ============================================================================

export type MessageRole = "user" | "assistant" | "system";

export interface MessageProps extends HTMLAttributes<HTMLDivElement> {
  from: MessageRole;
  children: ReactNode;
}

export function Message({ from, children, className, ...props }: MessageProps) {
  return (
    <div
      data-role={from}
      className={cn(
        "group flex gap-3",
        from === "user" && "flex-row-reverse",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// MESSAGE AVATAR
// ============================================================================

export interface MessageAvatarProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function MessageAvatar({
  children,
  className,
  ...props
}: MessageAvatarProps) {
  return (
    <div
      className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        "bg-zinc-800 text-zinc-300 text-sm font-medium",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// MESSAGE CONTENT
// ============================================================================

export interface MessageContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function MessageContent({
  children,
  className,
  ...props
}: MessageContentProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 max-w-[80%]",
        "group-data-[role=user]:items-end",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// MESSAGE RESPONSE (Text content with markdown support)
// ============================================================================

export interface MessageResponseProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function MessageResponse({
  children,
  className,
  ...props
}: MessageResponseProps) {
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3 text-sm leading-relaxed",
        "group-data-[role=user]:bg-purple-600 group-data-[role=user]:text-white",
        "group-data-[role=assistant]:bg-zinc-800 group-data-[role=assistant]:text-zinc-100",
        "group-data-[role=system]:bg-zinc-900 group-data-[role=system]:text-zinc-400 group-data-[role=system]:text-xs",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// MESSAGE ACTIONS
// ============================================================================

export interface MessageActionsProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function MessageActions({
  children,
  className,
  ...props
}: MessageActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// MESSAGE ACTION (Individual action button)
// ============================================================================

export interface MessageActionProps
  extends HTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  label?: string;
}

export function MessageAction({
  icon,
  label,
  className,
  children,
  ...props
}: MessageActionProps) {
  return (
    <button
      type="button"
      title={label}
      className={cn(
        "p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800",
        "transition-colors",
        className
      )}
      {...props}
    >
      {icon || children}
    </button>
  );
}

// ============================================================================
// MESSAGE TIMESTAMP
// ============================================================================

export interface MessageTimestampProps extends HTMLAttributes<HTMLSpanElement> {
  date: Date;
  format?: "time" | "datetime" | "relative";
}

export function MessageTimestamp({
  date,
  format = "time",
  className,
  ...props
}: MessageTimestampProps) {
  const formatDate = () => {
    if (format === "time") {
      return date.toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (format === "datetime") {
      return date.toLocaleString("sv-SE");
    }
    // relative
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just nu";
    if (diffMins < 60) return `${diffMins}m sedan`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h sedan`;
    return `${Math.floor(diffHours / 24)}d sedan`;
  };

  return (
    <span
      className={cn("text-xs text-zinc-500", className)}
      {...props}
    >
      {formatDate()}
    </span>
  );
}

