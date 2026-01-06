"use client";

/**
 * AI Chat Message Component
 *
 * Enhanced chat message using AI Elements components.
 * Drop-in replacement for ChatMessage with modern styling.
 *
 * Features:
 * - Uses AI Elements Message components
 * - Supports web search results
 * - Supports generated images
 * - Supports workflow steps
 * - Animated entry
 */

import { useMemo } from "react";
import Image from "next/image";
import { Bot, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
  MessageAvatar,
} from "@/components/ai-elements";
import type { Message as StoreMessage, MessageAttachment } from "@/lib/data/store";

// DiceBear avatar styles
const AVATAR_STYLES = [
  "avataaars",
  "bottts",
  "fun-emoji",
  "lorelei",
  "notionists",
  "open-peeps",
  "personas",
  "pixel-art",
];

interface AIChatMessageProps {
  message: StoreMessage;
  userSeed?: string;
  onCopy?: (content: string) => void;
}

export function AIChatMessage({
  message,
  userSeed = "user",
  onCopy,
}: AIChatMessageProps) {
  const isUser = message.role === "user";

  // Generate avatar URL
  const userAvatarUrl = useMemo(() => {
    const styleIndex =
      userSeed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
      AVATAR_STYLES.length;
    const style = AVATAR_STYLES[styleIndex];
    return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(
      userSeed
    )}&backgroundColor=0d9488&radius=0`;
  }, [userSeed]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    onCopy?.(message.content);
  };

  return (
    <Message from={isUser ? "user" : "assistant"} className="p-4">
      <MessageAvatar
        className={cn(
          "w-8 h-8 overflow-hidden",
          isUser ? "bg-purple-600" : "bg-zinc-700"
        )}
      >
        {isUser ? (
          <Image
            src={userAvatarUrl}
            alt="Avatar"
            width={32}
            height={32}
            className="w-full h-full"
            unoptimized
          />
        ) : (
          <Bot className="h-4 w-4 text-zinc-300" />
        )}
      </MessageAvatar>

      <MessageContent className="flex-1">
        <MessageResponse className="whitespace-pre-wrap">
          {message.content}
        </MessageResponse>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-3 space-y-3">
            {message.attachments.map((attachment, idx) => (
              <AttachmentRenderer key={idx} attachment={attachment} />
            ))}
          </div>
        )}

        {/* Actions (copy, etc.) */}
        <MessageActions>
          <MessageAction
            onClick={handleCopy}
            icon={<Copy className="h-4 w-4" />}
            label="Kopiera"
          />
        </MessageActions>
      </MessageContent>
    </Message>
  );
}

// Attachment renderer
function AttachmentRenderer({ attachment }: { attachment: MessageAttachment }) {
  switch (attachment.type) {
    case "web_search":
      return <WebSearchAttachment results={attachment.results} />;
    case "image":
      return (
        <ImageAttachment
          url={attachment.url}
          base64={attachment.base64}
          prompt={attachment.prompt}
        />
      );
    case "workflow":
      return <WorkflowAttachment steps={attachment.steps} />;
    default:
      return null;
  }
}

// Web search results
function WebSearchAttachment({
  results,
}: {
  results: Array<{ title: string; url: string; snippet: string }>;
}) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden">
      <div className="px-3 py-2 bg-zinc-700/50 border-b border-zinc-700 text-xs text-zinc-300 flex items-center gap-2">
        <ExternalLink className="h-3.5 w-3.5 text-teal-400" />
        Sökresultat ({results.length})
      </div>
      <div className="divide-y divide-zinc-700">
        {results.slice(0, 3).map((result, i) => (
          <a
            key={i}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 hover:bg-zinc-700/50 transition-colors"
          >
            <p className="text-sm text-teal-400 truncate">{result.title}</p>
            <p className="text-xs text-zinc-500 truncate">{result.url}</p>
            {result.snippet && (
              <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                {result.snippet}
              </p>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

// Image attachment
function ImageAttachment({
  url,
  base64,
  prompt,
}: {
  url?: string;
  base64?: string;
  prompt: string;
}) {
  const src = url || (base64 ? `data:image/png;base64,${base64}` : null);
  if (!src) return null;

  return (
    <div className="inline-block">
      <div className="relative group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={prompt}
          className="max-w-[200px] rounded-lg border border-zinc-700"
        />
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
          <span className="text-xs text-white px-2 text-center line-clamp-3">
            {prompt}
          </span>
        </div>
      </div>
    </div>
  );
}

// Workflow steps
function WorkflowAttachment({ steps }: { steps: string[] }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden">
      <div className="px-3 py-2 bg-zinc-700/50 border-b border-zinc-700 text-xs text-zinc-300">
        Arbetsflöde
      </div>
      <div className="px-3 py-2 space-y-1">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="text-purple-400 font-mono">{i + 1}.</span>
            <span className="text-zinc-400">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AIChatMessage;
