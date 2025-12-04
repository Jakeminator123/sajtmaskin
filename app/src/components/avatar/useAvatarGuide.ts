"use client";

import { useState, useCallback } from "react";
import type { AvatarAnimation } from "./AvatarModel";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AvatarResponse {
  message: string;
  animation: AvatarAnimation;
}

// Map API response animations to our animation types
function mapAnimation(apiAnimation: string): AvatarAnimation {
  const animationMap: Record<string, AvatarAnimation> = {
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
    SHUFFLE: "shuffle",
    THINKING: "shuffle",
    URGENT: "run",
    SLEEP: "sleep",
  };
  return animationMap[apiAnimation] || "idle";
}

export function useAvatarGuide() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentAnimation, setCurrentAnimation] =
    useState<AvatarAnimation>("idle");

  // Send a message to the avatar guide
  const sendMessage = useCallback(
    async (
      userMessage: string,
      currentSection?: string,
      lastAction?: string
    ) => {
      if (!userMessage.trim()) return;

      // Add user message
      setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
      setIsLoading(true);
      setCurrentAnimation("shuffle"); // Thinking animation

      try {
        const response = await fetch("/api/avatar-guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            currentSection: currentSection || "home",
            lastAction: lastAction || "",
            conversationHistory: messages,
          }),
        });

        if (!response.ok) {
          throw new Error("API request failed");
        }

        const data: AvatarResponse = await response.json();

        // Add assistant message
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message },
        ]);

        // Set animation based on response
        setCurrentAnimation(mapAnimation(data.animation));

        // Return to idle after talking animation
        setTimeout(() => {
          setCurrentAnimation("idle");
        }, 4000);
      } catch (error) {
        console.error("Avatar guide error:", error);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Oj, något gick fel! Försök igen om en liten stund. 🙏",
          },
        ]);
        setCurrentAnimation("idle");
      } finally {
        setIsLoading(false);
      }
    },
    [messages]
  );

  // Get a proactive tip based on current section
  const getProactiveTip = useCallback(
    async (currentSection: string, lastAction?: string) => {
      setIsLoading(true);
      setCurrentAnimation("shuffle");

      try {
        const response = await fetch("/api/avatar-guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "[PROACTIVE_TIP]",
            currentSection,
            lastAction: lastAction || "",
            conversationHistory: [],
          }),
        });

        if (!response.ok) {
          throw new Error("API request failed");
        }

        const data: AvatarResponse = await response.json();

        setMessages([{ role: "assistant", content: data.message }]);
        setCurrentAnimation(mapAnimation(data.animation));

        setTimeout(() => {
          setCurrentAnimation("idle");
        }, 4000);
      } catch (error) {
        console.error("Proactive tip error:", error);
        // Silent fail for proactive tips
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Clear conversation
  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentAnimation("idle");
  }, []);

  // Manually set animation
  const setAnimation = useCallback((animation: AvatarAnimation) => {
    setCurrentAnimation(animation);
  }, []);

  return {
    messages,
    isLoading,
    currentAnimation,
    sendMessage,
    getProactiveTip,
    clearMessages,
    setAnimation,
  };
}

