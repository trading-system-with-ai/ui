"use client";

import { useState } from "react";
import type { DailyBar } from "@/lib/types";

/* ---------------------------------------------------------------- palette
 * Up/down is POLARITY, so the candles wear the design system's status tokens
 * (--green #3fb950 / --red #f85149) — never categorical series hues.
 * Checked with the dataviz skill's validate_palette.js on the dark panel
 * surface #161b22: normal-vision ΔE 33.3 and contrast vs surface both pass;
 * the red↔green pair fails deutan CVD separation (ΔE 2.2), which is exactly
 * why polarity is ALSO carried by fill state — up candles are hollow
 * (surface fill, green stroke), down candles are solid red — so direction is
 * never encoded by hue alone. Volume is not a series: it renders in the
 * muted neutral --text-dim at reduced opacity so it reads as context, and the
 * legend + tooltip name every mark.
 */
const UP = "var(--green)";
const DOWN = "var(--red)";
const VOLUME_FILL = "var(--text-dim)";
const VOLUME_OPACITY = 0.35;

/* ---------------------------------------------------------------- geometry */

const VB_W = 960;
const VB_H = 420;
const PAD = { top: 14, right: 16, bottom: 30, left: 64 };
const VOL_H = 70; // volume panel height
const GAP = 12; // surface gap between the price and volume panels

function fmtVolume(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

/**
 * Daily OHLC candlestick with a volume panel sharing the x-domain.
 * Inline SVG, no chart libs — follows the PriceChart interaction pattern:
 * pointer crosshair snapped to the nearest bar, keyboard arrows on focus,
 * one tooltip carrying date/O/H/L/C/volume.
 */
export default function CandlestickChart({ bars }: { bars: DailyBar[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const n = bars.length;
  if (n === 0) {
    return <p className="empty">No price bars available.</p>;
  }

  // Price y-domain spans the full high/low range, padded 4% so wicks never
  // touch the frame.
  let lo = Math.min(...bars.map((b) => b.low));
  let hi = Math.max(...bars.map((b) => b.high));
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.04;
  const yLo = lo - pad;
  const yHi = hi + pad;

  const plotW = VB_W - PAD.left - PAD.right;
  const priceH = VB_H - PAD.top - PAD.bottom - VOL_H - GAP;
  const volTop = PAD.top + priceH + GAP;
  const volBase = volTop + VOL_H;

  // Banded x-scale: one slot per bar, candle centered in its slot.
  const band = plotW / n;
  const x = (i: number) => PAD.left + (i + 0.5) * band;
  // Body width keeps a >=2px surface gap to its neighbors and caps at 24px
  // (thin-marks rule); never below 1px so dense ranges still render.
  const bodyW = Math.max(1, Math.min(band - 2, band * 0.7, 24));

  const y = (v: number) => PAD.top + ((yHi - v) / (yHi - yLo)) * priceH;
  const maxVol = Math.max(1, ...bars.map((b) => b.volume));
  const volY = (v: number) => volBase - (v / maxVol) * VOL_H;

  const gridValues = [hi, (hi + lo) / 2, lo]; // max / mid / min reference lines

  const moveTo = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * VB_W;
    const i = Math.floor((vx - PAD.left) / band);
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const hb = hover == null ? null : bars[hover];

  return (
    <div className="chart-scroll">
      <div className="chart-inner">
        {/* Legend doubles as the secondary-encoding key: fill state (hollow
            vs solid), not hue alone, says which way the bar closed. */}
        <div className="chart-legend">
          <span>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                border: `1.5px solid ${UP}`,
                borderRadius: 2,
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            up (hollow, close ≥ open)
          </span>
          <span>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                background: DOWN,
                borderRadius: 2,
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            down (filled)
          </span>
          <span>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                background: VOLUME_FILL,
                opacity: VOLUME_OPACITY,
                borderRadius: 2,
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            volume
          </span>
        </div>

        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          style={{ width: "100%", height: "auto", display: "block", outline: "none" }}
          role="img"
          aria-label={`Daily OHLC candlestick chart with volume, ${bars[0].date} to ${bars[n - 1].date}`}
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

          {/* volume panel: baseline + max-volume reference label */}
          <line
            x1={PAD.left}
            x2={VB_W - PAD.right}
            y1={volBase}
            y2={volBase}
            stroke="var(--border)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 8}
            y={volTop + 3.5}
            textAnchor="end"
            fontSize={11}
            fontFamily="var(--font-mono)"
            fill="var(--text-dim)"
          >
            {fmtVolume(maxVol)}
          </text>

          {/* x reference labels: first / last date */}
          <text
            x={PAD.left}
            y={VB_H - 8}
            fontSize={11}
            fontFamily="var(--font-mono)"
            fill="var(--text-dim)"
          >
            {bars[0].date}
          </text>
          <text
            x={VB_W - PAD.right}
            y={VB_H - 8}
            textAnchor="end"
            fontSize={11}
            fontFamily="var(--font-mono)"
            fill="var(--text-dim)"
          >
            {bars[n - 1].date}
          </text>

          {/* hovered slot highlight — spans both panels so price and volume
              read as one bar */}
          {hover != null && (
            <rect
              x={PAD.left + hover * band}
              y={PAD.top}
              width={band}
              height={volBase - PAD.top}
              fill="var(--text-dim)"
              opacity={0.08}
            />
          )}

          {/* volume bars: muted neutral, shared x-domain with the candles */}
          {bars.map((b, i) => (
            <rect
              key={`v-${b.date}`}
              x={x(i) - bodyW / 2}
              y={volY(b.volume)}
              width={bodyW}
              height={Math.max(1, volBase - volY(b.volume))}
              fill={VOLUME_FILL}
              opacity={VOLUME_OPACITY}
            />
          ))}

          {/* candles: 1px wick + body per bar; up = hollow (surface fill,
              green stroke), down = solid red — fill state is the CVD-safe
              secondary encoding for direction */}
          {bars.map((b, i) => {
            const up = b.close >= b.open;
            const color = up ? UP : DOWN;
            const bodyTop = y(Math.max(b.open, b.close));
            const bodyH = Math.max(1, y(Math.min(b.open, b.close)) - bodyTop);
            return (
              <g key={b.date}>
                <line
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(b.high)}
                  y2={y(b.low)}
                  stroke={color}
                  strokeWidth={1}
                />
                <rect
                  x={x(i) - bodyW / 2}
                  y={bodyTop}
                  width={bodyW}
                  height={bodyH}
                  fill={up ? "var(--bg-panel)" : DOWN}
                  stroke={color}
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {/* crosshair through both panels, snapped to the hovered bar */}
          {hover != null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={volBase}
              stroke="var(--text-dim)"
              strokeWidth={1}
            />
          )}
        </svg>

        {hb != null && hover != null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(x(hover) / VB_W) * 100}%`,
              transform:
                x(hover) > VB_W / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
            }}
          >
            <div className="tt-date">
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  marginRight: 6,
                  ...(hb.close >= hb.open
                    ? { border: `1.5px solid ${UP}` }
                    : { background: DOWN }),
                }}
              />
              {hb.date}
            </div>
            {(
              [
                ["O", hb.open.toFixed(2)],
                ["H", hb.high.toFixed(2)],
                ["L", hb.low.toFixed(2)],
                ["C", hb.close.toFixed(2)],
                ["Vol", fmtVolume(hb.volume)],
              ] as const
            ).map(([name, value]) => (
              <div key={name} className="tt-row">
                <span className="tt-val">{value}</span>
                <span className="tt-name">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
