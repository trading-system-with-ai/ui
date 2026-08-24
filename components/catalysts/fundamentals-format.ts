"use client";

/**
 * Display helpers and the metric TABLE for the Phase E2 Fundamentals tab.
 *
 * The one rule, same as price-format's: a MISSING number and a ZERO number
 * are different facts, and nothing here turns the first into the second.
 * Every formatter returns `null` rather than a placeholder, so the caller is
 * forced to render the server's reason in its place.
 *
 * The other rule is specific to fundamentals: metrics are NOT all the same
 * kind of number. Revenue is dollars in the billions, gross margin is a
 * fraction, EPS is a couple of dollars, P/E is a bare multiple, and shares
 * are a count. Formatting them uniformly is how "0.46" ends up rendered as
 * "$0.46" and a 46% margin reads as a rounding error. The KIND lives in the
 * metric table below, once, beside the metric's own glossary key.
 */
import type { TFn } from "./event-format";
import type {
  FundamentalMetricChange,
  FundamentalMultiple,
  FundamentalReasons,
} from "@/lib/types";

/** How a metric's value should be rendered — see the module note. */
export type MetricKind = "money" | "ratio" | "per_share" | "multiple" | "count";

export interface MetricSpec {
  /** Wire key, matching the backend's METRIC_ORDER entries exactly. */
  key: string;
  en: string;
  zh: string;
  kind: MetricKind;
  /** Glossary key for the ⓘ — every row has one (§58). */
  term: string;
  /** Section heading this row sits under, for the §58 grouped table. */
  group: MetricGroup;
}

export type MetricGroup = "growth" | "profitability" | "cash" | "balance" | "valuation";

export const METRIC_GROUP_LABEL: Record<MetricGroup, { en: string; zh: string }> = {
  growth: { en: "Growth", zh: "增长" },
  profitability: { en: "Profitability", zh: "盈利能力" },
  cash: { en: "Cash flow", zh: "现金流" },
  balance: { en: "Balance sheet", zh: "资产负债" },
  valuation: { en: "Valuation", zh: "估值" },
};

export const METRIC_GROUP_ORDER: MetricGroup[] = [
  "growth",
  "profitability",
  "cash",
  "balance",
  "valuation",
];

/**
 * The §28 metric list, in the backend's METRIC_ORDER. Rows the server does
 * not send are simply absent from the rendered table; rows it sends that are
 * NOT in this table still render (with the raw key as the label), because
 * dropping a metric the server computed would be a silent omission.
 */
export const METRIC_SPECS: MetricSpec[] = [
  { key: "revenue", en: "Revenue", zh: "营业收入", kind: "money", term: "fund_revenue", group: "growth" },
  { key: "revenue_ttm", en: "Revenue (TTM)", zh: "营业收入(TTM)", kind: "money", term: "fund_revenue_ttm", group: "growth" },
  { key: "revenue_growth_yoy", en: "Revenue growth YoY", zh: "收入同比增速", kind: "ratio", term: "fund_revenue_growth_yoy", group: "growth" },
  { key: "eps_diluted", en: "EPS diluted", zh: "稀释每股收益", kind: "per_share", term: "fund_eps_diluted", group: "growth" },
  { key: "eps_diluted_ttm", en: "EPS diluted (TTM)", zh: "稀释每股收益(TTM)", kind: "per_share", term: "fund_eps_diluted_ttm", group: "growth" },
  { key: "eps_growth_yoy", en: "EPS growth YoY", zh: "每股收益同比增速", kind: "ratio", term: "fund_eps_growth_yoy", group: "growth" },
  { key: "gross_margin", en: "Gross margin", zh: "毛利率", kind: "ratio", term: "fund_gross_margin", group: "profitability" },
  { key: "operating_margin", en: "Operating margin", zh: "营业利润率", kind: "ratio", term: "fund_operating_margin", group: "profitability" },
  { key: "net_margin", en: "Net margin", zh: "净利率", kind: "ratio", term: "fund_net_margin", group: "profitability" },
  { key: "roe_ttm", en: "ROE (TTM)", zh: "净资产收益率(TTM)", kind: "ratio", term: "fund_roe", group: "profitability" },
  { key: "roa_ttm", en: "ROA (TTM)", zh: "总资产收益率(TTM)", kind: "ratio", term: "fund_roa", group: "profitability" },
  { key: "roic", en: "ROIC", zh: "投入资本回报率", kind: "ratio", term: "fund_roa", group: "profitability" },
  { key: "operating_cash_flow", en: "Operating cash flow", zh: "经营活动现金流", kind: "money", term: "fund_operating_cash_flow", group: "cash" },
  { key: "operating_cash_flow_ttm", en: "Operating cash flow (TTM)", zh: "经营活动现金流(TTM)", kind: "money", term: "fund_operating_cash_flow", group: "cash" },
  { key: "free_cash_flow", en: "Free cash flow", zh: "自由现金流", kind: "money", term: "fund_free_cash_flow", group: "cash" },
  { key: "capex", en: "Capex", zh: "资本开支", kind: "money", term: "fund_free_cash_flow", group: "cash" },
  { key: "cash", en: "Cash", zh: "现金及等价物", kind: "money", term: "fund_net_debt", group: "balance" },
  { key: "total_debt", en: "Total debt", zh: "有息负债", kind: "money", term: "fund_total_debt", group: "balance" },
  { key: "net_debt", en: "Net debt", zh: "净负债", kind: "money", term: "fund_net_debt", group: "balance" },
  { key: "current_ratio", en: "Current ratio", zh: "流动比率", kind: "multiple", term: "fund_current_ratio", group: "balance" },
  { key: "quick_ratio", en: "Quick ratio", zh: "速动比率", kind: "multiple", term: "fund_current_ratio", group: "balance" },
  { key: "debt_to_equity", en: "Debt / equity", zh: "债务权益比", kind: "multiple", term: "fund_debt_to_equity", group: "balance" },
  { key: "debt_to_ebitda", en: "Debt / EBITDA", zh: "债务/EBITDA", kind: "multiple", term: "fund_ev_ebitda", group: "balance" },
  { key: "shares_diluted", en: "Diluted shares", zh: "稀释股本", kind: "count", term: "fund_shares_diluted", group: "balance" },
  { key: "pe_ttm", en: "P/E (TTM)", zh: "市盈率(TTM)", kind: "multiple", term: "fund_pe_ttm", group: "valuation" },
  { key: "ps_ttm", en: "P/S (TTM)", zh: "市销率(TTM)", kind: "multiple", term: "fund_ps_ttm", group: "valuation" },
  { key: "pb", en: "P/B", zh: "市净率", kind: "multiple", term: "fund_pb", group: "valuation" },
  { key: "ev_ebitda", en: "EV / EBITDA", zh: "企业价值倍数", kind: "multiple", term: "fund_ev_ebitda", group: "valuation" },
  { key: "fcf_yield", en: "FCF yield", zh: "自由现金流收益率", kind: "ratio", term: "fund_free_cash_flow", group: "valuation" },
  { key: "earnings_yield", en: "Earnings yield", zh: "盈利收益率", kind: "ratio", term: "fund_earnings_yield", group: "valuation" },
];

const SPEC_BY_KEY: Map<string, MetricSpec> = new Map(
  METRIC_SPECS.map((spec) => [spec.key, spec]),
);

/**
 * Spec for a wire key. Unknown keys get a synthesised spec rather than being
 * dropped: a metric the server computed and the UI silently swallowed is
 * worse than one rendered with an ugly label.
 */
export function specFor(key: string): MetricSpec {
  const known = SPEC_BY_KEY.get(key);
  if (known != null) return known;
  const label = key.replace(/_/g, " ");
  return { key, en: label, zh: label, kind: "multiple", term: key, group: "valuation" };
}

/** The valuation multiples §30 shows as tiles, in display order. */
export const VALUATION_TILES = ["pe_ttm", "ps_ttm", "pb"] as const;

/** Multiples §30 asks for that this provider structurally cannot supply. */
export const VALUATION_UNAVAILABLE_TILES = ["ev_ebitda", "fcf_yield"] as const;

/**
 * Ratio metrics whose CHANGE is also reported in basis points. Mirrors the
 * backend's BPS_METRICS set — the UI shows bps only where the server sent a
 * `delta_bps`, so this set is a display hint, never a source of arithmetic.
 */
export const BPS_METRICS: ReadonlySet<string> = new Set([
  "gross_margin",
  "operating_margin",
  "net_margin",
  "revenue_growth_yoy",
  "eps_growth_yoy",
  "roe_ttm",
  "roa_ttm",
  "roic",
  "fcf_yield",
  "earnings_yield",
]);

/* ------------------------------------------------------------ formatters */

/**
 * Large currency amounts, scaled to the unit a reader actually thinks in.
 * Returns null for absent/non-finite input — never "$0" and never "—".
 */
export function fmtMoneyCompact(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** A plain share/unit count, scaled the same way but with no currency mark. */
export function fmtCountCompact(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

/** A FRACTION as a percentage (0.4612 → "46.1%"). Null stays null. */
export function fmtPctFrac(
  v: number | null | undefined,
  digits = 1,
  signed = false,
): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const scaled = v * 100;
  const sign = signed && scaled > 0 ? "+" : "";
  return `${sign}${scaled.toFixed(digits)}%`;
}

/** A bare multiple ("28.4×"). Null stays null. */
export function fmtMultiple(
  v: number | null | undefined,
  digits = 2,
): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v.toFixed(digits)}×`;
}

/** A per-share dollar amount ("$1.64"), signed for losses. */
export function fmtPerShare(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
}

/** Render one metric value according to its KIND. Null in → null out. */
export function fmtMetric(
  value: number | null | undefined,
  kind: MetricKind,
  opts: { signed?: boolean } = {},
): string | null {
  switch (kind) {
    case "money":
      return fmtMoneyCompact(value);
    case "ratio":
      return fmtPctFrac(value, 1, opts.signed ?? false);
    case "per_share":
      return fmtPerShare(value);
    case "count":
      return fmtCountCompact(value);
    case "multiple":
      return fmtMultiple(value);
  }
}

/**
 * The CHANGE column's text. Deliberately different from `fmtMetric`:
 *
 *  - A ratio metric's delta is shown in BASIS POINTS when the server sent
 *    one (§29's "+70 bps"), because "+0.7%" next to a 46.1% margin is
 *    ambiguous between 0.7 percentage points and 0.7% relative.
 *  - Money and count deltas keep their compact form with an explicit sign.
 *  - Zero is a real answer and renders as such — it is only ever reached
 *    when both sides were present.
 */
export function fmtDelta(change: FundamentalMetricChange, kind: MetricKind): string | null {
  if (change.delta_bps != null && Number.isFinite(change.delta_bps)) {
    const sign = change.delta_bps > 0 ? "+" : "";
    return `${sign}${change.delta_bps.toFixed(0)} bps`;
  }
  const delta = change.delta;
  if (delta == null || !Number.isFinite(delta)) return null;
  const sign = delta > 0 ? "+" : "";
  switch (kind) {
    case "money": {
      const text = fmtMoneyCompact(delta);
      return text == null ? null : `${delta > 0 ? "+" : ""}${text}`;
    }
    case "ratio":
      return fmtPctFrac(delta, 1, true);
    case "per_share": {
      const text = fmtPerShare(delta);
      return text == null ? null : `${delta > 0 ? "+" : ""}${text}`;
    }
    case "count": {
      const text = fmtCountCompact(delta);
      return text == null ? null : `${delta > 0 ? "+" : ""}${text}`;
    }
    case "multiple":
      return `${sign}${delta.toFixed(2)}`;
  }
}

/** ↑ / ↓ / → from the server's own direction token. Never re-derived from
 *  the numbers: if the server said "flat", the arrow says flat. */
export function directionArrow(direction: string | null | undefined): string | null {
  if (direction == null || direction === "") return null;
  const key = direction.toLowerCase();
  if (key === "up" || key === "higher" || key === "↑") return "↑";
  if (key === "down" || key === "lower" || key === "↓") return "↓";
  if (key === "flat" || key === "unchanged" || key === "→") return "→";
  return null;
}

/**
 * Colour a change by direction. NOT by sign — for leverage and valuation
 * metrics "up" is not good, and this module refuses to imply otherwise by
 * painting anything green. Only the arrow's own direction is coloured, and
 * only where the metric is one where more IS better.
 */
export const HIGHER_IS_BETTER: ReadonlySet<string> = new Set([
  "revenue",
  "revenue_ttm",
  "revenue_growth_yoy",
  "gross_margin",
  "operating_margin",
  "net_margin",
  "eps_diluted",
  "eps_diluted_ttm",
  "eps_growth_yoy",
  "operating_cash_flow",
  "operating_cash_flow_ttm",
  "roe_ttm",
  "roa_ttm",
  "current_ratio",
]);

export function changeColor(change: FundamentalMetricChange): string {
  const delta = change.delta;
  if (delta == null || !Number.isFinite(delta) || delta === 0) {
    return "var(--text-dim)";
  }
  if (!HIGHER_IS_BETTER.has(change.metric)) return "var(--text)";
  return delta > 0 ? "var(--green)" : "var(--red)";
}

/** Trend token → bilingual label. Unknown tokens fall through verbatim. */
export const TREND_LABEL: Record<string, { en: string; zh: string }> = {
  improving: { en: "improving", zh: "改善中" },
  deteriorating: { en: "deteriorating", zh: "恶化中" },
  flat: { en: "flat", zh: "持平" },
};

/** Momentum label token → bilingual label. Unknown tokens fall through. */
export const MOMENTUM_LABEL: Record<string, { en: string; zh: string }> = {
  fundamentals_improving: { en: "Fundamentals improving", zh: "基本面改善" },
  fundamentals_weakening: { en: "Fundamentals weakening", zh: "基本面走弱" },
  fundamentals_mixed: { en: "Fundamentals mixed", zh: "基本面涨跌互现" },
  fundamentals_unknown: { en: "Fundamentals unknown", zh: "基本面未知" },
};

/**
 * Find the server's explanation for a null metric. Exact key first, then the
 * block-level fallbacks the backend uses when one reason covers everything.
 * Returns null when the server sent no reason — reported as such, never
 * replaced with wording invented on the server's behalf.
 */
export function reasonFor(
  reasons: FundamentalReasons | null | undefined,
  ...keys: string[]
): string | null {
  if (reasons == null) return null;
  for (const k of keys) {
    const r = reasons[k];
    if (typeof r === "string" && r !== "") return r;
  }
  for (const fallback of ["statements_unavailable", "no_statements", "all"]) {
    const r = reasons[fallback];
    if (typeof r === "string" && r !== "") return r;
  }
  return null;
}

/**
 * The single sentence shown wherever a metric is missing. The server's reason
 * passes through VERBATIM (§26/§36) — it names the real field and the real
 * shortfall ("input_unavailable:income_statement.revenues"), which no
 * client-side wording could reproduce. Only the no-reason case is worded
 * here, and it says exactly that rather than pretending to know why.
 */
export function unavailableText(reason: string | null | undefined, t: TFn): string {
  if (reason == null || reason === "") {
    return t(
      "Unavailable — the server sent no reason.",
      "无法计算 — 服务端未提供原因。",
    );
  }
  return t(`Unavailable — ${reason}`, `无法计算 — ${reason}`);
}

/** ISO datetime → the date part, verbatim. Never re-derives a date. */
export function isoDate(v: string | null | undefined): string | null {
  if (v == null || v === "") return null;
  const idx = v.indexOf("T");
  return idx === -1 ? v : v.slice(0, idx);
}

/**
 * English ordinal suffix — "1st", "22nd", "13th". Worth the eight lines
 * because "82th percentile" on a valuation tile reads as a typo, and a typo
 * on a number is exactly the thing that makes a reader distrust the rest.
 */
export function ordinal(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * "P/E 28.4× — 62nd pct of 11 quarters (median 24.1×)".
 *
 * The SAMPLE SIZE is part of the sentence, never a footnote (§64): a
 * percentile over 4 observations is barely a statement, and a reader who
 * sees "88th percentile" without the count will read it as if it came from
 * a long history. Returns null when there is no history to speak of, so the
 * caller shows the server's history_reason instead.
 */
export function ownHistorySentence(
  block: FundamentalMultiple | null | undefined,
  t: TFn,
): string | null {
  if (block == null) return null;
  const n = block.history_n ?? 0;
  if (n < 1) return null;
  const parts: string[] = [];
  const pct = block.percentile;
  if (pct != null && Number.isFinite(pct)) {
    const p = Math.round(pct * 100);
    parts.push(t(`${ordinal(p)} pct of ${n}`, `处于 ${n} 期中第 ${p} 百分位`));
  } else {
    parts.push(t(`${n} historical points`, `${n} 期历史数据`));
  }
  const median = fmtMultiple(block.median);
  if (median != null) parts.push(t(`median ${median}`, `中位 ${median}`));
  const lo = fmtMultiple(block.min);
  const hi = fmtMultiple(block.max);
  if (lo != null && hi != null) parts.push(t(`range ${lo}–${hi}`, `区间 ${lo}–${hi}`));
  return parts.join(" · ");
}
