"use client";

import { Message } from "@/lib/store";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  // Handle timestamp which might be serialized as string from localStorage
  const formatTime = (timestamp: Date | string | number): string => {
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      return date.toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div
      className={cn(
        "flex gap-3 p-4 rounded-lg",
        isUser ? "bg-blue-600/10 ml-8" : "bg-zinc-800/50 mr-8"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-blue-600" : "bg-zinc-700"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <Bot className="h-4 w-4 text-zinc-300" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-zinc-300">
            {isUser ? "Du" : "SajtMaskin AI"}
          </span>
          <span className="text-xs text-zinc-600">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="text-sm text-zinc-300 whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </div>
  );
}

