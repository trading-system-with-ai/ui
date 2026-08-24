"use client";

/**
 * Display helpers for the Phase I options surface (§18, §36-§37).
 *
 * Like `replay-format`, this extends `price-format` rather than restating
 * it: `fmtRatioPct`, `signColor`, `unavailableText` and `isoDate` are
 * imported and re-exported, because a second copy of "how a fraction becomes
 * a percent" is exactly how two tabs start disagreeing about the same number.
 *
 * What is new here is the pair of judgements the options tab has to make and
 * no other tab does:
 *
 *  1. WHICH BASIS AM I LOOKING AT. A live ATM straddle and one reconstructed
 *     from daily closes are different measurements with the same units, and
 *     the second is an APPROXIMATION — a close is not a mid, and an option's
 *     close on a thin strike can be hours stale. `basisBadge` gives each its
 *     own visible label so the two can never be read as the same reading.
 *  2. IS THIS ROW SAYING ANYTHING AT ALL. `metricValue` is the single gate:
 *     a number is shown only when it is finite AND the row's status is not
 *     NO_DATA. Both halves matter — a server that sends a stale numeric
 *     alongside NO_DATA is describing a computation it does not stand behind,
 *     and printing it would turn the server's own retraction into a quote.
 */
import type { TFn } from "./event-format";
import { fmtRatioPct, isoDate, signColor, unavailableText } from "./price-format";
import type {
  EventOptionHistoryRow,
  EventOptionMetrics,
  ImpliedClassification,
  OptionMoveStats,
} from "@/lib/types-options";

export { fmtRatioPct, isoDate, signColor, unavailableText };

/**
 * The §37 sentence, in the tab's own words.
 *
 * The server sends its own `disclaimer` and that one wins wherever it is
 * present (§26/§36 — the audit-worthy wording is the server's). This exists
 * for the case the server sent none, so that the caveat is never absent from
 * the screen. A tab whose central warning is conditional on a server field
 * being populated is a tab whose central warning disappears on exactly the
 * degraded payloads that need it most.
 */
export function disclaimerText(
  serverText: string | null | undefined,
  t: TFn,
): string {
  if (typeof serverText === "string" && serverText.trim() !== "") return serverText;
  return t(
    "The implied move is option-market pricing, not a forecast. It is what buyers and sellers of this straddle agreed to transact at — it says nothing about direction, and the market has been wrong about magnitude in both directions.",
    "隐含波动幅度反映的是期权市场的定价,而非预测。它只是该跨式期权的买卖双方成交所依据的价格 — 不表示任何方向判断,且市场对波动幅度的定价在两个方向上都曾出错。",
  );
}

/** The two bases, each with its own badge class and its own honest label. */
export const BASIS_LABEL: Record<
  string,
  { en: string; zh: string; badge: string; note: { en: string; zh: string } }
> = {
  LIVE_CHAIN_SNAPSHOT: {
    en: "LIVE CHAIN",
    zh: "实时期权链",
    badge: "green",
    note: {
      en: "Read from the current option chain — mid prices at the instant this page was loaded, not a stored record. It moves with the market.",
      zh: "取自当前期权链 — 为本页加载瞬间的中间价,而非已存储的记录,会随市场变动。",
    },
  },
  HISTORICAL_DAILY_CLOSE_APPROXIMATION: {
    en: "HISTORICAL APPROXIMATION",
    zh: "历史近似值",
    badge: "amber",
    note: {
      en: "Reconstructed from DAILY CLOSES of the two option legs, not from the intraday quotes a trader would have seen. A close is not a mid, and on a thin strike it can be hours stale — treat this as an approximation of the pre-event straddle, not a record of it.",
      zh: "由两条期权腿的「每日收盘价」重建,而非交易者当时看到的盘中报价。收盘价不等于中间价,在流动性稀薄的行权价上甚至可能滞后数小时 — 应将其视为事件前跨式期权价格的近似值,而非真实记录。",
    },
  },
};

/**
 * The badge for a basis token.
 *
 * An unrecognised token renders VERBATIM in the neutral badge rather than
 * being dropped or coerced to one of the two known values: a third basis
 * arriving from the server is information, and silently labelling it "LIVE"
 * would be the worst possible way to handle it.
 */
export function basisBadge(
  basis: string | null | undefined,
  t: TFn,
): { text: string; badge: string; note: string | null } {
  if (basis == null || basis === "") {
    return {
      text: t("BASIS NOT STATED", "未标注计算依据"),
      badge: "dim",
      note: t(
        "The server did not say how this number was measured, so it cannot be read as either a live quote or a historical reconstruction.",
        "服务端未说明该数值的计算方式,因此既不能当作实时报价,也不能当作历史重建值来解读。",
      ),
    };
  }
  const spec = BASIS_LABEL[basis];
  if (spec == null) {
    return { text: basis, badge: "dim", note: null };
  }
  return { text: t(spec.en, spec.zh), badge: spec.badge, note: t(spec.note.en, spec.note.zh) };
}

/** §37's three verdicts. Neutral badges — none of them is a recommendation. */
export const CLASSIFICATION_LABEL: Record<string, { en: string; zh: string }> = {
  UNDER_PRICED: { en: "UNDER-PRICED", zh: "定价偏低" },
  FAIR: { en: "FAIR", zh: "定价合理" },
  OVER_PRICED: { en: "OVER-PRICED", zh: "定价偏高" },
};

/**
 * Text for a classification token.
 *
 * NO COLOUR is returned with it, and that is the point. "OVER_PRICED" tinted
 * red would read as a warning and "UNDER_PRICED" tinted green as an
 * opportunity, when the label is a backward-looking arithmetic comparison of
 * one straddle against one realized move — it asserts no direction and has
 * never been tested as a trading rule.
 */
export function classificationText(
  classification: ImpliedClassification | null | undefined,
  t: TFn,
): string | null {
  if (classification == null || classification === "") return null;
  const label = CLASSIFICATION_LABEL[classification];
  return label == null ? classification.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * The ONE gate every number on this tab passes through.
 *
 * Returns the value only when it is finite AND the row does not carry
 * NO_DATA. Both conditions are load-bearing: NaN/undefined is the ordinary
 * missing case, while a finite number sitting next to `status: "NO_DATA"` is
 * a server retracting its own computation, and rendering it anyway would
 * quote a figure nobody stands behind.
 */
export function metricValue(
  row: { status?: string | null } | null | undefined,
  v: number | null | undefined,
): number | null {
  if (row?.status === "NO_DATA") return null;
  if (v == null || !Number.isFinite(v)) return null;
  return v;
}

/**
 * The first server note, used as the reason line beside a missing number.
 *
 * Server notes are rendered verbatim (§26/§36). Returns null when there are
 * none, so the caller falls through to `unavailableText`'s "the server sent
 * no reason" rather than the UI inventing an explanation on its behalf.
 */
export function firstNote(
  row: { notes?: string[] | null } | null | undefined,
): string | null {
  const notes = row?.notes;
  if (notes == null || notes.length === 0) return null;
  const first = notes.find((n) => typeof n === "string" && n !== "");
  return first ?? null;
}

/**
 * True when a metrics row carries no usable straddle at all.
 *
 * Checked against the implied move specifically, not against the row's mere
 * existence: the whole tab hangs off that one number, and a row that has an
 * expiry, a strike and a spot but no implied move has told us which contract
 * it looked at and nothing about what it cost.
 */
export function noData(row: EventOptionMetrics | null | undefined): boolean {
  if (row == null) return true;
  if (row.status === "NO_DATA") return true;
  return metricValue(row, row.implied_move_pct) == null;
}

/**
 * Format the implied move as the ± band it actually describes.
 *
 * "±6.2%" rather than "6.2%": a straddle prices MAGNITUDE and has no sign,
 * and dropping the ± lets a reader take it for a directional return. Null in,
 * null out — the caller pairs the absence with the server's reason.
 */
export function fmtBand(v: number | null | undefined, digits = 1): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `±${(Math.abs(v) * 100).toFixed(digits)}%`;
}

/** Format a ratio as "1.34×". Not a percentage — "134%" reads as a return. */
export function fmtRatio(v: number | null | undefined, digits = 2): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${v.toFixed(digits)}×`;
}

/** Format an IV level (a fraction: 0.58 → "58.0%"). Same null contract. */
export function fmtIv(v: number | null | undefined, digits = 1): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${(v * 100).toFixed(digits)}%`;
}

/**
 * "median 4.1% · p90 7.8% · max 9.3% (n=8)" — one stat line.
 *
 * `n` is appended UNCONDITIONALLY when present (§64). A p90 over three
 * events and a p90 over twelve are different objects, and a line that shows
 * the number without the sample size makes them look identical. Returns null
 * when the window is empty, so the caller renders the absence instead.
 */
export function statsLine(
  stats: OptionMoveStats | null | undefined,
  t: TFn,
): string | null {
  if (stats == null) return null;
  const parts: string[] = [];
  const median = fmtRatioPct(stats.median_abs, 1);
  const p90 = fmtRatioPct(stats.p90_abs, 1);
  const max = fmtRatioPct(stats.max_abs, 1);
  if (median != null) parts.push(`${t("median", "中位数")} ${median}`);
  if (p90 != null) parts.push(`${t("p90", "90 分位")} ${p90}`);
  if (max != null) parts.push(`${t("max", "最大")} ${max}`);
  if (parts.length === 0) return null;
  const n = stats.n;
  const tail = n != null && Number.isFinite(n) ? ` (n=${n})` : "";
  return `${parts.join(" · ")}${tail}`;
}

/**
 * The absolute moves the chart plots, one pair per prior event.
 *
 * ABSOLUTE on both columns: an implied move has no sign, so comparing it
 * against a signed actual return would make a −7% drop look like it
 * undershot a +6% expectation. Rows where BOTH halves are missing are
 * dropped — a bar pair with nothing in it is an event the chart cannot say
 * anything about, and an empty slot on the axis reads as "no move".
 */
export function chartRows(
  history: EventOptionHistoryRow[] | null | undefined,
): { key: string; label: string; implied: number | null; actual: number | null }[] {
  if (history == null) return [];
  const out: {
    key: string;
    label: string;
    implied: number | null;
    actual: number | null;
  }[] = [];
  history.forEach((row, i) => {
    const implied = metricValue(row, row.implied_move_pct);
    const rawActual = metricValue(row, row.actual_move_pct);
    const actual = rawActual == null ? null : Math.abs(rawActual);
    if (implied == null && actual == null) return;
    const date = isoDate(row.event_date);
    out.push({
      key: row.event_key ?? String(row.event_id ?? i),
      label: date ?? String(row.event_key ?? i),
      implied: implied == null ? null : Math.abs(implied),
      actual,
    });
  });
  return out;
}
