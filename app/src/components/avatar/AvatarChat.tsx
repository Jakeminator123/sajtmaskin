"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageCircle, Sparkles, Send } from "lucide-react";
import { Avatar3D } from "./Avatar3D";
import { useAvatarGuide } from "./useAvatarGuide";
import type { AvatarAnimation } from "./AvatarModel";

interface AvatarChatProps {
  /** Current section user is viewing */
  currentSection?: "home" | "builder" | "templates" | "audit" | "projects";
  /** User's last significant action */
  lastAction?: string;
  /** Whether to show proactive tips */
  proactive?: boolean;
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
}

export function AvatarChat({
  currentSection = "home",
  lastAction = "",
  proactive = true,
  defaultCollapsed = true,
}: AvatarChatProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);
  const [userInput, setUserInput] = useState("");
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isLoading,
    currentAnimation,
    sendMessage,
    getProactiveTip,
    clearMessages,
  } = useAvatarGuide();

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Get proactive tip when section changes (if enabled)
  useEffect(() => {
    if (proactive && isExpanded && messages.length === 0) {
      const timer = setTimeout(() => {
        getProactiveTip(currentSection, lastAction);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [
    currentSection,
    isExpanded,
    proactive,
    messages.length,
    getProactiveTip,
    lastAction,
  ]);

  const handleSend = () => {
    if (!userInput.trim() || isLoading) return;
    sendMessage(userInput, currentSection, lastAction);
    setUserInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", damping: 20 }}
            className="bg-black/90 backdrop-blur-xl border border-teal-500/30 rounded-2xl shadow-2xl shadow-teal-500/10 overflow-hidden"
            style={{ width: "360px", height: "500px" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-teal-500/20 bg-gradient-to-r from-teal-900/30 to-transparent">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span className="text-sm font-medium text-white">
                  Sajtmaskin Guide
                </span>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Avatar 3D View */}
            <div className="h-40 bg-gradient-to-b from-teal-900/20 to-transparent">
              <Avatar3D
                animation={currentAnimation}
                className="w-full h-full"
                enableControls={false}
              />
            </div>

            {/* Chat Messages */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
              style={{ height: "180px" }}
            >
              {messages.length === 0 && !isLoading && (
                <div className="text-center text-gray-500 text-sm py-4">
                  <p>Hej! 👋</p>
                  <p className="mt-1">
                    Fråga mig vad som helst om att bygga din sajt!
                  </p>
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
                  <div className="bg-gray-800 border border-gray-700 px-4 py-2 rounded-xl">
                    <div className="flex gap-1">
                      <span
                        className="w-2 h-2 bg-teal-500 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <span
                        className="w-2 h-2 bg-teal-500 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-2 h-2 bg-teal-500 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-teal-500/20">
              <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-3 py-2 border border-gray-700 focus-within:border-teal-500/50 transition-colors">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ställ en fråga..."
                  disabled={isLoading}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                />
                <button
                  onClick={handleSend}
                  disabled={!userInput.trim() || isLoading}
                  className="p-1.5 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsExpanded(true)}
            className="relative w-16 h-16 bg-gradient-to-br from-teal-600 to-teal-800 rounded-full shadow-lg shadow-teal-500/30 border border-teal-400/30 flex items-center justify-center group"
          >
            <MessageCircle className="w-7 h-7 text-white group-hover:scale-110 transition-transform" />

            {/* Pulse animation */}
            <span className="absolute inset-0 rounded-full bg-teal-500/30 animate-ping" />

            {/* Tooltip */}
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              Behöver du hjälp?
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AvatarChat;
