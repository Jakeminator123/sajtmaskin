"use client";

import { Message, MessageAttachment, UserFileAttachment } from "@/lib/data/store";
import {
  Bot,
  Search,
  ImageIcon,
  Workflow,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils/utils";
import Image from "next/image";
import { useMemo, useState } from "react";

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

// Component to render web search results
function WebSearchResults({
  results,
}: {
  results: Array<{ title: string; url: string; snippet: string }>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const displayResults = isExpanded ? results : results.slice(0, 3);

  return (
    <div className="mt-3 border border-gray-700 bg-gray-800/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 border-b border-gray-700">
        <Search className="h-4 w-4 text-teal-400" />
        <span className="text-xs font-medium text-gray-300">
          Sökresultat ({results.length})
        </span>
      </div>
      <div className="divide-y divide-gray-700">
        {displayResults.map((result, index) => (
          <a
            key={`search-result-${index}-${result.url || ""}`}
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-start gap-2">
              <ExternalLink className="h-3 w-3 text-gray-500 mt-1 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-teal-400 truncate">
                  {result.title}
                </p>
                <p className="text-xs text-gray-500 truncate">{result.url}</p>
                {result.snippet && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                    {result.snippet}
                  </p>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
      {results.length > 3 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-3 py-2 text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-700/30 flex items-center justify-center gap-1 border-t border-gray-700"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Visa mindre
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Visa alla {results.length} resultat
            </>
          )}
        </button>
      )}
    </div>
  );
}

// Component to render generated images
function GeneratedImages({
  images,
  onUseImage,
}: {
  images: Array<{ base64?: string; prompt: string; url?: string }>;
  onUseImage?: (url: string, prompt: string) => void;
}) {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyUrl = (url: string, index: number) => {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <ImageIcon className="h-4 w-4 text-amber-400" />
        <span className="text-xs font-medium text-gray-300">
          Genererade bilder ({images.length})
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {images.map((img, index) => {
          const imgSrc =
            img.url ||
            (img.base64 ? `data:image/png;base64,${img.base64}` : undefined);

          // Skip rendering if neither URL nor base64 is available
          if (!imgSrc) return null;

          return (
            <div
              key={`generated-image-${index}-${
                img.url || img.base64?.slice(0, 20) || "no-src"
              }`}
              className="relative group"
            >
              <button
                onClick={() =>
                  setSelectedImage(selectedImage === index ? null : index)
                }
                className="w-full aspect-square rounded-lg overflow-hidden border border-gray-700 hover:border-teal-500 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc}
                  alt={img.prompt}
                  className="w-full h-full object-cover"
                />
              </button>

              {/* Hover overlay with actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 rounded-lg">
                {img.url && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyUrl(img.url!, index);
                      }}
                      className="px-3 py-1 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded transition-colors"
                    >
                      {copiedIndex === index ? "✓ Kopierad!" : "Kopiera URL"}
                    </button>
                    {onUseImage && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onUseImage(img.url!, img.prompt);
                        }}
                        className="px-3 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
                      >
                        Använd i sajten
                      </button>
                    )}
                  </>
                )}
                {!img.url && (
                  <span className="text-xs text-gray-400 text-center px-2">
                    Ej sparad permanent
                  </span>
                )}
              </div>

              {/* Prompt tooltip */}
              {selectedImage === index && (
                <div className="absolute left-0 right-0 top-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-xs text-gray-400 z-10">
                  <p className="mb-1">{img.prompt}</p>
                  {img.url && (
                    <p className="text-teal-400 text-[10px] truncate">
                      {img.url}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Component to render workflow steps
function WorkflowSteps({ steps }: { steps: string[] }) {
  return (
    <div className="mt-3 border border-gray-700 bg-gray-800/50 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 border-b border-gray-700">
        <Workflow className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-medium text-gray-300">Arbetsflöde</span>
      </div>
      <div className="px-3 py-2 space-y-1">
        {steps.map((step, index) => (
          <div
            key={`workflow-step-${index}-${step.slice(0, 30)}`}
            className="flex items-start gap-2"
          >
            <span className="text-xs text-purple-400 font-mono">
              {index + 1}.
            </span>
            <span className="text-xs text-gray-400">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Component to render user uploaded files
function UserUploadedFiles({
  files,
}: {
  files: Array<{
    url: string;
    filename: string;
    mimeType: string;
    purpose?: string;
  }>;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-2">
        <ImageIcon className="h-4 w-4 text-teal-400" />
        <span className="text-xs font-medium text-gray-300">
          Bifogade filer ({files.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {files.map((file, index) => (
          <div
            key={`user-file-${index}-${file.filename || file.url || ""}`}
            className="relative group"
          >
            {file.mimeType.startsWith("image/") ? (
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-16 h-16 rounded border border-gray-700 overflow-hidden hover:border-teal-500 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.url}
                  alt={file.filename}
                  className="w-full h-full object-cover"
                />
              </a>
            ) : (
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded bg-gray-800 border border-gray-700 hover:border-teal-500 transition-colors"
              >
                <ImageIcon className="h-3 w-3 text-gray-400" />
                <span className="text-xs text-gray-400 truncate max-w-[80px]">
                  {file.filename}
                </span>
              </a>
            )}
            {file.purpose && (
              <span className="absolute -bottom-1 left-0 right-0 text-center text-[10px] text-teal-400 truncate">
                {file.purpose}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Render attachments based on type
function MessageAttachments({
  attachments,
}: {
  attachments: MessageAttachment[];
}) {
  // Group user files together
  const userFiles = attachments.filter(
    (a): a is UserFileAttachment => a.type === "user_file"
  );
  const otherAttachments = attachments.filter((a) => a.type !== "user_file");

  return (
    <div className="space-y-2">
      {/* Render user uploaded files grouped */}
      {userFiles.length > 0 && (
        <UserUploadedFiles
          files={userFiles.map((f) => ({
            url: f.url,
            filename: f.filename,
            mimeType: f.mimeType,
            purpose: f.purpose,
          }))}
        />
      )}

      {/* Render other attachments */}
      {otherAttachments.map((attachment, index) => {
        // Create unique key combining type, index, and content hash
        const keyBase = `${attachment.type}-${index}`;
        let uniqueKey = keyBase;

        // Add content-based identifier if available
        if (attachment.type === "image" && attachment.url) {
          uniqueKey = `${keyBase}-${attachment.url.slice(-20)}`;
        } else if (
          attachment.type === "web_search" &&
          attachment.results?.length
        ) {
          uniqueKey = `${keyBase}-${
            attachment.results[0]?.url?.slice(-20) || ""
          }`;
        } else if (attachment.type === "workflow" && attachment.steps?.length) {
          uniqueKey = `${keyBase}-${attachment.steps[0]?.slice(0, 20) || ""}`;
        }

        switch (attachment.type) {
          case "web_search":
            return (
              <WebSearchResults key={uniqueKey} results={attachment.results} />
            );
          case "image":
            // Single image - wrap in array for component
            return (
              <GeneratedImages
                key={uniqueKey}
                images={[
                  {
                    base64: attachment.base64,
                    prompt: attachment.prompt,
                    url: attachment.url,
                  },
                ]}
              />
            );
          case "workflow":
            return <WorkflowSteps key={uniqueKey} steps={attachment.steps} />;
          default:
            return null;
        }
      })}
    </div>
  );
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

        {/* Render attachments if present */}
        {message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} />
        )}
      </div>
    </div>
  );
}
