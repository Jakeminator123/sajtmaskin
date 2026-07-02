"use client";

import { engineChatBaseUrl } from "@/lib/api/engine-chats-path";
import { Component, type ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  chatId?: string | null;
  versionId?: string | null;
  /**
   * When this value changes, a previously caught error is cleared so the
   * boundary re-renders its children instead of staying latched on the
   * fallback. The builder threads its `chatId` here so navigating to another
   * chat recovers a boundary that caught a render error in a previous chat
   * (without this, one render error locks the whole builder until reload).
   */
  resetKey?: unknown;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    const { chatId, versionId } = this.props;
    if (!chatId || !versionId) return;
    fetch(
      `${engineChatBaseUrl(chatId)}/versions/${encodeURIComponent(versionId)}/error-log`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: "error",
          category: "client",
          message: error.message || "Client error",
          meta: {
            stack: error.stack,
            componentStack: errorInfo?.componentStack || null,
          },
        }),
      },
    ).catch(() => {
      // Best-effort only
    });
  }

  componentDidUpdate(prevProps: Props) {
    // Recover on navigation: once `getDerivedStateFromError` latches `hasError`,
    // nothing else clears it, so a single render error would keep the fallback
    // mounted forever. When the caller-provided `resetKey` changes (the builder
    // passes `chatId`), drop the error so the new children render. No-op when
    // the key is unchanged, so same-chat behavior stays identical.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-xl font-semibold">Något gick fel</h2>
          <p className="text-muted-foreground mb-4">
            {this.state.error?.message || "Ett oväntat fel uppstod"}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="bg-brand-blue hover:bg-brand-blue/90 rounded px-4 py-2 text-white"
          >
            Ladda om sidan
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
