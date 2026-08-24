"use client";

/**
 * Application-styled confirmation dialog (upgrade §28/§29/§30) — composes
 * Modal (focus trap / ESC / ARIA / focus return). Use for actions where user
 * consent matters; the body copy must state the REAL consequences (§30).
 * Never use browser-native confirm().
 */
import { type ReactNode } from "react";
import Modal from "./Modal";

export default function ConfirmDialog({
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  disabled = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm action as destructive (§29). */
  destructive?: boolean;
  /** Shows a busy state and blocks double-submit (§47 loading state). */
  loading?: boolean;
  /** Blocks submit while a precondition is unmet (§47 disabled submit). */
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={loading ? () => {} : onCancel} maxWidth={480}>
      <div style={{ fontSize: 13, lineHeight: 1.6 }}>{children}</div>
      <div
        className="row"
        style={{ justifyContent: "flex-end", marginTop: 16, gap: 8 }}
      >
        <button onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </button>
        <button
          className={destructive ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={loading || disabled}
        >
          {loading ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
