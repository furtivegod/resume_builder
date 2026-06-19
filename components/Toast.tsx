"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ToastType = "success" | "error" | "warning";

const SNACKBAR_DURATION_MS = 10000;

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timeoutsRef = useRef<Map<number, number>>(new Map());

  const dismissToast = useCallback((id: number) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, type, message }]);

      const timeout = window.setTimeout(() => {
        dismissToast(id);
      }, SNACKBAR_DURATION_MS);
      timeoutsRef.current.set(id, timeout);
    },
    [dismissToast]
  );

  return { toasts, showToast, dismissToast };
}

function snackbarStyles(type: ToastType): { container: string; close: string } {
  switch (type) {
    case "success":
      return {
        container:
          "border border-emerald-500/40 bg-emerald-500/85 text-emerald-950 backdrop-blur-sm",
        close:
          "text-emerald-900/70 hover:bg-emerald-900/10 hover:text-emerald-950",
      };
    case "warning":
      return {
        container:
          "border border-amber-400/40 bg-amber-400/85 text-amber-950 backdrop-blur-sm",
        close: "text-amber-900/70 hover:bg-amber-900/10 hover:text-amber-950",
      };
    case "error":
      return {
        container:
          "border border-red-500/40 bg-red-500/85 text-red-950 backdrop-blur-sm",
        close: "text-red-900/70 hover:bg-red-900/10 hover:text-red-950",
      };
  }
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed right-5 top-16 z-[200] flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const styles = snackbarStyles(toast.type);
        return (
        <div
          key={toast.id}
          role="alert"
          className={`${styles.container} pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg`}
        >
          <p className="min-w-0 flex-1 leading-snug">{toast.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className={`flex-shrink-0 rounded p-0.5 text-lg leading-none transition-colors ${styles.close}`}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
        );
      })}
    </div>,
    document.body
  );
}
