"use client";

/**
 * §39's picture: what every asset class did around the PREVIOUS macro print.
 *
 * Form (dataviz step 1): grouped columns around a ZERO BASELINE, two series
 * (1-day and 5-day), one categorical axis of assets. The reader's job is to
 * compare signed magnitudes across a short ordered run of assets and to see
 * which way each went — polarity plus magnitude — which is a diverging bar,
 * not a line (no time axis: these are two horizons, not a series) and not a
 * stack (the horizons overlap in time; 1d is INSIDE 5d, so stacking them would
 * add a return to itself).
 *
 * Encoding decisions that are honesty rules, not taste:
 *
 *  A. POLARITY IS GEOMETRY, NOT COLOUR. A bar above the zero line rose and a
 *     bar below it fell. That is why the two hues are free to encode the
 *     HORIZON instead: identity and polarity each get their own channel, and
 *     neither has to share. Painting the bars green/red would spend the colour
 *     channel re-encoding what the baseline already shows — the dataviz
 *     "value-ramp on nominal categories" anti-pattern in its status-token
 *     form — and would additionally claim that a fall in TLT is BAD, which on
 *     a rates-sensitive asset around a CPI print is a position-dependent
 *     judgement this platform must not make. The green/red tokens stay where
 *     they mean something: on the table's text, beside a sign the reader can
 *     already read.
 *  B. THE ZERO LINE IS DRAWN AT FULL WEIGHT. Every other gridline is a
 *     recessive hairline; zero is the axis this chart is ABOUT. A diverging
 *     chart whose baseline looks like its gridlines invites the eye to measure
 *     from the bottom of the frame.
 *  C. A MISSING HORIZON DRAWS NOTHING. No zero-height bar, no imputed value.
 *     An asset with 1d but no 5d shows one column and a gap — a bar pinned to
 *     the baseline reads as "it did not move", which is the opposite of "we do
 *     not know".
 *  D. YIELDS ARE NOT ON THIS CHART. They are in basis points; the assets are
 *     in percent. One axis, always (the dual-axis anti-pattern is the single
 *     most common way a chart invents a correlation) — so the yield moves get
 *     their own row of stat tiles beside the chart, at their own scale.
 *
 * Palette: #4493f8 (accent) / #c08a1e — the SAME validated categorical pair
 * `ImpliedVsActualChart` uses, so two charts on neighbouring tabs of one event
 * do not teach two colour languages. Re-validated for this surface with the
 * dataviz validator against the panel #161b22 in dark mode: lightness band
 * PASS, chroma floor PASS, adjacent CVD ΔE 28.9 (protan) / 22.4 (tritan) PASS,
 * normal-vision ΔE 30.0 PASS, contrast vs surface PASS.
 *
 * Every value drawn here is also printed in the table this chart sits above,
 * so nothing is gated behind a hover and a reader who never points at it loses
 * nothing (dataviz interaction rule + the contrast relief channel).
 *
 * Inline SVG, no chart library — the platform ships none.
 */
import { useState } from "react";
import { useT } from "@/lib/i18n";

/** Categorical slot 1 / slot 2 — HORIZON identity, never polarity. */
const D1_FILL = "#4493f8";
const D5_FILL = "#c08a1e";

const VB_W = 720;
const VB_H = 280;
const PAD = { top: 18, right: 14, bottom: 40, left: 56 };
/** dataviz mark spec: bars cap at 24px; the band's leftover stays air. */
const MAX_BAR_W = 24;
/** dataviz spacer: 2px of SURFACE between touching bars, never a stroke. */
const BAR_GAP = 2;
/** dataviz mark spec: 4px rounded data-END, square at the baseline. */
const RADIUS = 4;

export interface MacroReactionRow {
  /** Stable key — the symbol. */
  key: string;
  /** Axis label (the symbol). */
  label: string;
  /** Signed 1-day return as a FRACTION. null = not drawn at all. */
  d1: number | null;
  /** Signed 5-day return as a FRACTION. null = not drawn at all. */
  d5: number | null;
  /** True when the symbol only stands in for the thing it is named after. */
  proxy?: boolean;
}

function pct(v: number, digits = 1): string {
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(digits)}%`;
}

/**
 * A column with a rounded DATA end and a square baseline end.
 *
 * Drawn as an explicit path rather than `<rect rx>` because `rx` rounds all
 * four corners, detaching the bar from its baseline so short bars read as
 * floating pills. `up` flips which end gets the radius — on a diverging chart
 * the rounded end is whichever end is away from zero, so a −2% bar is the
 * mirror of a +2% bar rather than an upside-down one.
 */
function columnPath(
  x: number,
  yTop: number,
  w: number,
  h: number,
  up: boolean,
): string {
  // A MEASURED zero gets a visible hairline on the baseline rather than an
  // empty path. This is the mirror of rule C: an absent horizon draws nothing
  // at all, so if a true 0.00% also drew nothing, the two states — "the market
  // did not move" and "we have no bars" — would be pixel-identical, and the
  // one asset that sat still would read as the one asset we failed to measure.
  if (h <= 0) return `M${x} ${yTop} L${x + w} ${yTop} L${x + w} ${yTop + 1} L${x} ${yTop + 1} Z`;
  const r = Math.min(RADIUS, w / 2, h);
  const yBot = yTop + h;
  if (h < r * 2) {
    return `M${x} ${yBot} L${x} ${yTop} L${x + w} ${yTop} L${x + w} ${yBot} Z`;
  }
  if (up) {
    // Rounded at the TOP (the data end), square where it meets zero below.
    return [
      `M${x} ${yBot}`,
      `L${x} ${yTop + r}`,
      `Q${x} ${yTop} ${x + r} ${yTop}`,
      `L${x + w - r} ${yTop}`,
      `Q${x + w} ${yTop} ${x + w} ${yTop + r}`,
      `L${x + w} ${yBot}`,
      "Z",
    ].join(" ");
  }
  // Rounded at the BOTTOM (the data end), square where it meets zero above.
  return [
    `M${x} ${yTop}`,
    `L${x} ${yBot - r}`,
    `Q${x} ${yBot} ${x + r} ${yBot}`,
    `L${x + w - r} ${yBot}`,
    `Q${x + w} ${yBot} ${x + w} ${yBot - r}`,
    `L${x + w} ${yTop}`,
    "Z",
  ].join(" ");
}

export default function MacroReactionChart({
  rows,
}: {
  rows: MacroReactionRow[];
}) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);

  // A row with neither horizon contributes no mark, so it would render as a
  // labelled empty band — the table already reports it as unavailable.
  const drawable = rows.filter((r) => r.d1 != null || r.d5 != null);

  if (drawable.length === 0) {
    return (
      <p className="empty" data-testid="mrc-empty">
        {t(
          "No reference asset has stored bars around the previous release, so there is nothing to draw. Backfilling the macro data fills this chart.",
          "上次数据发布前后没有任何参考资产的已存储 K 线数据,因此无法绘制图表。回填宏观数据后本图表即可显示。",
        )}
      </p>
    );
  }

  // Symmetric domain around zero from the real values only, so the zero line
  // sits at the vertical centre and a +1% bar is visually the mirror of a −1%
  // one. An asymmetric domain would make a small rise look like a large one.
  const values = drawable.flatMap((r) =>
    [r.d1, r.d5].filter((v): v is number => v != null),
  );
  const peak = Math.max(...values.map((v) => Math.abs(v)));
  // 12% headroom so a maximum bar's rounded cap never touches the frame.
  const yMax = peak > 0 ? peak * 1.12 : 0.01;

  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = VB_H - PAD.top - PAD.bottom;
  const zeroY = PAD.top + plotH / 2;
  const band = plotW / drawable.length;
  const barW = Math.max(1, Math.min(MAX_BAR_W, (band * 0.62 - BAR_GAP) / 2));
  const groupW = barW * 2 + BAR_GAP;
  const groupX = (i: number) => PAD.left + i * band + (band - groupW) / 2;
  /** Value → y. Positive above zero, negative below. */
  const y = (v: number) => zeroY - (v / yMax) * (plotH / 2);

  // Four hairline references plus zero: ±max, ±half.
  const ticks = [yMax, yMax / 2, -yMax / 2, -yMax];

  const active = hover == null ? null : drawable[hover];

  return (
    <div className="mrc-wrap" data-testid="macro-reaction-chart">
      <div className="chart-legend" data-testid="mrc-legend">
        <span>
          <span className="mrc-swatch" style={{ background: D1_FILL }} aria-hidden="true" />{" "}
          {t("1 day after", "事件后 1 天")}
        </span>
        <span>
          <span className="mrc-swatch" style={{ background: D5_FILL }} aria-hidden="true" />{" "}
          {t("5 days after", "事件后 5 天")}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="mrc-svg"
        role="img"
        aria-label={t(
          "Grouped columns around a zero line: each reference asset's 1-day and 5-day return after the previous release. Bars above the line rose, bars below fell.",
          "以零轴为中心的分组柱状图：各参考资产在上次数据发布后 1 天与 5 天的收益率。位于零轴上方为上涨,下方为下跌。",
        )}
        onMouseLeave={() => setHover(null)}
      >
        {/* Recessive hairline grid — solid, never dashed. */}
        {ticks.map((v) => (
          <g key={`tick-${v}`}>
            <line
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="mrc-tick">
              {pct(v, 1)}
            </text>
          </g>
        ))}

        {drawable.map((row, i) => {
          const gx = groupX(i);
          return (
            <g key={row.key}>
              {/* Full-band hit target — comfortably larger than the marks, so
                  hovering never demands landing on a thin column. */}
              <rect
                x={PAD.left + i * band}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${row.label}: ${
                  row.d1 == null
                    ? t("1 day unavailable", "1 天数据不可用")
                    : `${t("1 day", "1 天")} ${pct(row.d1, 2)}`
                }, ${
                  row.d5 == null
                    ? t("5 day unavailable", "5 天数据不可用")
                    : `${t("5 day", "5 天")} ${pct(row.d5, 2)}`
                }`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
              {/* Rule C — a null horizon draws NOTHING, never a flat bar. */}
              {row.d1 != null && (
                <path
                  d={columnPath(
                    gx,
                    Math.min(y(row.d1), zeroY),
                    barW,
                    Math.abs(zeroY - y(row.d1)),
                    row.d1 >= 0,
                  )}
                  fill={D1_FILL}
                  data-testid={`mrc-d1-${row.key}`}
                />
              )}
              {row.d5 != null && (
                <path
                  d={columnPath(
                    gx + barW + BAR_GAP,
                    Math.min(y(row.d5), zeroY),
                    barW,
                    Math.abs(zeroY - y(row.d5)),
                    row.d5 >= 0,
                  )}
                  fill={D5_FILL}
                  data-testid={`mrc-d5-${row.key}`}
                />
              )}
              {/* The symbol sits under the frame, not under the zero line —
                  a label on the baseline would collide with the bars that
                  hang below it. */}
              <text
                x={PAD.left + i * band + band / 2}
                y={PAD.top + plotH + 16}
                textAnchor="middle"
                className="mrc-xlabel"
              >
                {row.label}
                {row.proxy === true ? " *" : ""}
              </text>
            </g>
          );
        })}

        {/* Rule B — zero drawn last, at full weight, over the marks. */}
        <line
          x1={PAD.left}
          x2={VB_W - PAD.right}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--text-dim)"
          strokeWidth={2}
          data-testid="mrc-zero-line"
        />
      </svg>

      <p className="mrc-readout" data-testid="mrc-readout">
        {active == null
          ? t(
              "* proxy — the asset stands in for the exposure, it is not the exposure.",
              "* 代理资产 — 该资产仅代表相应敞口,并非敞口本身。",
            )
          : `${active.label} · ${
              active.d1 == null ? t("1d —", "1 天 —") : `${t("1d", "1 天")} ${pct(active.d1, 2)}`
            } · ${
              active.d5 == null ? t("5d —", "5 天 —") : `${t("5d", "5 天")} ${pct(active.d5, 2)}`
            }`}
      </p>
    </div>
  );
}
