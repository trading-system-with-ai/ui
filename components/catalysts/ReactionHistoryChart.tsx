"use client";

/**
 * HOW THE STOCK ACTUALLY MOVED after each prior print.
 *
 * The history table carries twelve rows of twelve numeric columns. Every
 * number in it is correct and the shape of the record — does this name gap
 * hard and mean-revert, or drift for a week? does it move at all? — is
 * invisible in a grid, because reading it means comparing a column down
 * twelve rows while holding the signs in your head.
 *
 * This is the sibling of `ImpliedVsActualChart` and deliberately answers a
 * different question. That chart asks whether the OPTIONS MARKET charged the
 * right price, needs an option chain, and folds both series to absolute
 * because a straddle prices magnitude. This one asks what the STOCK DID,
 * needs only the event registry and stored bars — so it renders for events
 * that have no option data at all, which is most of them — and keeps the SIGN,
 * because direction is the whole question.
 *
 * Form (dataviz step 1): diverging columns about a zero baseline, one
 * categorical axis of prior events in date order, two horizons as grouped
 * series. Ordered categories with signed magnitudes and no continuous time
 * axis (events are irregularly spaced) — a grouped diverging bar, not a line.
 *
 * Encoding decisions that are honesty rules, not taste:
 *
 *  A. POLARITY IS GEOMETRY, NOT COLOUR — the same rule MacroReactionChart
 *     states. Above the zero line rose, below it fell; the two hues encode
 *     the HORIZON. Painting bars green/red would re-encode the baseline and
 *     additionally assert that a fall is BAD, which depends on a position the
 *     platform does not know the reader holds.
 *  B. THE ZERO LINE IS DRAWN AT FULL WEIGHT, every other gridline recessive.
 *  C. A MISSING RETURN DRAWS NOTHING. No zero-height bar: "the bars were
 *     never fetched" and "the stock did not move" are opposite claims, and a
 *     column pinned to the baseline states the second (§44 rule 18).
 *  D. THE AXIS IS SYMMETRIC about zero. An axis fitted to the data's own
 *     range would put a +2% move at the top of the frame and read as a large
 *     rally; symmetric bounds keep a small move looking small.
 *
 * Palette: #4493f8 / #c08a1e — the SAME categorical pair the two neighbouring
 * charts use, so three charts on one event do not teach three colour
 * languages.
 *
 * Every value drawn is printed in the table above; the hover adds the event
 * key and exact figures, and a reader who never points at it loses nothing.
 *
 * Inline SVG, no chart library — the platform ships none.
 */
import { useT } from "@/lib/i18n";

const R1D_FILL = "#4493f8";
const R5D_FILL = "#c08a1e";

const VB_W = 720;
const VB_H = 240;
const PAD = { top: 16, right: 12, bottom: 46, left: 52 };
const MAX_BAR_W = 18;
const BAR_GAP = 2;
const RADIUS = 3;

export interface ReactionHistoryRow {
  /** Stable key — the event key, used for the hover title. */
  key: string;
  /** Short axis label, e.g. "2026-06-01". */
  label: string;
  /** Signed fractional return, or null when it could not be measured. */
  ret1d: number | null;
  ret5d: number | null;
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

export default function ReactionHistoryChart({ rows }: { rows: ReactionHistoryRow[] }) {
  const t = useT();
  // Rule C: a row with NEITHER horizon measured contributes no column and no
  // slot — it is absent from this chart and still present in the table.
  const plotted = rows.filter((r) => r.ret1d != null || r.ret5d != null);
  if (plotted.length === 0) return null;

  const values = plotted.flatMap((r) =>
    [r.ret1d, r.ret5d].filter((v): v is number => v != null),
  );
  // Rule D: symmetric bounds, with a floor so a quiet history is not
  // magnified into drama by a 0.2% maximum.
  const peak = Math.max(0.02, ...values.map(Math.abs));
  const bound = peak * 1.15;

  const plotW = VB_W - PAD.left - PAD.right;
  const plotH = VB_H - PAD.top - PAD.bottom;
  const band = plotW / plotted.length;
  const barW = Math.min(MAX_BAR_W, (band - BAR_GAP * 3) / 2);
  const y = (v: number) => PAD.top + ((bound - v) / (2 * bound)) * plotH;
  const zeroY = y(0);

  // Four gridlines plus zero, in the data's own unit.
  const ticks = [-bound, -bound / 2, 0, bound / 2, bound];

  return (
    <div className="rh-chart" data-testid="reaction-history-chart">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={t(
          "Stock return after each prior event, 1-day and 5-day",
          "历次事件后的股价回报，1 日与 5 日",
        )}
        preserveAspectRatio="xMidYMid meet"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              // Rule B: zero is the axis this chart is ABOUT.
              stroke={v === 0 ? "#8b949e" : "#2d333b"}
              strokeWidth={v === 0 ? 1.25 : 1}
            />
            <text x={PAD.left - 8} y={y(v) + 3} textAnchor="end" className="rh-tick">
              {pct(v)}
            </text>
          </g>
        ))}

        {plotted.map((row, i) => {
          const x0 = PAD.left + i * band;
          const pairW = barW * 2 + BAR_GAP;
          const startX = x0 + (band - pairW) / 2;
          return (
            <g key={row.key}>
              {[
                { v: row.ret1d, fill: R1D_FILL, dx: 0, label: "1D" },
                { v: row.ret5d, fill: R5D_FILL, dx: barW + BAR_GAP, label: "5D" },
              ].map(({ v, fill, dx, label }) =>
                // Rule C, per bar: a missing horizon draws nothing at all.
                v == null ? null : (
                  <rect
                    key={label}
                    x={startX + dx}
                    y={Math.min(y(v), zeroY)}
                    width={barW}
                    height={Math.max(1, Math.abs(y(v) - zeroY))}
                    rx={RADIUS}
                    fill={fill}
                    data-testid={`rh-bar-${row.key}-${label}`}
                  >
                    <title>{`${row.key}\n${label} ${pct(v)}`}</title>
                  </rect>
                ),
              )}
              <text
                x={x0 + band / 2}
                y={VB_H - PAD.bottom + 16}
                textAnchor="middle"
                className="rh-label"
              >
                {row.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* The legend names the HORIZONS, because that is what the hues encode. */}
      <div className="rh-legend">
        <span>
          <i style={{ background: R1D_FILL }} /> {t("1 day", "1 天")}
        </span>
        <span>
          <i style={{ background: R5D_FILL }} /> {t("5 days", "5 天")}
        </span>
        <span className="muted">
          {t(
            "Above the line rose, below it fell. Colour is the horizon, not good or bad.",
            "基线以上为上涨，以下为下跌。颜色代表时间跨度，并非好坏。",
          )}
        </span>
      </div>
    </div>
  );
}
