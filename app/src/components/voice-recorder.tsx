"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Loader2, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceRecorderProps {
  onTranscript: (transcript: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  language?: "sv" | "en";
  placeholder?: string;
  className?: string;
}

export function VoiceRecorder({
  onTranscript,
  onRecordingChange,
  language = "sv",
  placeholder = "Klicka för att börja prata...",
  className = "",
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      // Setup audio analysis for visual feedback
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // Animate audio level
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(
            analyserRef.current.frequencyBinCount
          );
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average / 255);
        }
        animationRef.current = requestAnimationFrame(updateAudioLevel);
      };
      updateAudioLevel();

      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop audio analysis
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
        setAudioLevel(0);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Create blob from chunks
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        // Transcribe the audio
        await transcribeAudio(audioBlob);
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setRecordingTime(0);
      onRecordingChange?.(true);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Mikrofon-åtkomst nekad. Tillåt mikrofonen i webbläsaren.");
      } else {
        setError("Kunde inte starta inspelning. Kontrollera din mikrofon.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRecordingChange]);

  // Transcribe audio using Whisper API
  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      setIsTranscribing(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        formData.append("language", language);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Transkribering misslyckades");
        }

        if (data.transcript) {
          onTranscript(data.transcript);
        } else {
          setError("Inget tal upptäcktes. Försök igen.");
        }
      } catch (err) {
        console.error("Transcription error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Kunde inte transkribera. Försök igen."
        );
      } finally {
        setIsTranscribing(false);
      }
    },
    [language, onTranscript]
  );

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      onRecordingChange?.(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording, onRecordingChange]);

  // Format recording time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-3">
        {/* Main record button */}
        <Button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          variant={isRecording ? "destructive" : "outline"}
          size="lg"
          className={`relative gap-2 min-w-[180px] transition-all ${
            isRecording
              ? "bg-red-600 hover:bg-red-700 border-red-600"
              : "border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300"
          }`}
        >
          {isTranscribing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Transkriberar...
            </>
          ) : isRecording ? (
            <>
              <Square className="h-4 w-4 fill-current" />
              Stoppa ({formatTime(recordingTime)})
            </>
          ) : (
            <>
              <Mic className="h-5 w-5" />
              {placeholder}
            </>
          )}

          {/* Audio level indicator */}
          {isRecording && (
            <div
              className="absolute inset-0 rounded-md bg-red-400/20 transition-transform origin-left"
              style={{ transform: `scaleX(${audioLevel})` }}
            />
          )}
        </Button>

        {/* Visual audio level bars */}
        {isRecording && (
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-red-500 rounded-full transition-all"
                style={{
                  height: `${
                    8 + Math.min(audioLevel * 100, 100) * ((i + 1) / 5) * 0.2
                  }px`,
                  opacity: audioLevel > i * 0.2 ? 1 : 0.3,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <MicOff className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Recording hint */}
      {!isRecording && !isTranscribing && !error && (
        <p className="text-xs text-zinc-500">
          <Volume2 className="inline h-3 w-3 mr-1" />
          Beskriv din webbplats med rösten – vi transkriberar automatiskt
        </p>
      )}
    </div>
  );
}
