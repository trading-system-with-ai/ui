"use client";

/**
 * Watchlist directional-edge bars (dataviz addition 2026-08-20).
 *
 * Form: horizontal diverging bars from a zero baseline — the data's job
 * is POLARITY + magnitude per symbol (edge ∈ [-100, +100]). Color is the
 * platform's diverging pair (--green bull / --red bear) with position
 * carrying the same information, so identity is never color-alone.
 * Marks: thin bars, rounded data-ends, per-bar hover tooltip; symbols
 * are direct-labeled (≤ watchlist size), no legend needed for a
 * single diverging measure.
 */
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import type { WatchlistOverviewItem } from "@/lib/types";

const W = 720;
const ROW_H = 26;
const PAD = { left: 88, right: 56, top: 8, bottom: 18 };

export default function EdgeBars({ rows }: { rows: WatchlistOverviewItem[] }) {
  const t = useT();
  const el = useEnumLabel();
  const [hover, setHover] = useState<string | null>(null);
  const items = rows
    .filter((r) => r.directional_edge != null)
    .sort((a, b) => (b.directional_edge ?? 0) - (a.directional_edge ?? 0));
  if (items.length === 0) {
    return (
      <p className="empty">
        {t("No directional signals yet.", "暂无方向性信号。")}
      </p>
    );
  }
  const H = PAD.top + items.length * ROW_H + PAD.bottom;
  const plotW = W - PAD.left - PAD.right;
  const x0 = PAD.left + plotW / 2;
  const xOf = (v: number) => x0 + (v / 100) * (plotW / 2);

  return (
    <div className="chart-scroll">
      <div className="chart-inner">
        <div className="chart-sublabel">
          {t("Directional edge by symbol (−100 … +100)", "各标的方向性优势（−100 … +100）")}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label={t("Directional edge by symbol", "各标的方向性优势")}
          onPointerLeave={() => setHover(null)}
        >
          {[-100, -50, 0, 50, 100].map((g) => (
            <g key={g}>
              <line
                x1={xOf(g)} x2={xOf(g)} y1={PAD.top} y2={H - PAD.bottom}
                stroke="var(--border)" strokeWidth={g === 0 ? 1.4 : 0.5}
              />
              <text x={xOf(g)} y={H - 5} textAnchor="middle" fontSize={9} fill="var(--text-dim)">
                {g}
              </text>
            </g>
          ))}
          {items.map((r, i) => {
            const v = r.directional_edge ?? 0;
            const y = PAD.top + i * ROW_H + 5;
            const barH = ROW_H - 10;
            const w = Math.abs(xOf(v) - x0);
            return (
              <a key={r.ticker} href={`/watchlist/${r.ticker}`} onPointerEnter={() => setHover(r.ticker)}>
                <text
                  x={PAD.left - 8} y={y + barH / 2 + 3}
                  textAnchor="end" fontSize={11}
                  fill="var(--text)" fontFamily="var(--font-mono)"
                >
                  {r.ticker}
                </text>
                <rect
                  x={v >= 0 ? x0 : x0 - w}
                  y={y}
                  width={Math.max(w, 1)}
                  height={barH}
                  rx={3}
                  fill={v >= 0 ? "var(--green)" : "var(--red)"}
                  fillOpacity={hover === r.ticker ? 0.95 : 0.7}
                />
                <text
                  x={v >= 0 ? xOf(v) + 6 : xOf(v) - 6}
                  y={y + barH / 2 + 3}
                  textAnchor={v >= 0 ? "start" : "end"}
                  fontSize={10}
                  fill="var(--text-dim)"
                >
                  {v > 0 ? "+" : ""}
                  {v.toFixed(0)}
                </text>
              </a>
            );
          })}
        </svg>
        {hover != null && (() => {
          const r = items.find((x) => x.ticker === hover);
          if (!r) return null;
          return (
            <div className="chart-tooltip" style={{ left: "50%", transform: "translateX(-50%)" }}>
              <span className="ticker">{r.ticker}</span>{" "}
              edge {r.directional_edge?.toFixed(1)} · {el(r.bias)} ·{" "}
              {el(r.opportunity_status)}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
