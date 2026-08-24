"use client";

/**
 * <Term k="iv">IV</Term> — wraps a metric label with a click-to-open
 * explainer card sourced from the bilingual glossary (lib/glossary.ts).
 *
 * Interaction contract:
 * - Click toggles the card (works on touch); Escape or an outside click
 *   closes it. Only one card is open at a time (module-level closer).
 * - Unknown key → renders children unchanged (never blocks a label).
 * - stopPropagation on the trigger so table-row onClick handlers
 *   (chain row select) don't fire when the user asks for an explanation.
 *
 * Rendering: the card is PORTALED to document.body with position:fixed —
 * an ancestor with overflow (`.table-scroll`, the T-chain viewport, any
 * scrolling panel) clips absolutely-positioned children, which cut cards
 * off at container edges (2026-08-16 bug: last-row "Exposure" card was
 * invisible). Fixed+portal escapes every clipping context; placement
 * flips horizontally near the right edge and VERTICALLY when there is no
 * room below (last table rows open upward), and follows scroll/resize.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { GLOSSARY } from "@/lib/glossary";
import { useLang } from "@/lib/i18n";

let closeOpenCard: (() => void) | null = null;

// Must match .term-pop's CSS width; viewport margin keeps cards off edges.
const CARD_WIDTH = 280;
const EDGE = 8;
const GAP = 6;

export default function Term({ k, children }: { k: string; children: ReactNode }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLSpanElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const card = cardRef.current;
    if (!trigger || !card) return;
    const r = trigger.getBoundingClientRect();
    const cardH = card.offsetHeight;
    let left = r.left;
    if (left + CARD_WIDTH > window.innerWidth - EDGE) {
      left = Math.max(EDGE, r.right - CARD_WIDTH);
    }
    // Below the trigger by default; flip ABOVE when the viewport bottom
    // would clip the card (e.g. last table rows).
    let top = r.bottom + GAP;
    if (top + cardH > window.innerHeight - EDGE) {
      top = Math.max(EDGE, r.top - GAP - cardH);
    }
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    if (closeOpenCard && closeOpenCard !== close) closeOpenCard();
    closeOpenCard = close;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || cardRef.current?.contains(target)) {
        return;
      }
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onReflow = () => place();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    // capture: true so scrolls inside nested containers reposition too.
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
      if (closeOpenCard === close) closeOpenCard = null;
    };
  }, [open, close, place]);

  const entry = GLOSSARY[k];
  if (!entry) return <>{children}</>;
  const side = lang === "zh" ? entry.zh : entry.en;

  return (
    <span className={`term${open ? " term-open" : ""}`}>
      <button
        type="button"
        className="term-trigger"
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        title={side.short}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <span
            className="term-pop"
            ref={cardRef}
            role="tooltip"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="term-pop-name">{side.name}</span>
            <span className="term-pop-short">{side.short}</span>
            <span className="term-pop-read">{side.read}</span>
          </span>,
          document.body,
        )}
    </span>
  );
}
