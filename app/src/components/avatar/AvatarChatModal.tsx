"use client";

/**
 * AvatarChatModal.tsx
 * ===================
 * Expandable chat modal for interacting with the avatar guide.
 * Opens when user clicks on the avatar.
 *
 * Uses /api/avatar-guide for AI-powered responses with animation triggers.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles, Loader2 } from "lucide-react";
import { useAvatar, AppSection } from "@/contexts/AvatarContext";
import type { AvatarAnimation } from "./AvatarModel";

// ============================================================================
// TYPES
// ============================================================================

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AvatarChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSection: AppSection;
}

// Map API animation names to our animation types
const ANIMATION_MAP: Record<string, AvatarAnimation> = {
  IDLE: "idle",
  IDLE2: "idle2",
  IDLE3: "idle3",
  TALK: "talk",
  TALK_PASSION: "talk",
  TALK_HANDS: "talk_hands",
  TALK_LEFT: "talk_left",
  WALK: "walk",
  RUN: "run",
  CONFIDENT: "confident",
  THINKING: "shuffle",
  SHUFFLE: "shuffle",
  URGENT: "run",
  SLEEP: "sleep",
};

// ============================================================================
// COMPONENT
// ============================================================================

export function AvatarChatModal({
  isOpen,
  onClose,
  currentSection,
}: AvatarChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { triggerReaction } = useAvatar();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Send message to avatar guide API
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    // Show thinking animation
    triggerReaction("generation_start", "Låt mig tänka...");

    try {
      const response = await fetch("/api/avatar-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          currentSection,
          lastAction: "",
          conversationHistory: messages.slice(-6),
        }),
      });

      if (!response.ok) throw new Error("API error");

      const data = await response.json();

      // Add assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message },
      ]);

      // Trigger appropriate animation
      const animation = ANIMATION_MAP[data.animation] || "talk";
      // Use a custom reaction based on the animation
      if (animation === "confident") {
        triggerReaction("generation_complete", data.message);
      } else if (animation === "run") {
        triggerReaction("generation_error", data.message);
      } else {
        triggerReaction("form_submit", data.message);
      }
    } catch (error) {
      console.error("[AvatarChat] Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Oj, något gick fel! Försök igen. 🙏",
        },
      ]);
      triggerReaction("generation_error");
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, currentSection, triggerReaction]);

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute bottom-full right-0 mb-4 w-80 
                     bg-gradient-to-br from-gray-900/98 to-gray-950/98
                     backdrop-blur-xl border border-teal-500/30 
                     rounded-2xl shadow-2xl shadow-teal-500/20
                     overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-teal-500/20 bg-teal-900/20">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span className="text-sm font-medium text-white">Fråga mig!</span>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Messages */}
          <div className="h-64 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-8">
                <p className="mb-2">Hej! 👋</p>
                <p>Fråga mig vad som helst om att bygga din sajt!</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                    msg.role === "user"
                      ? "bg-teal-600 text-white"
                      : "bg-gray-800 text-gray-200 border border-gray-700"
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-gray-800 border border-gray-700 px-4 py-2 rounded-xl flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
                  <span className="text-sm text-gray-400">Tänker...</span>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-teal-500/20">
            <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-3 py-2 border border-gray-700 focus-within:border-teal-500/50 transition-colors">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ställ en fråga..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="p-1.5 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                <Send className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AvatarChatModal;
