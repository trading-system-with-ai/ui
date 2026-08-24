"use client";

/**
 * WHEN THIS CONTRACT REPRICED — the days worth investigating.
 *
 * A contract sitting at 36c tells you where the market is. It does not tell
 * you when it got there, and "when" is what leads to "why": the day a bracket
 * jumped 38 points is the day something happened, and that something is
 * usually findable in the record.
 *
 * Form (dataviz step 1): a one-dimensional strip plot on a TIME axis, one
 * mark per notable move, height encoding magnitude and side encoding
 * direction. The variable is a signed change at irregular instants over a
 * continuous span — not a series (the quiet days are deliberately absent, and
 * drawing them would bury the signal), not a bar chart (the x positions are
 * dates, not categories). A strip keeps the temporal spacing honest: three
 * moves in one week look clustered, which is itself the finding.
 *
 * Encoding decisions that are honesty rules, not taste:
 *
 *  A. THE MARK SPANS THE OBSERVATION WINDOW, NOT AN INSTANT. With daily
 *     points the true moment sits somewhere between two observations, so the
 *     mark is drawn across that gap rather than at a pinpoint. A dot on a
 *     single date would claim precision the data does not have, and a reader
 *     would go looking for news on the wrong day.
 *  B. NO CAUSE IS NAMED. This chart says a move happened and when. It does
 *     not pair the move with a headline, because a price move and a same-day
 *     story are a coincidence until someone checks — and a UI that quietly
 *     paired them would manufacture a false narrative that looks like
 *     analysis. The hover gives the reader the window to search; the
 *     conclusion stays theirs.
 *  C. DIRECTION IS GEOMETRY AND TEXT. Up-moves sit above the midline,
 *     down-moves below, and each carries its signed value. Colour reinforces
 *     but never carries: rising is not "good" — for a "<0.5% growth" bracket
 *     a rise is the market pricing a WORSE economy.
 *  D. AN EMPTY RESULT IS A FINDING. A contract with no move past the
 *     threshold renders a plain sentence, not an empty frame: "this market
 *     never changed its mind sharply" is information.
 *
 * Inline SVG, no chart library — the platform ships none.
 */
import { useT } from "@/lib/i18n";
import type { PriceMove } from "@/lib/types-research";

const UP_FILL = "#4493f8";
const DOWN_FILL = "#c08a1e";

const VB_W = 720;
const VB_H = 96;
const PAD = { top: 10, right: 10, bottom: 18, left: 10 };
const MIN_MARK_W = 3;

function day(iso: string): string {
  return (iso || "").slice(0, 10);
}

export default function PriceMoveTimeline({ moves }: { moves: PriceMove[] }) {
  const t = useT();
  if (!moves || moves.length === 0) return null;

  const stamps = moves.flatMap((m) => [
    Date.parse(m.from_ts),
    Date.parse(m.to_ts),
  ]);
  const usable = stamps.filter((n) => Number.isFinite(n));
  if (usable.length === 0) return null;

  // Pad the span so a mark at either edge is not clipped to a sliver.
  const lo = Math.min(...usable);
  const hi = Math.max(...usable);
  const span = Math.max(1, hi - lo);
  const pad = span * 0.04;
  const x = (ms: number) =>
    PAD.left + ((ms - (lo - pad)) / (span + pad * 2)) * (VB_W - PAD.left - PAD.right);

  const peak = Math.max(...moves.map((m) => Math.abs(m.change)), 0.1);
  const midY = PAD.top + (VB_H - PAD.top - PAD.bottom) / 2;
  const halfH = (VB_H - PAD.top - PAD.bottom) / 2;

  return (
    <div className="mv-timeline" data-testid="price-move-timeline">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={t(
          "Days this contract repriced sharply",
          "该合约出现大幅重新定价的日期",
        )}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* The midline is the "no change" reference, drawn full weight —
            everything on this chart is measured from it. */}
        <line
          x1={PAD.left}
          x2={VB_W - PAD.right}
          y1={midY}
          y2={midY}
          stroke="#8b949e"
          strokeWidth={1.25}
        />
        {moves.map((m, i) => {
          const a = Date.parse(m.from_ts);
          const b = Date.parse(m.to_ts);
          if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
          const x0 = x(a);
          // Rule A: the mark spans the window between observations.
          const w = Math.max(MIN_MARK_W, x(b) - x0);
          const h = (Math.abs(m.change) / peak) * halfH;
          const up = m.change > 0;
          return (
            <rect
              key={`${m.from_ts}-${i}`}
              x={x0}
              y={up ? midY - h : midY}
              width={w}
              height={Math.max(2, h)}
              fill={up ? UP_FILL : DOWN_FILL}
              rx={2}
              data-testid="mv-mark"
              data-direction={m.direction}
            >
              <title>
                {`${day(m.from_ts)} → ${day(m.to_ts)}\n${
                  up ? "+" : ""
                }${(m.change * 100).toFixed(1)}pp  (${(m.from_price * 100).toFixed(
                  0,
                )}c → ${(m.to_price * 100).toFixed(0)}c)`}
              </title>
            </rect>
          );
        })}
        <text x={PAD.left} y={VB_H - 4} className="mv-axis">
          {day(new Date(lo).toISOString())}
        </text>
        <text x={VB_W - PAD.right} y={VB_H - 4} textAnchor="end" className="mv-axis">
          {day(new Date(hi).toISOString())}
        </text>
      </svg>
      <p className="mv-note muted">
        {/* Rule B, stated where the reader is looking at the marks. */}
        {t(
          "Days this contract repriced sharply — a window to search for a cause, not a cause. Above the line the price rose, below it fell.",
          "该合约大幅重新定价的日期 — 这是可供查证成因的时间窗口，而非成因本身。基线以上为价格上涨，以下为下跌。",
        )}
      </p>
    </div>
  );
}
