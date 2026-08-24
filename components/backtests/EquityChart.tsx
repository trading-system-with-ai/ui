"use client";

/**
 * Equity + drawdown chart — extracted from app/backtests/page.tsx
 * (2026-08-20) so the portfolio panel renders the same curve idiom.
 * Colors validated with the dataviz skill's validate_palette.js on the
 * dark panel surface (equity --accent, drawdown --red; both pass CVD +
 * contrast checks as a two-color set).
 */
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { BacktestEquityCurve } from "@/lib/types";

// Colors validated with the dataviz skill's validate_palette.js on the dark
// panel surface #161b22 (all checks pass, incl. CVD + normal-vision floors):
//   equity #4493f8 (--accent) · drawdown #f85149 (--red)
const VB_W = 960;
const EQ_H = 250;
const DD_H = 110;
const PADX = { left: 72, right: 16 };
const EQ_PAD = { top: 24, bottom: 8 };
const DD_PAD = { top: 6, bottom: 24 };

function fmtEquity(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 });
}

function linePath(values: number[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
    pen = true;
  });
  return d;
}

export default function EquityChart({ curve }: { curve: BacktestEquityCurve }) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);

  const n = curve.dates.length;
  const eqVals = curve.equity.filter((v) => Number.isFinite(v));
  if (n === 0 || eqVals.length === 0) {
    return (
      <p className="empty">
        {t("No equity curve recorded for this run.", "本次运行未记录净值曲线。")}
      </p>
    );
  }

  let eqLo = Math.min(...eqVals);
  let eqHi = Math.max(...eqVals);
  if (eqLo === eqHi) {
    eqLo -= 1;
    eqHi += 1;
  }
  const eqSpan = eqHi - eqLo;
  const eqTop = eqHi + eqSpan * 0.05;
  const eqBot = eqLo - eqSpan * 0.05;

  const dd = curve.drawdown.map((v) => (Number.isFinite(v) ? v : 0));
  let ddLo = Math.min(0, ...dd);
  let ddHi = Math.max(0, ...dd);
  if (ddLo === ddHi) {
    ddLo -= 1;
    ddHi += 0.1;
  }
  const ddSpan = ddHi - ddLo;
  const ddTop = ddHi + ddSpan * 0.08;
  const ddBot = ddLo - ddSpan * 0.08;

  const plotW = VB_W - PADX.left - PADX.right;
  const denom = Math.max(1, n - 1);
  const x = (i: number) => PADX.left + (i / denom) * plotW;
  const eqPlotH = EQ_H - EQ_PAD.top - EQ_PAD.bottom;
  const yE = (v: number) => EQ_PAD.top + ((eqTop - v) / (eqTop - eqBot)) * eqPlotH;
  const ddPlotH = DD_H - DD_PAD.top - DD_PAD.bottom;
  const yD = (v: number) => DD_PAD.top + ((ddTop - v) / (ddTop - ddBot)) * ddPlotH;

  const plotRight = VB_W - PADX.right;

  // drawdown area: filled wash from the 0 baseline down to the value
  const zeroY = yD(0);
  let ddArea = `M${x(0).toFixed(2)},${zeroY.toFixed(2)}`;
  dd.forEach((v, i) => {
    ddArea += `L${x(i).toFixed(2)},${yD(v).toFixed(2)}`;
  });
  ddArea += `L${x(n - 1).toFixed(2)},${zeroY.toFixed(2)}Z`;

  const moveTo = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    const i = Math.round(((vx - PADX.left) / plotW) * denom);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const pointerProps = {
    onPointerLeave: () => setHover(null),
  };

  return (
    <div className="chart-scroll">
      <div className="chart-inner">
        <svg
          viewBox={`0 0 ${VB_W} ${EQ_H}`}
          style={{ width: "100%", height: "auto", display: "block", outline: "none" }}
          role="img"
          aria-label={t(
            `Backtest equity curve, ${curve.dates[0]} to ${curve.dates[n - 1]}`,
            `回测净值曲线，${curve.dates[0]} 至 ${curve.dates[n - 1]}`,
          )}
          tabIndex={0}
          onPointerMove={(e) => moveTo(e.clientX, e.currentTarget)}
          onFocus={() => setHover((h) => h ?? n - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              const step = e.key === "ArrowLeft" ? -1 : 1;
              setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + step)));
            }
          }}
          {...pointerProps}
        >
          {/* hairline grid + y labels */}
          {[eqHi, (eqHi + eqLo) / 2, eqLo].map((v) => (
            <g key={v}>
              <line x1={PADX.left} x2={plotRight} y1={yE(v)} y2={yE(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={PADX.left - 8} y={yE(v) + 3.5} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-dim)">
                {fmtEquity(v)}
              </text>
            </g>
          ))}

          {/* equity line */}
          <path d={linePath(curve.equity, x, yE)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* crosshair + marker */}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={EQ_PAD.top} y2={EQ_H} stroke="var(--text-dim)" strokeWidth={1} />
              {Number.isFinite(curve.equity[hover]) && (
                <circle cx={x(hover)} cy={yE(curve.equity[hover])} r={4} fill="var(--accent)" stroke="var(--bg-panel)" strokeWidth={2} />
              )}
            </g>
          )}
        </svg>

        <div className="chart-sublabel">{t("Drawdown", "回撤")}</div>

        <svg
          viewBox={`0 0 ${VB_W} ${DD_H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label={t(
            "Backtest drawdown, same date range as the equity curve above",
            "回测回撤，日期范围与上方净值曲线相同",
          )}
          onPointerMove={(e) => moveTo(e.clientX, e.currentTarget)}
          {...pointerProps}
        >

          {/* curve.drawdown is a FRACTION (-0.3467 = -34.67%), unlike the
              metrics table's *_pct fields — scale ×100 at display only. */}
          {[ddHi, ddLo].map((v) => (
            <g key={v}>
              <line x1={PADX.left} x2={plotRight} y1={yD(v)} y2={yD(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={PADX.left - 8} y={yD(v) + 3.5} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-dim)">
                {(v * 100).toFixed(1)}%
              </text>
            </g>
          ))}

          {/* drawdown area (10% wash) + 2px line */}
          <path d={ddArea} fill="rgba(248, 81, 73, 0.1)" />
          <path d={linePath(dd, x, yD)} fill="none" stroke="var(--red)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* x labels: first / last date (shared x-domain) */}
          <text x={PADX.left} y={DD_H - 6} fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-dim)">
            {curve.dates[0]}
          </text>
          <text x={plotRight} y={DD_H - 6} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-dim)">
            {curve.dates[n - 1]}
          </text>

          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={DD_H - DD_PAD.bottom + 4} stroke="var(--text-dim)" strokeWidth={1} />
              <circle cx={x(hover)} cy={yD(dd[hover])} r={4} fill="var(--red)" stroke="var(--bg-panel)" strokeWidth={2} />
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
            <div className="tt-date">
              {curve.dates[hover]}
            </div>
            <div className="tt-row">
              <span className="key" style={{ borderTop: "2px solid var(--accent)", width: 12, display: "inline-block" }} />
              <span className="tt-val">{Number.isFinite(curve.equity[hover]) ? fmtEquity(curve.equity[hover]) : "—"}</span>
              <span className="tt-name">{t("Equity", "净值")}</span>
            </div>
            <div className="tt-row">
              <span className="key" style={{ borderTop: "2px solid var(--red)", width: 12, display: "inline-block" }} />
              <span className="tt-val">{(dd[hover] * 100).toFixed(2)}%</span>
              <span className="tt-name">{t("Drawdown", "回撤")}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- results */

