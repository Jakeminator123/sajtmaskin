"use client";

/**
 * Toast Notification Component
 * ============================
 * 
 * Enkel toast för feedback till användaren.
 * Används för success, error, warning och info meddelanden.
 */

import { useEffect, useState } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: "bg-green-900/90 border-green-500/50 text-green-100",
  error: "bg-red-900/90 border-red-500/50 text-red-100",
  warning: "bg-amber-900/90 border-amber-500/50 text-amber-100",
  info: "bg-blue-900/90 border-blue-500/50 text-blue-100",
};

const ICON_COLORS = {
  success: "text-green-400",
  error: "text-red-400",
  warning: "text-amber-400",
  info: "text-blue-400",
};

export function Toast({ message, type = "info", duration = 4000, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const Icon = ICONS[type];
  
  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, duration - 300); // Start exit animation 300ms before close
    
    const closeTimer = setTimeout(() => {
      onClose();
    }, duration);
    
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(closeTimer);
    };
  }, [duration, onClose]);
  
  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg
        ${COLORS[type]}
        ${isExiting ? "animate-slide-out" : "animate-slide-in"}
        transition-all duration-300
      `}
      role="alert"
    >
      <Icon className={`h-5 w-5 flex-shrink-0 ${ICON_COLORS[type]}`} />
      <p className="text-sm flex-1">{message}</p>
      <button
        onClick={() => {
          setIsExiting(true);
          setTimeout(onClose, 300);
        }}
        className="p-1 hover:bg-white/10 rounded transition-colors"
        aria-label="Stäng"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// Toast container for multiple toasts
interface ToastContainerProps {
  toasts: Array<{
    id: string;
    message: string;
    type: ToastType;
  }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}

// Hook for managing toasts
export function useToast() {
  const [toasts, setToasts] = useState<Array<{
    id: string;
    message: string;
    type: ToastType;
  }>>([]);
  
  const addToast = (message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    return id;
  };
  
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };
  
  const toast = {
    success: (message: string) => addToast(message, "success"),
    error: (message: string) => addToast(message, "error"),
    warning: (message: string) => addToast(message, "warning"),
    info: (message: string) => addToast(message, "info"),
  };
  
  return { toasts, toast, removeToast, ToastContainer };
}
