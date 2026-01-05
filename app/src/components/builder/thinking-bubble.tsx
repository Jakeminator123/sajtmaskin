"use client";

/**
 * ThinkingBubble Component
 * ========================
 * 
 * Visar v0:s "thinking" process i realtid.
 * Inspirerad av v0:s AI Elements Reasoning-komponent.
 */

import { useState } from "react";
import { Brain, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

interface ThinkingBubbleProps {
  thoughts: string[];
  isStreaming?: boolean;
  className?: string;
}

export function ThinkingBubble({ 
  thoughts, 
  isStreaming = false,
  className = "" 
}: ThinkingBubbleProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (thoughts.length === 0 && !isStreaming) {
    return null;
  }
  
  const latestThought = thoughts[thoughts.length - 1] || "";
  const hasMultipleThoughts = thoughts.length > 1;
  
  return (
    <div className={`bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border border-purple-500/30 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-purple-500/10 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Brain className={`h-4 w-4 text-purple-400 ${isStreaming ? "animate-pulse" : ""}`} />
            {isStreaming && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-purple-500 rounded-full animate-ping" />
            )}
          </div>
          <span className="text-sm font-medium text-purple-300">
            {isStreaming ? "AI tänker..." : "AI-resonemang"}
          </span>
          {hasMultipleThoughts && (
            <span className="text-xs text-purple-400/60 bg-purple-500/20 px-1.5 py-0.5 rounded">
              {thoughts.length} steg
            </span>
          )}
        </div>
        {hasMultipleThoughts && (
          isExpanded ? (
            <ChevronUp className="h-4 w-4 text-purple-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-purple-400" />
          )
        )}
      </button>
      
      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {hasMultipleThoughts ? (
            // Show all thoughts when expanded
            thoughts.map((thought, index) => (
              <ThoughtItem 
                key={index} 
                thought={thought} 
                index={index + 1}
                isLatest={index === thoughts.length - 1}
                isStreaming={isStreaming && index === thoughts.length - 1}
              />
            ))
          ) : (
            // Show single thought
            <ThoughtItem 
              thought={latestThought} 
              isLatest={true}
              isStreaming={isStreaming}
            />
          )}
          
          {/* Streaming indicator */}
          {isStreaming && thoughts.length === 0 && (
            <div className="flex items-center gap-2 text-purple-400/80">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <span className="text-xs">Analyserar...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ThoughtItemProps {
  thought: string;
  index?: number;
  isLatest?: boolean;
  isStreaming?: boolean;
}

function ThoughtItem({ thought, index, isLatest, isStreaming }: ThoughtItemProps) {
  // Split thought into lines for better formatting
  const lines = thought.split("\n").filter(line => line.trim());
  
  return (
    <div className={`relative pl-4 ${isLatest ? "opacity-100" : "opacity-60"}`}>
      {/* Timeline dot */}
      <div className={`absolute left-0 top-1.5 w-2 h-2 rounded-full ${
        isLatest 
          ? isStreaming 
            ? "bg-purple-400 animate-pulse" 
            : "bg-purple-500"
          : "bg-purple-600/50"
      }`} />
      
      {/* Step number */}
      {index !== undefined && (
        <span className="text-[10px] text-purple-500/50 font-mono">
          [{index}]
        </span>
      )}
      
      {/* Thought content */}
      <div className="text-sm text-purple-200/90 leading-relaxed">
        {lines.map((line, i) => (
          <p key={i} className={i > 0 ? "mt-1" : ""}>
            {line.startsWith("•") || line.startsWith("-") ? (
              <span className="text-purple-400">{line}</span>
            ) : line.includes(":") ? (
              <>
                <span className="text-purple-300 font-medium">
                  {line.split(":")[0]}:
                </span>
                <span>{line.split(":").slice(1).join(":")}</span>
              </>
            ) : (
              line
            )}
          </p>
        ))}
      </div>
      
      {/* Streaming cursor */}
      {isStreaming && isLatest && (
        <span className="inline-block w-2 h-4 bg-purple-400 animate-pulse ml-0.5" />
      )}
    </div>
  );
}

// Compact inline version for use in messages
export function ThinkingIndicator({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 text-purple-400 ${className}`}>
      <Sparkles className="h-3.5 w-3.5 animate-pulse" />
      <span className="text-xs">Tänker...</span>
      <div className="flex gap-0.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1 h-1 bg-purple-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
