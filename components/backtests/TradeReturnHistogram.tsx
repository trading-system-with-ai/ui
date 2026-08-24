"use client";

/**
 * Per-trade return distribution (dataviz addition 2026-08-20).
 *
 * Form: histogram — the data's job is the SHAPE of trade outcomes (how
 * many small wins vs the losing tail), which no single metric shows.
 * Color: polarity — losing bins in --red, winning bins in --green (the
 * platform's diverging pair). A bin edge is SNAPPED to zero so every bin
 * is unambiguously winning or losing — no third hue ever appears at the
 * midpoint (dataviz rule: the diverging midpoint reads as "nothing").
 * Marks per the dataviz spec: thin bars, 2px surface gap, hover tooltip
 * per bin; a single-series chart carries no legend (the title names it).
 */
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";

const W = 960;
const H = 150;
const PAD = { left: 72, right: 16, top: 10, bottom: 24 };

export default function TradeReturnHistogram({
  trades,
}: {
  trades: { return_pct: number }[];
}) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);
  const { bins, lo, binW, maxCount } = useMemo(() => {
    const rs = trades.map((x) => x.return_pct).filter((v) => Number.isFinite(v));
    if (rs.length === 0) return { bins: [] as number[], lo: 0, binW: 1, maxCount: 0 };
    const min = Math.min(...rs, 0);
    const max = Math.max(...rs, 0);
    const span = Math.max(max - min, 1e-9);
    const n = Math.min(24, Math.max(8, Math.ceil(Math.sqrt(rs.length) * 2)));
    // snap the grid to zero: choose the bin width, then start the grid on
    // a multiple of it so 0 is always a bin EDGE — every bin is then
    // purely winning or purely losing.
    const w = span / n;
    const start = Math.floor(min / w) * w;
    const count = Math.max(1, Math.ceil((max - start) / w));
    const counts = new Array(count).fill(0);
    for (const r of rs) {
      const k = Math.min(count - 1, Math.max(0, Math.floor((r - start) / w)));
      counts[k] += 1;
    }
    return { bins: counts, lo: start, binW: w, maxCount: Math.max(...counts) };
  }, [trades]);

  if (bins.length === 0 || maxCount === 0) return null;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (k: number) => PAD.left + (k / bins.length) * plotW;
  const y = (c: number) => PAD.top + (1 - c / maxCount) * plotH;
  const barW = plotW / bins.length;

  return (
    <div className="chart-scroll" style={{ marginTop: 8 }}>
      <div className="chart-inner">
        <div className="chart-sublabel">
          {t("Trade return distribution (%)", "单笔收益分布（%）")}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label={t("Trade return distribution", "单笔收益分布")}
          onPointerLeave={() => setHover(null)}
        >
          <line
            x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom}
            stroke="var(--border)" strokeWidth={1}
          />
          {bins.map((c, k) => {
            const binLo = lo + k * binW;
            const binHi = binLo + binW;
            // zero is a bin edge by construction — use the bin midpoint
            const losing = (binLo + binHi) / 2 < 0;
            return (
              <rect
                key={k}
                x={x(k) + 1}
                y={y(c)}
                width={Math.max(1, barW - 2)}
                height={Math.max(0, H - PAD.bottom - y(c))}
                rx={2}
                fill={losing ? "var(--red)" : "var(--green)"}
                fillOpacity={0.75}
                onPointerEnter={() => setHover(k)}
              />
            );
          })}
          {/* zero marker */}
          {lo < 0 && (
            <line
              x1={x((0 - lo) / binW)} x2={x((0 - lo) / binW)}
              y1={PAD.top} y2={H - PAD.bottom}
              stroke="var(--text-dim)" strokeWidth={1} strokeDasharray="3 3"
            />
          )}
          <text x={PAD.left - 6} y={y(maxCount) + 4} textAnchor="end" fontSize={9} fill="var(--text-dim)">
            {maxCount}
          </text>
        </svg>
        {hover != null && (
          <div className="chart-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}>
            {(lo + hover * binW).toFixed(1)}% ~ {(lo + (hover + 1) * binW).toFixed(1)}%:{" "}
            {bins[hover]} {t("trades", "笔")}
          </div>
        )}
      </div>
    </div>
  );
}
