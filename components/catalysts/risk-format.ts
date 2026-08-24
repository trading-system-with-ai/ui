"use client";

/**
 * Display vocabulary for the Phase K event-risk surface (§62-§67).
 *
 * UNIT WARNING, and it is the reason this module exists rather than reusing
 * `price-format.fmtRatioPct`: the event-risk seam sends PERCENT NUMBERS
 * (`8.8` = 8.8%), while every other payload on this platform sends FRACTIONS
 * (`0.088` = 8.8%). Both conventions are legitimate and both are documented;
 * what is fatal is a shared formatter, because the two differ by exactly
 * 100× and a wrong one renders an 8.8% earnings move as either 880% or
 * 0.088%. `fmtPctNumber` here scales by NOTHING and is used ONLY on fields
 * this module's own types declare as percent. `price-format`'s scaling
 * formatter is deliberately NOT re-exported from here, so a caller cannot
 * reach for the wrong one by autocomplete.
 *
 * Four more rules are specific to this file:
 *
 *  A. NO STAT WITHOUT ITS n (§64). `historyRows` returns rows only when the
 *     sample exists, and `sampleLine` is the single wording for "based on N
 *     events" — including the N=0 and N=1 cases, which are honest states and
 *     not empty strings. A caller cannot render a median from this module
 *     without having gone past the sample size.
 *  B. UNKNOWN IS NOT LOW. `STATE_BADGE` gives UNKNOWN its own dim badge and
 *     `stateLabel` its own word; `isUnknown` exists so the caller branches on
 *     a named predicate instead of a string compare that a refactor can drop.
 *  C. NOTHING IS DERIVED. No function here re-classifies, re-scores or
 *     recomputes a state from the fields it can see (§63: the classifier is
 *     deterministic and lives on the server). `impliedVsHistorical` computes
 *     BAR WIDTHS — a pure display geometry over two numbers the server sent —
 *     and nothing else.
 *  D. A NULL IS A NULL. Every formatter returns `null` for an absent value
 *     rather than a dash or a zero, so the CALLER decides whether the gap is
 *     worth a row and what reason to print in its place.
 */
import type { TFn } from "./event-format";
import type {
  EventRiskGreeks,
  EventRiskHistorical,
  EventRiskSnapshot,
} from "@/lib/types-event-risk";

/* ------------------------------------------------------------------ units */

/**
 * Format a PERCENT NUMBER as a percentage. Scales by nothing — see the header.
 * Returns null (not "0.0%", not "—") when absent or non-finite.
 */
export function fmtPctNumber(
  v: number | null | undefined,
  digits = 1,
  signed = false,
): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

/** USD, no cents by default. Same null contract as `fmtPctNumber`. */
export function fmtUsd0(v: number | null | undefined, digits = 0): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * A signed greek at 2dp. Greeks are NOT percentages and are never scaled;
 * a null greek returns null so the caller prints the absence, not a 0.00
 * that would read as "this position has no vega".
 */
export function fmtGreek(v: number | null | undefined, digits = 2): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v.toFixed(digits);
}

/**
 * "in 1.3 days" / "in 4 hours" / "today".
 *
 * Fractional days are the norm on this seam (a print 31 hours out is 1.3),
 * and rounding 1.3 to "1 day" loses the half day that decides whether a
 * position is held through the print. Sub-day distances are therefore
 * rendered in HOURS, and a past/zero distance says so rather than printing a
 * negative countdown.
 */
export function fmtCountdown(days: number | null | undefined, t: TFn): string | null {
  if (days == null || !Number.isFinite(days)) return null;
  if (days < 0) {
    const past = Math.abs(days);
    return past < 1
      ? t("already passed", "已过去")
      : t(`${past.toFixed(1)} days ago`, `${past.toFixed(1)} 天前`);
  }
  if (days < 1 / 24) return t("under an hour", "不足一小时");
  if (days < 1) {
    const hours = days * 24;
    return t(`in ${hours.toFixed(1)} hours`, `${hours.toFixed(1)} 小时后`);
  }
  return t(`in ${days.toFixed(1)} days`, `${days.toFixed(1)} 天后`);
}

/* ------------------------------------------------------------------ state */

/**
 * Badge class per state.
 *
 * UNKNOWN is DIM, not green: it is the absence of a reading, and colouring it
 * like LOW would turn "we have no sample and no implied move" into "this
 * event is quiet", which is the §64 failure this whole surface exists to
 * avoid.
 */
export const STATE_BADGE: Record<string, "green" | "amber" | "red" | "dim"> = {
  LOW: "green",
  MODERATE: "amber",
  HIGH: "red",
  EXTREME: "red",
  UNKNOWN: "dim",
};

export const STATE_LABEL: Record<string, { en: string; zh: string }> = {
  LOW: { en: "LOW", zh: "低" },
  MODERATE: { en: "MODERATE", zh: "中等" },
  HIGH: { en: "HIGH", zh: "高" },
  EXTREME: { en: "EXTREME", zh: "极高" },
  UNKNOWN: { en: "UNKNOWN", zh: "未知" },
};

/** The ladder, low to high. UNKNOWN is deliberately NOT on it — it is off-axis. */
export const STATE_LADDER = ["LOW", "MODERATE", "HIGH", "EXTREME"] as const;

export function stateBadge(state: string | null | undefined): string {
  if (state == null || state === "") return "dim";
  return STATE_BADGE[state] ?? "dim";
}

export function stateLabel(state: string | null | undefined, t: TFn): string {
  if (state == null || state === "") return t("UNKNOWN", "未知");
  const label = STATE_LABEL[state];
  return label == null ? state.replace(/_/g, " ") : t(label.en, label.zh);
}

/** Named predicate so callers never string-compare an unknown state inline. */
export function isUnknown(state: string | null | undefined): boolean {
  return state == null || state === "" || state === "UNKNOWN";
}

/** One sentence per state — what it says and, as importantly, what it does not. */
export function stateMeaning(state: string | null | undefined, t: TFn): string {
  switch (state) {
    case "EXTREME":
      return t(
        "Previous comparable events, or the move the option market is charging for this one, are very large by this stock's own standards. It is a statement about SIZE, not direction — the classifier has no view on which way the print goes.",
        "以该股票自身的历史标准衡量，其历史同类事件的波动幅度、或期权市场为本次事件定价的波动幅度都非常大。这只是对「幅度」的判断，而非方向判断 — 分类器对财报公布后的涨跌方向不作任何预测。",
      );
    case "HIGH":
      return t(
        "The expected move is large by this stock's own standards. It is a statement about SIZE, not direction — the classifier has no view on which way the print goes.",
        "以该股票自身的历史标准衡量，预期波动幅度较大。这只是对「幅度」的判断，而非方向判断 — 分类器对财报公布后的涨跌方向不作任何预测。",
      );
    case "MODERATE":
      return t(
        "The expected move is ordinary by this stock's own standards. Ordinary is not small: an ordinary earnings move is still several times an ordinary day.",
        "以该股票自身的历史标准衡量，预期波动幅度属常规水平。「常规」并不等于「小」：一次常规的财报波动，幅度仍是普通交易日的数倍。",
      );
    case "LOW":
      return t(
        "The expected move is small by this stock's own standards. That is a measurement of past events and current option pricing, not a promise about this one.",
        "以该股票自身的历史标准衡量，预期波动幅度较小。这是对历史事件与当前期权定价的度量，而非对本次事件的承诺。",
      );
    default:
      return t(
        "There is no implied move for this event and no previous comparable event on file, so no state was assigned. This is an absence of evidence, NOT a low-risk finding — the next print could be the largest this stock has had.",
        "本次事件既无隐含波动幅度数据，档案中也无历史同类事件，因此未作出风险状态判定。这是「证据缺失」，而非「低风险」结论 — 下一次财报的波动幅度完全可能是该股票历史之最。",
      );
  }
}

/* -------------------------------------------------------------- sensitivity */

export const SENSITIVITY_BADGE: Record<string, "green" | "amber" | "red" | "dim"> = {
  LOW: "dim",
  MODERATE: "amber",
  HIGH: "red",
};

export function sensitivityBadge(v: string | null | undefined): string {
  if (v == null || v === "") return "dim";
  return SENSITIVITY_BADGE[v] ?? "dim";
}

export function sensitivityLabel(v: string | null | undefined, t: TFn): string {
  switch (v) {
    case "HIGH":
      return t("HIGH", "高");
    case "MODERATE":
      return t("MODERATE", "中等");
    case "LOW":
      return t("LOW", "低");
    default:
      return v == null || v === "" ? t("not reported", "未提供") : v;
  }
}

/* ------------------------------------------------------------------ basis */

export const BASIS_LABEL: Record<string, { en: string; zh: string }> = {
  IMPLIED: { en: "IMPLIED", zh: "隐含" },
  HISTORICAL_MEDIAN: { en: "HISTORICAL MEDIAN", zh: "历史中位数" },
  NONE: { en: "NO BASIS", zh: "无依据" },
};

export function basisLabel(basis: string | null | undefined, t: TFn): string {
  if (basis == null || basis === "") return t("NO BASIS", "无依据");
  const label = BASIS_LABEL[basis];
  return label == null ? basis.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * What the basis MEANS, since the two are different kinds of statement: one
 * is a price two parties transacted at, the other is a count of what already
 * happened. Neither is a forecast, and the wording says so.
 */
export function basisNote(basis: string | null | undefined, t: TFn): string | null {
  switch (basis) {
    case "IMPLIED":
      return t(
        "The expected move is the OPTION MARKET'S PRICE for this event — what buyers and sellers of the straddle agreed to transact at. It is not a forecast, and the market has been wrong about magnitude in both directions.",
        "预期波动幅度取自期权市场对本次事件的「定价」 — 即跨式期权买卖双方成交所依据的价格。它并非预测，且市场对波动幅度的定价在两个方向上都曾出错。",
      );
    case "HISTORICAL_MEDIAN":
      return t(
        "No implied move was available, so the expected move is the MEDIAN ABSOLUTE MOVE of previous comparable events. It describes what already happened, and past prints do not bound the next one.",
        "由于无可用的隐含波动幅度数据，预期波动幅度取自历史同类事件的「绝对波动幅度中位数」。它描述的是已发生的情况，而历史财报的波动幅度并不构成对下一次的上限约束。",
      );
    case "NONE":
      return t(
        "Neither an implied move nor a single previous comparable event was available, so there is no expected move at all.",
        "既无隐含波动幅度数据，也没有任何一次历史同类事件可供参考，因此完全无法给出预期波动幅度。",
      );
    default:
      return null;
  }
}

/* -------------------------------------------------------------- §64 sample */

/**
 * "based on 8 events" — the ONE wording for sample size on this surface.
 *
 * `n == 0` and `n == null` are DIFFERENT and both are said out loud: the
 * first is "no previous comparable events on file", the second is a server
 * that sent no count, which a UI must never quietly render as zero. There is
 * no branch here that returns an empty string, because §64's requirement is
 * that a stat can never appear without its sample size.
 */
export function sampleLine(n: number | null | undefined, t: TFn): string {
  if (n == null || !Number.isFinite(n)) {
    return t("sample size not reported", "未提供样本量");
  }
  if (n <= 0) return t("no previous comparable events on file", "档案中无历史同类事件");
  if (n === 1) {
    return t("based on 1 event — a single print, not a distribution", "基于 1 次事件 — 仅为单次财报，不构成分布");
  }
  if (n < 4) {
    return t(`based on ${n} events — too few to be a distribution`, `基于 ${n} 次事件 — 样本过少，不构成分布`);
  }
  return t(`based on ${n} events`, `基于 ${n} 次事件`);
}

/** The count itself, as a number the caller can put in a header cell. */
export function sampleN(h: EventRiskHistorical | null | undefined): number | null {
  const n = h?.n;
  return n == null || !Number.isFinite(n) ? null : n;
}

/** True when there is a usable historical sample at all. */
export function hasSample(h: EventRiskHistorical | null | undefined): boolean {
  const n = sampleN(h);
  return n != null && n > 0;
}

/* ---------------------------------------------------------------- history */

export interface HistoryRow {
  key: "median_abs" | "p75_abs" | "p90_abs" | "max_abs";
  label: { en: string; zh: string };
  value: number | null;
}

/**
 * The historical table's rows, in display order.
 *
 * Returns `[]` when there is NO sample, so the caller renders the §64 empty
 * state instead of four rows of dashes — four dashes read as "we measured and
 * found nothing", which is not what an empty sample means. Individual nulls
 * within a real sample are preserved as nulls (the server can compute a
 * median but not a p90 on a tiny sample).
 */
export function historyRows(h: EventRiskHistorical | null | undefined): HistoryRow[] {
  if (!hasSample(h)) return [];
  const pick = (v: number | null | undefined): number | null =>
    v == null || !Number.isFinite(v) ? null : v;
  return [
    { key: "median_abs", label: { en: "Median", zh: "中位数" }, value: pick(h?.median_abs) },
    { key: "p75_abs", label: { en: "75th pct", zh: "75 分位" }, value: pick(h?.p75_abs) },
    { key: "p90_abs", label: { en: "90th pct", zh: "90 分位" }, value: pick(h?.p90_abs) },
    { key: "max_abs", label: { en: "Largest", zh: "最大值" }, value: pick(h?.max_abs) },
  ];
}

/* ------------------------------------------------- implied vs historical bar */

export interface ComparisonBars {
  implied: number | null;
  historical: number | null;
  /** 0-100 bar widths over the shared scale; null where the value is null. */
  impliedWidth: number | null;
  historicalWidth: number | null;
  /** The value the 100% end of both bars stands for. */
  scaleMax: number | null;
}

/**
 * Geometry for the implied-vs-historical bar pair.
 *
 * ONE shared scale for both bars — that is the whole point. Two bars each
 * normalised to their own maximum would always render the same length and
 * silently erase the comparison, which on this panel is the entire finding
 * ("the market is charging more than this stock has ever delivered").
 *
 * A bar is DRAWN ONLY where the value exists: a missing implied move yields
 * `impliedWidth: null`, never a zero-width bar that reads as "the market
 * priced no move".
 */
export function impliedVsHistorical(
  snapshot: EventRiskSnapshot | null | undefined,
): ComparisonBars {
  const finite = (v: number | null | undefined): number | null =>
    v == null || !Number.isFinite(v) ? null : v;
  const implied = finite(snapshot?.implied?.pct);
  const historical = hasSample(snapshot?.historical)
    ? finite(snapshot?.historical?.median_abs)
    : null;
  const values = [implied, historical].filter((v): v is number => v != null);
  if (values.length === 0) {
    return {
      implied,
      historical,
      impliedWidth: null,
      historicalWidth: null,
      scaleMax: null,
    };
  }
  const scaleMax = Math.max(...values.map((v) => Math.abs(v)));
  const width = (v: number | null): number | null => {
    if (v == null) return null;
    if (scaleMax <= 0) return 0;
    return Math.min(100, Math.max(0, (Math.abs(v) / scaleMax) * 100));
  };
  return {
    implied,
    historical,
    impliedWidth: width(implied),
    historicalWidth: width(historical),
    scaleMax,
  };
}

/* ------------------------------------------------------------------ greeks */

export interface GreekRow {
  key: "gamma" | "vega" | "theta";
  label: string;
  /** Glossary key for the <Term> explainer; all three already exist. */
  termKey: string;
  value: number | null;
}

/**
 * The three greek rows, or `[]` when the server sent NO greeks block.
 *
 * Null and "all zeros" are different facts and this function keeps them
 * apart: `null` in, empty list out (the caller prints "no option position"),
 * while a real block with a null vega renders a vega ROW whose value is
 * absent. A zeroed-out fallback would tell an options holder their position
 * has no volatility exposure into an earnings print.
 */
export function greekRows(g: EventRiskGreeks | null | undefined): GreekRow[] {
  if (g == null) return [];
  const pick = (v: number | null | undefined): number | null =>
    v == null || !Number.isFinite(v) ? null : v;
  return [
    { key: "gamma", label: "Gamma", termKey: "gamma", value: pick(g.gamma) },
    { key: "vega", label: "Vega", termKey: "vega", value: pick(g.vega) },
    { key: "theta", label: "Theta", termKey: "theta", value: pick(g.theta) },
  ];
}

/**
 * The §66 long-call sentence.
 *
 * The server's own `explainer` wins wherever it is present (§26/§36 — the
 * audit-worthy wording belongs to the server). This local copy exists ONLY so
 * that the warning cannot be absent from the screen: a caveat conditional on
 * a server field being populated disappears on exactly the degraded payloads
 * that need it most.
 */
export function crushExplainer(
  serverText: string | null | undefined,
  t: TFn,
): string {
  if (typeof serverText === "string" && serverText.trim() !== "") return serverText;
  return t(
    "A long call can lose money despite being right about direction: if the realized move is smaller than the implied move the option was priced on, the collapse in implied volatility after the event can cost more than the underlying's move earns.",
    "即使方向判断正确，买入看涨期权仍可能亏损：若事件后实际波动幅度小于期权定价所依据的隐含波动幅度，则事件后隐含波动率的骤降（波动率崩塌）所造成的损失，可能超过标的价格变动带来的收益。",
  );
}

/**
 * The expected-crush word — never a number, because the platform subscribes to
 * no forward volatility surface and forecasts no crush.
 *
 * Accepts the bare string the server sends (`expected_iv_crush: "NO_DATA"`)
 * and, defensively, a `{status}` block, so a later server that wraps the field
 * cannot blank this cell. `NO_DATA` is the honest default: an absent field
 * reads as the same thing rather than as a cleared expectation.
 */
export function crushStatus(
  block: string | { status?: string | null } | null | undefined,
): string {
  if (typeof block === "string") {
    return block.trim() !== "" ? block : "NO_DATA";
  }
  const s = block?.status;
  return typeof s === "string" && s.trim() !== "" ? s : "NO_DATA";
}

/* -------------------------------------------------------------- enforcement */

/**
 * The one SHADOW sentence, reused by the tab and by the trade-plan panel so
 * the two can never disagree about what this layer does.
 */
export function enforcementNote(
  enforcement: string | null | undefined,
  t: TFn,
): string {
  if (enforcement != null && enforcement !== "" && enforcement !== "SHADOW") {
    // The day this layer is promoted, the sentence must change with it rather
    // than keep asserting a mode the server no longer reports.
    return t(
      `Enforcement mode: ${enforcement}. This is no longer shadow-only — read the risk page for what it now does.`,
      `执行模式：${enforcement}。该层已不再是纯影子模式 — 请查阅风控页面了解其当前作用。`,
    );
  }
  return t(
    "SHADOW — event risk is computed, logged and displayed; it changes no order, resizes nothing and blocks nothing. The hard risk limits continue to decide alone.",
    "影子模式 — 事件风险仅作计算、记录与展示；它不会改变任何订单、不会调整仓位规模、也不会阻止任何交易。硬性风控限额仍独立作出决策。",
  );
}

/** The short hover text on the SHADOW badge itself. */
export function shadowTitle(t: TFn): string {
  return t("shadow only — never blocks trades", "仅影子模式 — 绝不阻止任何交易");
}

/* ---------------------------------------------------------------- defensive */

/**
 * Read the snapshot out of either payload shape.
 *
 * The event endpoint nests it under `snapshot`; a trade plan carries the same
 * keys FLAT under `event_risk` alongside `event_key`/`days_to_event`. One
 * accessor means one renderer serves both, and neither surface has to know
 * which one it is looking at.
 */
export function snapshotOf(
  payload: { snapshot?: EventRiskSnapshot | null } | EventRiskSnapshot | null | undefined,
): EventRiskSnapshot | null {
  if (payload == null || typeof payload !== "object") return null;
  const nested = (payload as { snapshot?: EventRiskSnapshot | null }).snapshot;
  if (nested != null && typeof nested === "object") return nested;
  // Flat form: only treat it as a snapshot if it carries at least one key a
  // snapshot actually has — an arbitrary object is not silently adopted.
  const flat = payload as EventRiskSnapshot;
  const keys: (keyof EventRiskSnapshot)[] = [
    "event_risk_state",
    "expected_move_pct",
    "historical",
    "implied",
    "time_to_event_days",
    "drivers",
  ];
  return keys.some((k) => k in flat) ? flat : null;
}

/** Always an array, so a caller never guards `.map` on a server-sent null. */
export function stringList(v: string[] | null | undefined): string[] {
  return Array.isArray(v) ? v.filter((s) => typeof s === "string" && s !== "") : [];
}

/**
 * The countdown a trade-plan panel shows: `days_to_event` when the plan block
 * carries it, else the snapshot's own `time_to_event_days`. The two are the
 * same measurement under two names on two seams; preferring the plan's own
 * field keeps the panel honest if the plan recomputed it more recently.
 */
export function planDays(
  block: { days_to_event?: number | null; time_to_event_days?: number | null } | null | undefined,
): number | null {
  const d = block?.days_to_event;
  if (d != null && Number.isFinite(d)) return d;
  const t2 = block?.time_to_event_days;
  return t2 != null && Number.isFinite(t2) ? t2 : null;
}

/** Event-type word for a heading ("Earnings", "FOMC decision"). */
export function eventTypeLabel(
  eventType: string | null | undefined,
  t: TFn,
): string {
  if (eventType == null || eventType === "") return t("Event", "事件");
  switch (eventType) {
    case "EARNINGS":
      return t("Earnings", "财报");
    case "FOMC_DECISION":
      return t("FOMC decision", "美联储议息决议");
    default:
      return eventType.replace(/_/g, " ");
  }
}
