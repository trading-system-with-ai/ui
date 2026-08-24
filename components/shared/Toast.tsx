"use client";

/**
 * Toast notifications (upgrade §31/§32) — success and status messages that
 * never block. Blocking dialogs are reserved for consent (§28); toasts carry
 * outcomes: "Watchlist added", "Plan saved", "Position closed", …
 *
 * Severity follows the §32 system exactly: INFO / SUCCESS / WARNING /
 * CRITICAL — the same green/amber/red/accent semantics as the badge maps,
 * never a per-page palette. Announced politely to screen readers; auto-
 * dismisses (CRITICAL stays until dismissed); manual dismiss always
 * available.
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastSeverity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

interface ToastItem {
  id: number;
  severity: ToastSeverity;
  message: string;
}

const AUTO_DISMISS_MS = 6000;

const ToastContext = createContext<(severity: ToastSeverity, message: string) => void>(
  () => {},
);

/** `const toast = useToast(); toast("SUCCESS", "Plan applied");` */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (severity: ToastSeverity, message: string) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts, { id, severity, message }]);
      // CRITICAL toasts stay until the user dismisses them (§32); the rest
      // auto-dismiss.
      if (severity !== "CRITICAL") {
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.severity.toLowerCase()}`} role="status">
            <span className={`toast-dot ${t.severity.toLowerCase()}`} aria-hidden="true" />
            <span className="toast-msg">{t.message}</span>
            <button
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
