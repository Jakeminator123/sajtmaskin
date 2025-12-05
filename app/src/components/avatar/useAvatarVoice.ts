"use client";

/**
 * useAvatarVoice.ts
 * =================
 * Hook for handling avatar text-to-speech.
 *
 * Features:
 * - Primary: ElevenLabs API for high-quality Swedish voice
 * - Fallback: Web Speech API (free, built-in browser TTS)
 * - Provides loading/playing state
 * - Handles cleanup on unmount
 */

import { useState, useRef, useCallback, useEffect } from "react";

interface UseAvatarVoiceReturn {
  /** Whether audio is currently being fetched */
  isLoading: boolean;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Speak the given text (fetches TTS and plays) */
  speak: (text: string) => Promise<void>;
  /** Stop current playback */
  stop: () => void;
  /** Whether voice is enabled/available */
  isEnabled: boolean;
  /** Toggle voice on/off */
  toggleVoice: () => void;
}

/**
 * Web Speech API fallback for when ElevenLabs fails.
 * Returns a promise that resolves when speech ends.
 */
function speakWithWebSpeech(
  text: string,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("Web Speech API not supported"));
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Try to find a Swedish voice
    const voices = window.speechSynthesis.getVoices();
    const swedishVoice = voices.find(
      (v) => v.lang.startsWith("sv") || v.lang.includes("Swedish")
    );
    if (swedishVoice) {
      utterance.voice = swedishVoice;
    }

    utterance.lang = "sv-SE";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      onStart?.();
    };

    utterance.onend = () => {
      onEnd?.();
      resolve();
    };

    utterance.onerror = (e) => {
      onEnd?.();
      reject(e);
    };

    window.speechSynthesis.speak(utterance);
  });
}

export function useAvatarVoice(): UseAvatarVoiceReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  // Audio element ref for playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track if we're using Web Speech (to prevent double setIsPlaying(false))
  const usingWebSpeechRef = useRef(false);

  // Initialize audio element on mount
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.onended = () => {
      // Only set isPlaying false if we're not using Web Speech
      if (!usingWebSpeechRef.current) {
        setIsPlaying(false);
      }
    };

    audio.onerror = () => {
      // Only log/handle errors if we actually have a source loaded
      // (prevents spurious errors from empty Audio element)
      if (audio.src && audio.src !== window.location.href) {
        console.error("[AvatarVoice] Audio playback error");
        if (!usingWebSpeechRef.current) {
          setIsPlaying(false);
        }
      }
    };

    // Pre-load voices for Web Speech API fallback
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }

    return () => {
      // Cleanup on unmount
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Speak function - tries ElevenLabs first, falls back to Web Speech API
  const speak = useCallback(
    async (text: string) => {
      if (!isEnabled || !text.trim()) return;

      // Reset Web Speech flag
      usingWebSpeechRef.current = false;

      // Stop any current playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }

      // Abort any pending fetch
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      try {
        setIsLoading(true);
        abortControllerRef.current = new AbortController();

        // Try ElevenLabs API first
        const response = await fetch("/api/avatar/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          // API failed - use Web Speech fallback
          console.log(
            "[AvatarVoice] ElevenLabs failed, using Web Speech fallback"
          );
          setIsLoading(false);
          usingWebSpeechRef.current = true;

          await speakWithWebSpeech(
            text,
            () => setIsPlaying(true), // onStart
            () => setIsPlaying(false) // onEnd
          );
          usingWebSpeechRef.current = false;
          return;
        }

        // Get audio blob from ElevenLabs
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);

        // Play audio
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          setIsLoading(false);
          setIsPlaying(true);
          await audioRef.current.play();
        }

        // Cleanup URL after some time
        setTimeout(() => URL.revokeObjectURL(audioUrl), 60000);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          console.log("[AvatarVoice] Request aborted");
          setIsPlaying(false);
        } else {
          console.error("[AvatarVoice] ElevenLabs error:", error);
          // Fallback to Web Speech API
          try {
            console.log("[AvatarVoice] Using Web Speech fallback");
            setIsLoading(false);
            usingWebSpeechRef.current = true;

            await speakWithWebSpeech(
              text,
              () => setIsPlaying(true), // onStart
              () => setIsPlaying(false) // onEnd
            );
            usingWebSpeechRef.current = false;
            // Don't set isPlaying(false) here - it's handled by onEnd callback
            return;
          } catch (fallbackError) {
            console.error(
              "[AvatarVoice] Web Speech also failed:",
              fallbackError
            );
            setIsPlaying(false);
          }
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isEnabled]
  );

  // Stop playback
  const stop = useCallback(() => {
    usingWebSpeechRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  // Toggle voice on/off
  const toggleVoice = useCallback(() => {
    setIsEnabled((prev) => {
      if (prev) {
        // Turning off - stop current playback
        stop();
      }
      return !prev;
    });
  }, [stop]);

  return {
    isLoading,
    isPlaying,
    speak,
    stop,
    isEnabled,
    toggleVoice,
  };
}

export default useAvatarVoice;
