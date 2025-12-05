"use client";

/**
 * AvatarChatModal.tsx
 * ===================
 * Expandable chat modal for interacting with the avatar guide.
 * Opens when user clicks on the avatar.
 *
 * Features:
 * - Text input for questions
 * - Voice input (speech-to-text) for talking
 * - AI-powered responses via /api/avatar-guide
 * - Animation triggers based on response content
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Send,
  Sparkles,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAvatar, AppSection } from "@/contexts/AvatarContext";
import type { AvatarAnimation } from "./AvatarModel";
import { useAvatarVoice } from "./useAvatarVoice";

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
// SPEECH RECOGNITION HOOK
// ============================================================================

function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Check if Speech Recognition is supported
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "sv-SE"; // Swedish

      recognition.onresult = (event) => {
        const current = event.resultIndex;
        const result = event.results[current];
        const transcriptText = result[0].transcript;
        setTranscript(transcriptText);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event) => {
        console.error("[Speech] Error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript("");
      setIsListening(true);
      recognitionRef.current.start();
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
  };
}

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
  const {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  // Voice output (TTS)
  const {
    isLoading: isVoiceLoading,
    isPlaying: isVoicePlaying,
    speak,
    stop: stopVoice,
    isEnabled: isVoiceEnabled,
    toggleVoice,
  } = useAvatarVoice();

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

  // Update input when speech transcript changes
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  // Send message to avatar guide API
  const sendMessage = useCallback(
    async (messageText?: string) => {
      const textToSend = messageText || input.trim();
      if (!textToSend || isLoading) return;

      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: textToSend }]);
      setIsLoading(true);

      // Show thinking animation
      triggerReaction("generation_start", "Låt mig tänka...");

      try {
        const response = await fetch("/api/avatar-guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: textToSend,
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
        if (animation === "confident") {
          triggerReaction("generation_complete", data.message);
        } else if (animation === "run") {
          triggerReaction("generation_error", data.message);
        } else {
          triggerReaction("form_submit", data.message);
        }

        // Speak the response if voice is enabled
        if (isVoiceEnabled && data.message) {
          speak(data.message);
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
    },
    [
      input,
      isLoading,
      messages,
      currentSection,
      triggerReaction,
      isVoiceEnabled,
      speak,
    ]
  );

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Handle voice button click
  const handleVoiceClick = () => {
    if (isListening) {
      stopListening();
      // Auto-send after stopping if we have text
      if (transcript.trim()) {
        setTimeout(() => sendMessage(transcript), 100);
      }
    } else {
      startListening();
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
              <span className="text-sm font-medium text-white">
                Fråga mig! 💬
              </span>
              {isSupported && (
                <span className="text-xs text-gray-500">(röst OK)</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Voice toggle button */}
              <button
                onClick={toggleVoice}
                className={`p-1.5 rounded-lg transition-colors ${
                  isVoiceEnabled
                    ? "hover:bg-white/10 text-teal-400"
                    : "hover:bg-white/10 text-gray-500"
                }`}
                title={isVoiceEnabled ? "Stäng av röst" : "Slå på röst"}
              >
                {isVoiceEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="h-64 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-sm py-8">
                <p className="mb-2">Hej! 👋</p>
                <p className="mb-4">
                  Fråga mig vad som helst om att bygga din sajt!
                </p>
                {isSupported && (
                  <p className="text-xs text-teal-400/70">
                    🎤 Klicka på mikrofonen för att prata
                  </p>
                )}
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

            {/* Voice loading/playing indicator */}
            {(isVoiceLoading || isVoicePlaying) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-start"
              >
                <div className="bg-teal-900/30 border border-teal-500/30 px-3 py-1.5 rounded-xl flex items-center gap-2">
                  {isVoiceLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 text-teal-400 animate-spin" />
                      <span className="text-xs text-teal-300">
                        Laddar röst...
                      </span>
                    </>
                  ) : (
                    <>
                      <motion.div
                        className="flex items-center gap-0.5"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        <div className="w-1 h-2 bg-teal-400 rounded-full" />
                        <div className="w-1 h-3 bg-teal-400 rounded-full" />
                        <div className="w-1 h-2 bg-teal-400 rounded-full" />
                      </motion.div>
                      <span className="text-xs text-teal-300">Pratar...</span>
                      <button
                        onClick={stopVoice}
                        className="ml-1 p-0.5 hover:bg-teal-800/50 rounded"
                        title="Stoppa"
                      >
                        <X className="w-3 h-3 text-teal-400" />
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-teal-500/20">
            {/* Voice indicator */}
            {isListening && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-2 p-2 bg-red-900/30 border border-red-500/30 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2 h-2 bg-red-500 rounded-full"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                  <span className="text-xs text-red-300">Lyssnar...</span>
                </div>
                {transcript && (
                  <p className="text-sm text-gray-300 mt-1 italic">
                    &quot;{transcript}&quot;
                  </p>
                )}
              </motion.div>
            )}

            <div className="flex items-center gap-2">
              {/* Voice button */}
              {isSupported && (
                <button
                  onClick={handleVoiceClick}
                  className={`p-2 rounded-lg transition-colors ${
                    isListening
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-teal-400"
                  }`}
                  title={isListening ? "Stoppa inspelning" : "Prata med mig"}
                >
                  {isListening ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              )}

              {/* Text input */}
              <div className="flex-1 flex items-center gap-2 bg-gray-900 rounded-xl px-3 py-2 border border-gray-700 focus-within:border-teal-500/50 transition-colors">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? "Lyssnar..." : "Ställ en fråga..."}
                  disabled={isLoading || isListening}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isLoading}
                  className="p-1.5 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AvatarChatModal;
