"use client";

/**
 * Market-implied probability over time for one prediction-market contract
 * (Catalyst research upgrade, plan Phase 9).
 *
 * WHAT THIS CHART IS A PICTURE OF. Not "how likely the outcome is" — what
 * the contract COST at each observation. That distinction is the whole
 * reason this component exists rather than a generic line chart: the axis is
 * labelled as pricing, the caption says pricing, and no code path here can
 * relabel it.
 *
 * Form (dataviz step 1): a single series over time, so a line — the question
 * is direction and level, not magnitude comparison. The y-axis is pinned to
 * 0-100% because a contract price lives in that range by definition and an
 * auto-scaled axis would turn a 3-point wobble into a dramatic cliff.
 *
 * Encoding decisions that are honesty rules, not taste:
 *
 *  A. GAPS ARE GAPS. Observations are whatever the venue served; the line is
 *     drawn between consecutive stored points and nothing is interpolated
 *     across a stretch with no data (plan §3: "no invented interpolation").
 *     A market observed twice draws two points, not a smooth curve implying
 *     continuous coverage.
 *  B. ANCHORS ONLY WHEN THEY ALIGN HONESTLY. The previous-event and as-of
 *     markers render ONLY when their instants fall inside the observed
 *     range. An anchor clamped to the edge would assert the market was
 *     trading then, which is exactly the false alignment Phase 9 forbids.
 *  C. ONE POINT IS NOT A TREND. With fewer than two observations the
 *     component renders the honest empty state instead of a chart — a
 *     single dot connected to nothing reads as a flat line.
 *
 * Palette: one series, so one accent hue (#4493f8, the platform's accent
 * blue, already validated against the panel surface #161b22 in the sibling
 * chart). Anchors are neutral rules, deliberately NOT status colours: a
 * previous event is neither good nor bad.
 *
 * Inline SVG, no chart library — the platform ships none.
 */
import { useT } from "@/lib/i18n";

const LINE_STROKE = "#4493f8";
const DOT_FILL = "#4493f8";
/** Anchors are structure, not signal — neutral grey, never green/red. */
const ANCHOR_STROKE = "#8b949e";

const VB_W = 720;
const VB_H = 220;
const PAD = { top: 14, right: 16, bottom: 34, left: 44 };

const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

/** One stored observation: an instant and the contract's price at it. */
export interface ProbabilityPoint {
  ts: string;
  /** Contract price in [0,1] — market-implied, never "the probability". */
  price: number;
}

export interface PredictionMarketChartProps {
  points: ProbabilityPoint[];
  /** Rendered only if it falls inside the observed range (rule B). */
  previousEventAt?: string | null;
  /** Rendered only if it falls inside the observed range (rule B). */
  asOf?: string | null;
  /** The contract's sanitized question, for the accessible description. */
  safeQuestion?: string;
}

function toMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export default function PredictionMarketChart({
  points,
  previousEventAt,
  asOf,
  safeQuestion,
}: PredictionMarketChartProps) {
  const t = useT();

  const usable = (points ?? [])
    .map((p) => ({ ms: toMillis(p.ts), price: p.price }))
    .filter(
      (p): p is { ms: number; price: number } =>
        p.ms !== null && typeof p.price === "number" && Number.isFinite(p.price),
    )
    .sort((a, b) => a.ms - b.ms);

  // Rule C: one point is not a trend.
  if (usable.length < 2) {
    return (
      <p className="muted" data-testid="pm-chart-empty">
        {t(
          "Prediction-market history is unavailable.",
          "预测市场历史数据不可用。",
        )}
      </p>
    );
  }

  const first = usable[0].ms;
  const last = usable[usable.length - 1].ms;
  const span = last - first || 1;

  const x = (ms: number) => PAD.left + ((ms - first) / span) * PLOT_W;
  // Pinned 0-1 domain (see header): a price cannot leave it, and an
  // auto-scale would exaggerate every small move.
  const y = (price: number) => PAD.top + (1 - Math.min(1, Math.max(0, price))) * PLOT_H;

  const path = usable
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.ms).toFixed(1)} ${y(p.price).toFixed(1)}`)
    .join(" ");

  // Rule B: an anchor renders only where it honestly falls.
  const anchors: { ms: number; label: string }[] = [];
  const prevMs = toMillis(previousEventAt);
  if (prevMs !== null && prevMs >= first && prevMs <= last) {
    anchors.push({ ms: prevMs, label: t("Previous event", "上一次事件") });
  }
  const asOfMs = toMillis(asOf);
  if (asOfMs !== null && asOfMs >= first && asOfMs <= last) {
    anchors.push({ ms: asOfMs, label: t("As of", "截至") });
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="pm-chart" data-testid="pm-chart">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={t(
          `Market-implied pricing over time${safeQuestion ? `: ${safeQuestion}` : ""}`,
          `市场隐含定价随时间变化${safeQuestion ? `：${safeQuestion}` : ""}`,
        )}
      >
        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={y(g)}
              y2={y(g)}
              stroke="#30363d"
              strokeWidth={1}
            />
            <text x={PAD.left - 8} y={y(g) + 4} textAnchor="end" className="pm-chart-axis">
              {Math.round(g * 100)}%
            </text>
          </g>
        ))}

        {anchors.map((a) => (
          <g key={a.label}>
            <line
              x1={x(a.ms)}
              x2={x(a.ms)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke={ANCHOR_STROKE}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={x(a.ms)}
              y={PAD.top + PLOT_H + 22}
              textAnchor="middle"
              className="pm-chart-axis"
            >
              {a.label}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke={LINE_STROKE} strokeWidth={2} />
        {usable.map((p) => (
          <circle key={p.ms} cx={x(p.ms)} cy={y(p.price)} r={2.5} fill={DOT_FILL} />
        ))}
      </svg>
      <figcaption className="muted">
        {t(
          "Market-implied pricing over time — what the contract cost, not a forecast.",
          "市场隐含定价随时间变化——合约的价格，而非预测。",
        )}
      </figcaption>
    </figure>
  );
}
