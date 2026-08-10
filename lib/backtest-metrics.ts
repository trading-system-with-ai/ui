import type { BacktestSegmentMetrics } from "./types";

/** null -> em dash; otherwise fixed decimals. */
export function fmtNum(v: number | null, digits = 2): string {
  return v == null ? "—" : v.toFixed(digits);
}

/** null -> em dash; otherwise percent with optional leading + for gains. */
export function fmtPct(v: number | null, signed = false): string {
  if (v == null) return "—";
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** Green for gains, red for losses, dim for zero/unknown. */
export function returnColor(v: number | null | undefined): string {
  if (v == null || v === 0) return "var(--text-dim)";
  return v > 0 ? "var(--green)" : "var(--red)";
}

export const METRIC_ROWS: {
  key: keyof BacktestSegmentMetrics;
  label: string;
  fmt: (v: number | null) => string;
}[] = [
  { key: "total_return_pct", label: "Total Return", fmt: (v) => fmtPct(v, true) },
  { key: "cagr_pct", label: "CAGR", fmt: (v) => fmtPct(v, true) },
  { key: "sharpe", label: "Sharpe", fmt: (v) => fmtNum(v) },
  { key: "sortino", label: "Sortino", fmt: (v) => fmtNum(v) },
  { key: "max_drawdown_pct", label: "Max Drawdown", fmt: (v) => fmtPct(v) },
  { key: "win_rate", label: "Win Rate", fmt: (v) => fmtPct(v) },
  { key: "profit_factor", label: "Profit Factor", fmt: (v) => fmtNum(v) },
  { key: "expectancy_pct", label: "Expectancy", fmt: (v) => fmtPct(v, true) },
  { key: "avg_trade_pct", label: "Avg Trade", fmt: (v) => fmtPct(v, true) },
  { key: "avg_hold_bars", label: "Avg Hold", fmt: (v) => (v == null ? "—" : `${v.toFixed(1)} bars`) },
  { key: "num_trades", label: "Trades", fmt: (v) => (v == null ? "—" : String(v)) },
  { key: "exposure_pct", label: "Exposure", fmt: (v) => fmtPct(v) },
];
