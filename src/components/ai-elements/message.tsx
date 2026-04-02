"use client";

/**
 * Message Component (AI Elements)
 *
 * Displays chat messages with support for different roles and content types.
 * Based on Vercel AI Elements specification.
 */

import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// MESSAGE ROOT
// ============================================================================

export type MessageRole = "user" | "assistant" | "system";

export interface MessageProps extends HTMLAttributes<HTMLDivElement> {
  from: MessageRole;
  children: ReactNode;
}

const MESSAGE_ROW_PERF_STYLE: CSSProperties = {
  contentVisibility: "auto",
  containIntrinsicSize: "0 80px",
};

export function Message({ from, children, className, style, ...props }: MessageProps) {
  return (
    <div
      data-role={from}
      className={cn("group flex gap-3", from === "user" && "flex-row-reverse", className)}
      style={{ ...MESSAGE_ROW_PERF_STYLE, ...style }}
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

export function MessageAvatar({ children, className, ...props }: MessageAvatarProps) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        "bg-muted text-sm font-medium text-foreground",
        className,
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
  role?: MessageRole;
}

export function MessageContent({ children, className, role, style, ...props }: MessageContentProps) {
  const isUser = role === "user";
  const isAssistant = role === "assistant";
  return (
    <div
      className={cn(
        "max-w-[85%] min-w-0 flex-col gap-1.5 rounded-2xl px-4 py-3 text-sm leading-relaxed",
        isUser && "ml-auto shadow-sm",
        isAssistant && "bg-muted text-foreground border border-border/40 shadow-sm",
        className,
      )}
      style={
        isUser
          ? {
              backgroundColor: "hsl(220 60% 22%)",
              color: "#ffffff",
              ...style,
            }
          : style
      }
      {...props}
    >
      {isUser ? <div style={{ color: "#ffffff" }}>{children}</div> : children}
    </div>
  );
}

// ============================================================================
// MESSAGE RESPONSE (Text content with markdown support)
// ============================================================================

export interface MessageResponseProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function MessageResponse({ children, className, ...props }: MessageResponseProps) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed overflow-hidden wrap-break-word",
        className,
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

export function MessageActions({ children, className, ...props }: MessageActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100",
        className,
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

export interface MessageActionProps extends HTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  label?: string;
}

export function MessageAction({ icon, label, className, children, ...props }: MessageActionProps) {
  return (
    <button
      type="button"
      title={label}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground",
        "transition-colors",
        className,
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
    <span className={cn("text-xs text-muted-foreground", className)} {...props}>
      {formatDate()}
    </span>
  );
}
