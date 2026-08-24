"use client";

/**
 * Price with SMA overlays for one ticker.
 *
 * Extracted from ``app/watchlist/[ticker]/page.tsx`` (2026-08-24), which had
 * grown to 3,000 lines holding a chart, a dozen formatters, ten tab
 * components and the page's own data orchestration. Nothing was wrong with
 * the code; the problem was that "where is the price chart" had no answer you
 * could guess from the file tree.
 *
 * Encoding decisions, as elsewhere in this codebase, are honesty rules:
 *
 *  A. A GAP IS A GAP. ``buildPath`` breaks the line at a null rather than
 *     interpolating across it — a missing bar is missing, not a straight
 *     segment implying continuous coverage.
 *  B. THE SMA HUES ARE CATEGORICAL, not status colours. A 20-day average
 *     above a 50-day one is not "good"; it is a fact whose meaning depends on
 *     a position the platform does not know the reader holds.
 *
 * Palette validated against the panel surface #161b22: close #4493f8
 * (--accent) · sma20 #b8860b · sma50 #d15c8f, all six pairwise checks passing.
 */
import { useState } from "react";

import { useT } from "@/lib/i18n";
import type { AnalysisSeries } from "@/lib/types";

const SMA20_COLOR = "#b8860b";
const SMA50_COLOR = "#d15c8f";

const VB_W = 960;
const VB_H = 340;
const PAD = { top: 14, right: 16, bottom: 30, left: 64 };

function buildPath(
  values: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    pen = true;
  });
  return d;
}

export default function PriceChart({ series }: { series: AnalysisSeries }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);

  const n = series.dates.length;
  const all = [...series.close, ...series.sma20, ...series.sma50].filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (n === 0 || all.length === 0) {
    return <p className="empty">{t("No price series available.", "暂无价格序列数据。")}</p>;
  }

  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.04;
  const yLo = lo - pad;
  const yHi = hi + pad;

  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = VB_H - PAD.top - PAD.bottom;
  const denom = Math.max(1, n - 1);
  const x = (i: number) => PAD.left + (i / denom) * plotW;
  const y = (v: number) => PAD.top + ((yHi - v) / (yHi - yLo)) * plotH;

  const gridValues = [hi, (hi + lo) / 2, lo];

  const moveTo = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    const i = Math.round(((vx - PAD.left) / plotW) * denom);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const legend = [
    { name: t("Close", "收盘价"), color: "var(--accent)" },
    { name: "SMA 20", color: SMA20_COLOR },
    { name: "SMA 50", color: SMA50_COLOR },
  ];

  const hoverRows =
    hover == null
      ? []
      : [
          { name: t("Close", "收盘价"), color: "var(--accent)", value: series.close[hover] ?? null },
          { name: "SMA 20", color: SMA20_COLOR, value: series.sma20[hover] ?? null },
          { name: "SMA 50", color: SMA50_COLOR, value: series.sma50[hover] ?? null },
        ];

  return (
    <div className="chart-scroll">
      <div className="chart-inner">
        <div className="chart-legend">
          {legend.map((s) => (
            <span key={s.name}>
              <span className="key" style={{ borderTopColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: "100%", height: "auto", display: "block", outline: "none" }}
          role="img"
          aria-label={t(
            `Close price with SMA 20 and SMA 50 overlays, ${series.dates[0]} to ${series.dates[n - 1]}`,
            `收盘价及 SMA 20 / SMA 50 叠加，${series.dates[0]} 至 ${series.dates[n - 1]}`,
          )}
          tabIndex={0}
          onPointerMove={(e) => moveTo(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover((h) => h ?? n - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const step = e.key === "ArrowLeft" ? -1 : 1;
              setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + step)));
            }
          }}
        >
          {/* recessive hairline grid + y reference labels (min / mid / max) */}
          {gridValues.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={VB_W - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(v) + 3.5}
                textAnchor="end"
                fontSize={11}
                fontFamily="var(--font-mono)"
                fill="var(--text-dim)"
              >
                {v.toFixed(2)}
              </text>
            </g>
          ))}

          {/* x reference labels: first / last date */}
          <text
            x={PAD.left}
            y={VB_H - 8}
            fontSize={11}
            fontFamily="var(--font-mono)"
            fill="var(--text-dim)"
          >
            {series.dates[0]}
          </text>
          <text
            x={VB_W - PAD.right}
            y={VB_H - 8}
            textAnchor="end"
            fontSize={11}
            fontFamily="var(--font-mono)"
            fill="var(--text-dim)"
          >
            {series.dates[n - 1]}
          </text>

          {/* series: 2px lines, round joins; sma overlays under the close line */}
          <path
            d={buildPath(series.sma50, x, y)}
            fill="none"
            stroke={SMA50_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={buildPath(series.sma20, x, y)}
            fill="none"
            stroke={SMA20_COLOR}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={buildPath(series.close, x, y)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* crosshair + hover markers (2px surface ring) */}
          {hover != null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--text-dim)"
                strokeWidth={1}
              />
              {hoverRows.map(
                (r) =>
                  r.value != null && (
                    <circle
                      key={r.name}
                      cx={x(hover)}
                      cy={y(r.value)}
                      r={4}
                      fill={r.color}
                      stroke="var(--bg-panel)"
                      strokeWidth={2}
                    />
                  ),
              )}
            </g>
          )}
        </svg>

        {hover != null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(x(hover) / VB_W) * 100}%`,
              transform: x(hover) > VB_W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <div className="tt-date">{series.dates[hover]}</div>
            {hoverRows.map((r) => (
              <div key={r.name} className="tt-row">
                <span className="key" style={{ borderTop: `2px solid ${r.color}`, width: 12, display: "inline-block" }} />
                <span className="tt-val">{r.value == null ? "—" : `$${r.value.toFixed(2)}`}</span>
                <span className="tt-name">{r.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
