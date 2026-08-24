"use client";

/**
 * Event date-status badge (§7): show a warning chip ONLY when the event's
 * date is not confirmed — an ESTIMATED date must be visible before reading
 * anything scoped to it, and a CONFIRMED one must NOT cry wolf. Accepts
 * the backend struct or a legacy bare string.
 * (2026-08-20 fix: the struct was rendered directly as a React child and
 * crashed; the non-empty guard also showed the chip for CONFIRMED.)
 */
export interface EventStatusBadge {
  status: string;
  is_estimated: boolean;
  source: string | null;
  source_name: string | null;
  note: string | null;
}

export function badgeInfo(
  b: EventStatusBadge | string | null | undefined,
): { show: boolean; text: string; title: string } {
  if (b == null || b === "") return { show: false, text: "", title: "" };
  if (typeof b === "string") return { show: true, text: b, title: b };
  if (!b.is_estimated) return { show: false, text: "", title: "" };
  const src = b.source_name || b.source || "";
  return {
    show: true,
    text: src ? `${b.status} (${src})` : b.status,
    title: b.note || b.status,
  };
}
