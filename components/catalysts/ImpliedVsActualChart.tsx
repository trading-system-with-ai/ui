"use client";

/**
 * §37's picture: what the options market CHARGED for each prior event,
 * beside what the stock then DID.
 *
 * Form (dataviz step 1): grouped columns, two series, one categorical axis of
 * events. The job is magnitude-comparison within each event and across a short
 * ordered run of them — not a trend, so no line; not a part-to-whole, so no
 * stack. With ~4-12 events the grouped pair reads directly and the eye lands on
 * the gap, which IS the story: the straddle over- or under-charged.
 *
 * Encoding decisions that are honesty rules, not taste:
 *
 *  A. BOTH COLUMNS ARE ABSOLUTE. An implied move has no sign — a straddle
 *     prices magnitude — so the actual return is folded to |x| before it is
 *     plotted. Plotting a signed actual against an unsigned implied would put
 *     a −7% drop BELOW a +6% expectation and read as an undershoot when the
 *     stock in fact moved further than priced.
 *  B. IMPLIED AND ACTUAL ARE IDENTITIES, NOT POLARITIES. They wear
 *     categorical hues (accent blue / amber), never the platform's
 *     green/red status tokens: those mean good/bad on every other surface,
 *     and "the stock moved more than priced" is neither.
 *  C. A MISSING HALF DRAWS NOTHING. There is no zero-height bar and no
 *     imputed value: an event whose call leg had no bars has no implied
 *     column at all, and its slot shows the gap. A zero-height bar at the
 *     baseline reads as "the market priced no move".
 *
 * Palette validated with the dataviz skill's validate_palette.js against the
 * panel surface #161b22 in dark mode: #4493f8 (accent) ↔ #c08a1e — lightness
 * band PASS, chroma floor PASS, CVD separation ΔE 28.9 (protan) / 22.4
 * (tritan) PASS, normal-vision ΔE 30.0 PASS, contrast vs surface PASS. The
 * legend is always present (two series) and every value is also in the table
 * above the chart, so nothing is gated behind hover.
 *
 * Inline SVG, no chart library — the platform ships none and one grouped bar
 * chart does not justify one.
 */
import { useState } from "react";
import { useT } from "@/lib/i18n";

/** Categorical slot 1 / slot 2. Identity hues — never the status tokens. */
const IMPLIED_FILL = "#4493f8";
const ACTUAL_FILL = "#c08a1e";

const VB_W = 720;
const VB_H = 260;
const PAD = { top: 16, right: 14, bottom: 42, left: 52 };
/** dataviz mark spec: bars cap at 24px, and the band's leftover stays air. */
const MAX_BAR_W = 24;
/** dataviz spacer: 2px of SURFACE between touching bars, never a stroke. */
const BAR_GAP = 2;
/** dataviz mark spec: 4px rounded data-end, square at the baseline. */
const RADIUS = 4;

export interface ImpliedVsActualRow {
  key: string;
  label: string;
  /** Absolute implied move as a FRACTION. null = not drawn at all. */
  implied: number | null;
  /** Absolute realized move as a FRACTION. null = not drawn at all. */
  actual: number | null;
}

/** Percent text for an axis tick or a tooltip. Fractions in, percent out. */
function pct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

/**
 * A column with a rounded top and a square base.
 *
 * Drawn as an explicit path rather than `<rect rx>` because `rx` rounds all
 * four corners, which detaches the bar from its baseline and makes short
 * bars read as floating pills. Below 2×RADIUS the bar is drawn square — a
 * radius larger than half the height inverts the curve.
 */
function columnPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(RADIUS, w / 2, h);
  if (h < r * 2) {
    return `M${x} ${y + h} L${x} ${y} L${x + w} ${y} L${x + w} ${y + h} Z`;
  }
  return [
    `M${x} ${y + h}`,
    `L${x} ${y + r}`,
    `Q${x} ${y} ${x + r} ${y}`,
    `L${x + w - r} ${y}`,
    `Q${x + w} ${y} ${x + w} ${y + r}`,
    `L${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

/**
 * The grouped-column chart plus its legend.
 *
 * Hover and keyboard focus surface the same tooltip (dataviz interaction
 * rule) — but the tooltip only ENHANCES: the same numbers sit in the history
 * table this chart accompanies, so a reader who never hovers loses nothing.
 */
export default function ImpliedVsActualChart({
  rows,
}: {
  rows: ImpliedVsActualRow[];
}) {
  const t = useT();
  const [hover, setHover] = useState<number | null>(null);

  if (rows.length === 0) {
    return (
      <p className="empty" data-testid="iva-empty">
        {t(
          "No prior event has both an implied and an actual move on file yet, so there is nothing to compare. Backfilling the history fills this chart.",
          "尚无任何历史事件同时存有隐含波动与实际波动数据,因此暂无可比内容。回填历史数据后本图表即可显示。",
        )}
      </p>
    );
  }

  // Domain from the real values only — a null contributes nothing, so a run
  // of events missing their implied leg does not compress the actual bars
  // against a phantom ceiling.
  const values = rows.flatMap((r) =>
    [r.implied, r.actual].filter((v): v is number => v != null),
  );
  const peak = values.length > 0 ? Math.max(...values) : 0;
  // 8% headroom so a maximum bar's rounded cap never touches the frame.
  const yMax = peak > 0 ? peak * 1.08 : 0.01;

  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = VB_H - PAD.top - PAD.bottom;
  const baseline = PAD.top + plotH;
  const band = plotW / rows.length;
  // Two bars + the 2px surface gap between them, inside 62% of the band; the
  // remaining 38% is the air that separates one event's pair from the next.
  const barW = Math.max(
    1,
    Math.min(MAX_BAR_W, (band * 0.62 - BAR_GAP) / 2),
  );
  const groupW = barW * 2 + BAR_GAP;
  const groupX = (i: number) => PAD.left + i * band + (band - groupW) / 2;
  const y = (v: number) => baseline - (v / yMax) * plotH;

  // Three hairline references: 0, mid, top. Solid, one step off the surface.
  const ticks = [0, yMax / 2, yMax];

  const active = hover == null ? null : rows[hover];

  return (
    <div className="iva-wrap" data-testid="implied-vs-actual-chart">
      <div className="chart-legend" data-testid="iva-legend">
        <span>
          <span
            className="iva-swatch"
            style={{ background: IMPLIED_FILL }}
            aria-hidden="true"
          />{" "}
          {t("Implied (priced before)", "隐含(事件前定价)")}
        </span>
        <span>
          <span
            className="iva-swatch"
            style={{ background: ACTUAL_FILL }}
            aria-hidden="true"
          />{" "}
          {t("Actual |move| (after)", "实际波动绝对值(事件后)")}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="iva-svg"
        role="img"
        aria-label={t(
          "Grouped columns: implied move against actual absolute move, one pair per prior event.",
          "分组柱状图：每个历史事件一组,对比隐含波动幅度与实际波动幅度绝对值。",
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
            <text
              x={PAD.left - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="iva-tick"
            >
              {pct(v, v === 0 ? 0 : 1)}
            </text>
          </g>
        ))}

        {rows.map((row, i) => {
          const gx = groupX(i);
          const impliedH = row.implied == null ? 0 : baseline - y(row.implied);
          const actualH = row.actual == null ? 0 : baseline - y(row.actual);
          return (
            <g key={row.key}>
              {/* Full-band hit target — comfortably larger than the marks,
                  so hovering never demands landing on a thin column. */}
              <rect
                x={PAD.left + i * band}
                y={PAD.top}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${row.label}: ${
                  row.implied == null
                    ? t("implied unavailable", "隐含波动数据不可用")
                    : `${t("implied", "隐含")} ${pct(row.implied)}`
                }, ${
                  row.actual == null
                    ? t("actual unavailable", "实际波动数据不可用")
                    : `${t("actual", "实际")} ${pct(row.actual)}`
                }`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
              {/* A null half draws NOTHING — never a zero-height bar. */}
              {row.implied != null && (
                <path
                  d={columnPath(gx, y(row.implied), barW, impliedH)}
                  fill={IMPLIED_FILL}
                  data-testid={`iva-implied-${row.key}`}
                />
              )}
              {row.actual != null && (
                <path
                  d={columnPath(
                    gx + barW + BAR_GAP,
                    y(row.actual),
                    barW,
                    actualH,
                  )}
                  fill={ACTUAL_FILL}
                  data-testid={`iva-actual-${row.key}`}
                />
              )}
              <text
                x={PAD.left + i * band + band / 2}
                y={baseline + 16}
                textAnchor="middle"
                className="iva-xlabel"
              >
                {row.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Values, not color, carry the reading — the tooltip repeats what the
          table already shows rather than being the only route to a number. */}
      {active != null && (
        <p className="iva-readout" data-testid="iva-readout">
          <span className="mono">{active.label}</span>
          {" — "}
          {t("implied ", "隐含 ")}
          <span className="mono">
            {active.implied == null
              ? t("unavailable", "不可用")
              : `±${pct(active.implied)}`}
          </span>
          {" · "}
          {t("actual ", "实际 ")}
          <span className="mono">
            {active.actual == null
              ? t("unavailable", "不可用")
              : pct(active.actual)}
          </span>
        </p>
      )}
    </div>
  );
}
