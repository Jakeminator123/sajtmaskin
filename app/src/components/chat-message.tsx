"use client";

import { Message } from "@/lib/store";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useMemo } from "react";

// DiceBear avatar styles available
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

interface ChatMessageProps {
  message: Message;
  userSeed?: string; // Unique seed for user avatar (e.g., session ID)
}

export function ChatMessage({ message, userSeed = "user" }: ChatMessageProps) {
  const isUser = message.role === "user";

  // Generate consistent avatar URL based on seed
  const userAvatarUrl = useMemo(() => {
    // Use a consistent style based on the seed
    const styleIndex =
      userSeed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
      AVATAR_STYLES.length;
    const style = AVATAR_STYLES[styleIndex];
    return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(
      userSeed
    )}&backgroundColor=0d9488&radius=0`;
  }, [userSeed]);

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
        "flex gap-3 p-4",
        isUser ? "bg-teal-600/10 ml-8" : "bg-gray-800/50 mr-8"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 flex items-center justify-center overflow-hidden",
          isUser ? "bg-teal-600" : "bg-gray-700"
        )}
      >
        {isUser ? (
          <Image
            src={userAvatarUrl}
            alt="Din avatar"
            width={32}
            height={32}
            className="w-full h-full"
            unoptimized // External URL
          />
        ) : (
          <Bot className="h-4 w-4 text-gray-300" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-gray-300">
            {isUser ? "Du" : "SajtMaskin AI"}
          </span>
          <span className="text-xs text-gray-600">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className="text-sm text-gray-300 whitespace-pre-wrap">
          {message.content}
        </p>
      </div>
    </div>
  );
}
