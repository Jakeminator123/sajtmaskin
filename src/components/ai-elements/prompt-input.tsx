"use client";

/**
 * PromptInput Component (AI Elements)
 *
 * Advanced input component for AI chat with attachments, model picker, and actions.
 * Based on Vercel AI Elements specification.
 */

import {
  createContext,
  useContext,
  type HTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils/utils";

// ============================================================================
// TYPES
// ============================================================================

export interface PromptInputMessage {
  text: string;
  attachments?: Array<{
    type: "file" | "image";
    url: string;
    name: string;
  }>;
}

// ============================================================================
// CONTEXT
// ============================================================================

interface PromptInputContextValue {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: PromptInputMessage) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

function usePromptInput() {
  const context = useContext(PromptInputContext);
  if (!context) {
    throw new Error("usePromptInput must be used within PromptInput");
  }
  return context;
}

// ============================================================================
// PROMPT INPUT ROOT
// ============================================================================

export interface PromptInputProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "onSubmit"> {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: PromptInputMessage) => void;
  isLoading?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  disabled,
  children,
  className,
  ...props
}: PromptInputProps) {
  return (
    <PromptInputContext.Provider
      value={{ value, onChange, onSubmit, isLoading, disabled }}
    >
      <div
        className={cn(
          "relative flex flex-col rounded-2xl border border-zinc-700 bg-zinc-900",
          "focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500/50",
          "transition-colors",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </PromptInputContext.Provider>
  );
}

// ============================================================================
// PROMPT INPUT HEADER (Optional top section)
// ============================================================================

export interface PromptInputHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PromptInputHeader({
  children,
  className,
  ...props
}: PromptInputHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 pt-2 pb-1 border-b border-zinc-800",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// PROMPT INPUT BODY (Main content area)
// ============================================================================

export interface PromptInputBodyProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PromptInputBody({
  children,
  className,
  ...props
}: PromptInputBodyProps) {
  return (
    <div
      className={cn("flex-1 flex items-end gap-2 p-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// PROMPT INPUT TEXTAREA
// ============================================================================

export interface PromptInputTextareaProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "onChange"
  > {
  minRows?: number;
  maxRows?: number;
}

export function PromptInputTextarea({
  className,
  minRows = 1,
  maxRows = 6,
  placeholder = "Skriv ett meddelande...",
  ...props
}: PromptInputTextareaProps) {
  const { value, onChange, onSubmit, isLoading, disabled } = usePromptInput();

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Auto-resize textarea
    e.target.style.height = "auto";
    const lineHeight = 24;
    const minHeight = minRows * lineHeight;
    const maxHeight = maxRows * lineHeight;
    e.target.style.height = `${Math.min(
      Math.max(e.target.scrollHeight, minHeight),
      maxHeight
    )}px`;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !isLoading && !disabled) {
      e.preventDefault();
      if (value.trim()) {
        onSubmit({ text: value });
      }
    }
  };

  return (
    <textarea
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      disabled={isLoading || disabled}
      placeholder={placeholder}
      rows={minRows}
      className={cn(
        "flex-1 resize-none bg-transparent text-sm text-white",
        "placeholder:text-zinc-500 focus:outline-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
}

// ============================================================================
// PROMPT INPUT SUBMIT
// ============================================================================

export interface PromptInputSubmitProps
  extends HTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
}

export function PromptInputSubmit({
  children,
  className,
  ...props
}: PromptInputSubmitProps) {
  const { value, onSubmit, isLoading, disabled } = usePromptInput();

  const handleClick = () => {
    if (value.trim() && !isLoading && !disabled) {
      onSubmit({ text: value });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!value.trim() || isLoading || disabled}
      className={cn(
        "flex-shrink-0 p-2 rounded-xl",
        "bg-purple-600 text-white",
        "hover:bg-purple-500 active:bg-purple-700",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-600",
        "transition-colors",
        className
      )}
      {...props}
    >
      {children || (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
}

// ============================================================================
// PROMPT INPUT FOOTER (Optional bottom section)
// ============================================================================

export interface PromptInputFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PromptInputFooter({
  children,
  className,
  ...props
}: PromptInputFooterProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 pb-2 pt-1",
        "border-t border-zinc-800 text-xs text-zinc-500",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// PROMPT INPUT TOOLS (Action buttons container)
// ============================================================================

export interface PromptInputToolsProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PromptInputTools({
  children,
  className,
  ...props
}: PromptInputToolsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)} {...props}>
      {children}
    </div>
  );
}

// ============================================================================
// PROMPT INPUT ATTACHMENTS CONTAINER
// ============================================================================

export interface PromptInputAttachmentsProps
  extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PromptInputAttachments({
  children,
  className,
  ...props
}: PromptInputAttachmentsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 px-3 py-2 border-b border-zinc-800",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// PROMPT INPUT ATTACHMENT (Single attachment chip)
// ============================================================================

export interface PromptInputAttachmentProps
  extends HTMLAttributes<HTMLDivElement> {
  name: string;
  type?: "file" | "image";
  onRemove?: () => void;
}

export function PromptInputAttachment({
  name,
  type = "file",
  onRemove,
  className,
  ...props
}: PromptInputAttachmentProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg",
        "bg-zinc-800 text-sm text-zinc-300",
        className
      )}
      {...props}
    >
      {type === "image" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      )}
      <span className="truncate max-w-[150px]">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 text-zinc-500 hover:text-zinc-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ============================================================================
// PROMPT INPUT ACTION (Add attachments button)
// ============================================================================

export interface PromptInputActionAddAttachmentsProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, "onSelect"> {
  onSelect?: (files: FileList) => void;
  accept?: string;
}

export function PromptInputActionAddAttachments({
  onSelect,
  accept = "image/*,.pdf,.txt,.md",
  className,
  children,
  ...props
}: PromptInputActionAddAttachmentsProps) {
  const handleClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = accept;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && onSelect) {
        onSelect(files);
      }
    };
    input.click();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800",
        "transition-colors",
        className
      )}
      {...props}
    >
      {children || (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      )}
    </button>
  );
}
