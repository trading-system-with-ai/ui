"use client";

/**
 * Display vocabulary for the Phase H Fed tab.
 *
 * Same contract as `macro-format.ts` and `event-format.ts`: every table is 1:1
 * over a closed server enum WITH THE RAW TOKEN as its fallback, and no
 * function here derives a fact. Four rules are specific to this file, and each
 * exists because breaking it produces a Fed screen that looks authoritative
 * and is wrong:
 *
 *  A. NO FUNCTION IN THIS FILE RETURNS A HAWKISH/DOVISH READING (§43). There
 *     is no scorer, no tone mapper, no signed dimension weight — not even a
 *     private one. This is the enforcement point for the rule, because a
 *     "score" is exactly the kind of helper that gets added to a format module
 *     for a sparkline and then read as a finding. The dimensions carry
 *     STATUSES (changed / unchanged), which say whether the language moved,
 *     never which way it leans. `dimensionStatusText` deliberately has no
 *     colour branch that could imply a direction either.
 *  B. THE TWO REACTION WINDOWS ARE NEVER COMBINED (§45). `windowSymbols`
 *     reads one window at a time and there is no function that sums, averages
 *     or picks "the" FOMC return. The classic FOMC afternoon has the statement
 *     and the presser moving markets in opposite directions, and one merged
 *     number reports that afternoon as if nothing happened.
 *  C. A NULL IS A NULL. Every formatter returns `null` for an absent value
 *     rather than "—" or "0", so the CALLER decides whether the gap deserves a
 *     row. Zero is NOT absent: a statement that moved SPY 0.00% across the
 *     14:00 window is a finding, and the `Number.isFinite` guards keep it on
 *     screen.
 *  D. THE DOCUMENT'S OWN WORDS ARE NEVER REWRITTEN (§44). The diff texts, the
 *     vote sentence and the target-range text pass through verbatim; nothing
 *     here truncates, sentence-cases or re-punctuates them. `targetRangeText`
 *     prefers the Fed's own wording and only falls back to the parsed bounds.
 */
import type { TFn } from "./event-format";
import type {
  EventFedBackfillResult,
  EventFedPayload,
  FedDiffItem,
  FedDiffStatus,
  FedPreviousReaction,
  FedReactionWindow,
  FedStatementDiff,
  FedTargetRange,
  FedVote,
  FedWindowReaction,
} from "@/lib/types-fed";
import { FED_DIMENSIONS } from "@/lib/types-fed";

/* ------------------------------------------------------------- dimensions */

/**
 * Bilingual name per §43 dimension.
 *
 * Named for WHAT THE LANGUAGE IS ABOUT, never for a stance: "Forward
 * guidance", not "Guidance tone". A column header is the cheapest place to
 * smuggle in the judgement this tab refuses to make.
 */
export const DIMENSION_LABEL: Record<string, { en: string; zh: string }> = {
  POLICY_RATE: { en: "Policy rate", zh: "政策利率" },
  INFLATION: { en: "Inflation", zh: "通胀" },
  EMPLOYMENT: { en: "Employment", zh: "就业" },
  GROWTH: { en: "Growth", zh: "经济增长" },
  BALANCE_SHEET: { en: "Balance sheet", zh: "资产负债表" },
  FORWARD_GUIDANCE: { en: "Forward guidance", zh: "前瞻指引" },
  RISK_BALANCE: { en: "Balance of risks", zh: "风险平衡" },
  COMMITTEE_DISPERSION: { en: "Committee dispersion", zh: "委员会分歧" },
};

export function dimensionLabel(dimension: string | null | undefined, t: TFn): string {
  if (dimension == null || dimension === "") return t("Dimension", "维度");
  const label = DIMENSION_LABEL[dimension];
  return label == null ? dimension.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * Dimensions present in a report, in FED_DIMENSIONS order then any unknown
 * ones.
 *
 * An unknown dimension sorts to the end rather than being dropped: U2 owns the
 * catalogue and may add one (a "financial conditions" tag, say) before this
 * file knows it, and a dimension silently missing from the table is a hole the
 * reader cannot see.
 */
export function orderedDimensions(
  dimensions: Record<string, unknown> | null | undefined,
): string[] {
  if (dimensions == null || typeof dimensions !== "object") return [];
  const present = Object.keys(dimensions).filter((k) => k !== "");
  const known = FED_DIMENSIONS.filter((d) => present.includes(d));
  const unknown = present
    .filter((d) => !(FED_DIMENSIONS as readonly string[]).includes(d))
    .sort();
  return [...known, ...unknown];
}

/**
 * A dimension's status word.
 *
 * Bilingual over a closed enum, raw token as the fallback. Note there is no
 * companion `dimensionStatusColor`: colouring CHANGED red or green would be a
 * direction, and the whole point of §43 is that this tab reports THAT the
 * language moved without telling the reader which way it leans.
 */
export const DIMENSION_STATUS_LABEL: Record<string, { en: string; zh: string }> = {
  CHANGED: { en: "CHANGED", zh: "有变化" },
  UNCHANGED: { en: "UNCHANGED", zh: "无变化" },
  ADDED: { en: "ADDED", zh: "新增" },
  REMOVED: { en: "REMOVED", zh: "删除" },
  NA: { en: "NOT PRESENT", zh: "未涉及" },
};

export function dimensionStatusText(
  status: string | null | undefined,
  t: TFn,
): string {
  if (status == null || status === "") return t("NOT PRESENT", "未涉及");
  const label = DIMENSION_STATUS_LABEL[status];
  return label == null ? status.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * Emphasis class for a status badge.
 *
 * `accent` for a dimension whose language MOVED and `dim` for one that did
 * not — a weight distinction, not a directional one. The reader's eye should
 * land on the dimensions that changed; nothing here says whether the change
 * was hawkish, and no branch returns green or red.
 */
export function dimensionStatusClass(status: string | null | undefined): string {
  return status === "CHANGED" || status === "ADDED" || status === "REMOVED"
    ? "accent"
    : "dim";
}

/* ------------------------------------------------------------------- diff */

/**
 * Colour class per diff status.
 *
 * Green/red HERE mean added/removed TEXT, the universal diff convention, and
 * not good/bad or hawkish/dovish — a sentence being added says nothing about
 * its direction. That is why the amber CHANGED row always renders BOTH texts:
 * the pair is the finding, and the colour is only telling the reader which
 * half is which.
 */
export const DIFF_STATUS_CLASS: Record<string, string> = {
  ADDED: "green",
  REMOVED: "red",
  CHANGED: "amber",
  UNCHANGED: "dim",
};

export const DIFF_STATUS_LABEL: Record<string, { en: string; zh: string }> = {
  ADDED: { en: "ADDED", zh: "新增" },
  REMOVED: { en: "REMOVED", zh: "删除" },
  CHANGED: { en: "CHANGED", zh: "修改" },
  UNCHANGED: { en: "UNCHANGED", zh: "未变" },
};

export function diffStatusText(status: string | null | undefined, t: TFn): string {
  if (status == null || status === "") return t("UNKNOWN", "未知");
  const label = DIFF_STATUS_LABEL[status];
  return label == null ? status.replace(/_/g, " ") : t(label.en, label.zh);
}

export function diffStatusClass(status: string | null | undefined): string {
  if (status == null) return "dim";
  return DIFF_STATUS_CLASS[status] ?? "dim";
}

/** A diff's items as a real array, in the server's document order. */
export function diffItems(diff: FedStatementDiff | null | undefined): FedDiffItem[] {
  const items = diff?.items;
  return Array.isArray(items) ? items : [];
}

/**
 * Items of one status, in document order.
 *
 * Used to collapse the UNCHANGED bulk behind a disclosure: a statement is
 * mostly boilerplate that repeats meeting to meeting, and rendering forty
 * unchanged sentences above the three that moved buries the finding. The
 * unchanged sentences stay REACHABLE — §44's "the source document is
 * authoritative" means the reader can always get to the full text.
 */
export function diffItemsWithStatus(
  diff: FedStatementDiff | null | undefined,
  status: FedDiffStatus,
): FedDiffItem[] {
  return diffItems(diff).filter((item) => item.status === status);
}

/** Items whose status is anything BUT unchanged — the part that moved. */
export function changedDiffItems(
  diff: FedStatementDiff | null | undefined,
): FedDiffItem[] {
  return diffItems(diff).filter((item) => item.status !== "UNCHANGED");
}

/**
 * A count off the server's `counts` block, falling back to counting `items`.
 *
 * The fallback matters because the counts and the items are two views of one
 * diff: a payload carrying items but no counts should still show the header,
 * and a header showing 0 over a list of three ADDED sentences is the kind of
 * quiet contradiction nobody reports.
 *
 * The keys are UPPERCASE — the server builds this block as
 * `counts[item.status]` over the `ADDED`/`REMOVED`/`CHANGED`/`UNCHANGED`
 * status constants (plus `TOTAL`), so it has never sent lowercase keys.
 * Lowercasing the lookup here missed every time and quietly fell through to
 * counting `items`, which agrees only while the payload ships every sentence;
 * the day the server sends counts over a trimmed item list the header would
 * have understated the diff without failing anything.
 */
export function diffCount(
  diff: FedStatementDiff | null | undefined,
  status: FedDiffStatus,
): number {
  const v = diff?.counts?.[status];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return diffItemsWithStatus(diff, status).length;
}

/** The statuses the diff header counts, in the order it shows them. */
export const DIFF_STATUSES: FedDiffStatus[] = [
  "ADDED",
  "REMOVED",
  "CHANGED",
  "UNCHANGED",
];

/**
 * A similarity ratio as a percent, for a CHANGED pair.
 *
 * The server's difflib ratio, printed — never re-derived (§61). Two ratio
 * definitions disagreeing on the same sentence pair produce a number nobody
 * can reconcile against the backend's own diff.
 */
export function fmtSimilarity(v: number | null | undefined): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return `${(v * 100).toFixed(0)}%`;
}

/** Dimension tags on a diff item, as a real array. */
export function itemDimensions(item: FedDiffItem | null | undefined): string[] {
  const dims = item?.dimensions;
  return Array.isArray(dims) ? dims.filter((d) => typeof d === "string") : [];
}

/* ------------------------------------------------------------------- vote */

/**
 * The vote as "9–3", or null when the server parsed no counts.
 *
 * An en dash, matching the Fed's own typography in "by a 9 – 3 vote". Null
 * rather than "0–0" for an unparsed vote: a unanimous vote and an unparsed one
 * are different facts, and only one of them is news.
 */
export function voteTally(vote: FedVote | null | undefined): string | null {
  const forVotes = vote?.for;
  const against = vote?.against;
  if (typeof forVotes !== "number" || !Number.isFinite(forVotes)) return null;
  if (typeof against !== "number" || !Number.isFinite(against)) return null;
  return `${forVotes}–${against}`;
}

/** Dissenter names, verbatim, as a real array. */
export function dissenters(vote: FedVote | null | undefined): string[] {
  const list = vote?.dissenters;
  return Array.isArray(list) ? list.filter((d) => typeof d === "string" && d !== "") : [];
}

/**
 * Whether the committee was unanimous.
 *
 * Trusts the server's explicit flag first and only then infers from a zero
 * against-count, and returns `null` when neither is known — "we did not parse
 * the vote" must not render as "there were no dissents".
 */
export function isUnanimous(vote: FedVote | null | undefined): boolean | null {
  if (typeof vote?.unanimous === "boolean") return vote.unanimous;
  const against = vote?.against;
  if (typeof against === "number" && Number.isFinite(against)) return against === 0;
  return null;
}

/* ----------------------------------------------------------- target range */

/**
 * The target range, PREFERRING THE FED'S OWN WORDING (rule D).
 *
 * "3-1/2 to 3-3/4 percent" is what the statement says; 3.50–3.75% is the
 * platform's parse of it. Showing the text first means a mis-parse is visible
 * rather than laundered into a clean-looking decimal.
 */
export function targetRangeText(range: FedTargetRange | null | undefined): string | null {
  const text = range?.text;
  if (typeof text === "string" && text.trim() !== "") return text;
  const low = range?.low_pct;
  const high = range?.high_pct;
  if (typeof low !== "number" || !Number.isFinite(low)) return null;
  if (typeof high !== "number" || !Number.isFinite(high)) return null;
  return `${low.toFixed(2)}–${high.toFixed(2)}%`;
}

/** The parsed bounds as a compact numeric pair, when both parsed. */
export function targetRangeBounds(
  range: FedTargetRange | null | undefined,
): string | null {
  const low = range?.low_pct;
  const high = range?.high_pct;
  if (typeof low !== "number" || !Number.isFinite(low)) return null;
  if (typeof high !== "number" || !Number.isFinite(high)) return null;
  return `${low.toFixed(2)}–${high.toFixed(2)}%`;
}

/**
 * The policy-rate direction word.
 *
 * "CUT" / "HIKE" / "HOLD" describe what the committee DID to the target range
 * — an arithmetic fact off two numbers, not a stance reading. This is the one
 * directional word on the tab, and it is directional about the RATE, which is
 * the one thing the document states outright.
 */
export const RATE_DIRECTION_LABEL: Record<string, { en: string; zh: string }> = {
  CUT: { en: "CUT", zh: "降息" },
  HIKE: { en: "HIKE", zh: "加息" },
  HOLD: { en: "HOLD", zh: "维持不变" },
};

export function rateDirectionText(
  direction: string | null | undefined,
  t: TFn,
): string | null {
  if (direction == null || direction === "") return null;
  const label = RATE_DIRECTION_LABEL[direction];
  return label == null ? direction.replace(/_/g, " ") : t(label.en, label.zh);
}

/**
 * A basis-point change, signed, at the precision the SOURCE has.
 *
 * A policy-rate change is always a whole multiple of 25 and prints as "-25 bp";
 * a measured yield move is not, and rounding -7.5 to "-8 bp" would report a
 * measurement the platform never took. So the decimal survives when there is
 * one and is never manufactured when there is not — `toFixed(1)` on a rate
 * decision would print "-25.0 bp", which implies a precision the FOMC does not
 * decide at.
 *
 * 0 prints as "0 bp" and stays on screen: a HOLD is a decision, and the number
 * that says the range did not move is a finding rather than an absence.
 */
export function fmtChangeBp(v: number | null | undefined): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const body = Number.isInteger(v) ? v.toFixed(0) : String(v);
  return `${v > 0 ? "+" : ""}${body} bp`;
}

/* --------------------------------------------------------------- reaction */

/**
 * The two §45 windows, with their clock times.
 *
 * The ET times are part of the LABEL rather than derived from the payload:
 * they are the schedule the Fed publishes (14:00 statement, 14:30 press
 * conference), and they tell the reader what each column actually covers. A
 * column headed only "Statement" invites the assumption that it is the whole
 * afternoon.
 */
export const REACTION_WINDOWS = [
  {
    key: "statement" as const,
    en: "Statement",
    zh: "政策声明",
    windowEn: "14:00–14:30 ET",
    windowZh: "美东 14:00–14:30",
  },
  {
    key: "press_conference" as const,
    en: "Press conference",
    zh: "新闻发布会",
    windowEn: "14:30–15:30 ET",
    windowZh: "美东 14:30–15:30",
  },
];

/** One window off the reaction block. Never both at once (rule B). */
export function reactionWindow(
  reaction: FedPreviousReaction | null | undefined,
  key: "statement" | "press_conference",
): FedReactionWindow | null {
  const window = reaction?.[key];
  if (window == null || typeof window !== "object") return null;
  return window as FedReactionWindow;
}

/**
 * The reaction table's row order.
 *
 * Fixed, not payload order: equities, the long-duration proxy, gold and the
 * dollar. A rates reader scans an FOMC reaction in risk → duration → real
 * asset order, and letting a dict decide makes the same table read differently
 * between two meetings.
 */
export const FED_ASSET_ORDER = ["SPY", "QQQ", "TLT", "IEF", "GLD", "UUP"] as const;

/** Symbols present in ONE window, in FED_ASSET_ORDER then any unknown ones. */
export function windowSymbols(
  window: FedReactionWindow | null | undefined,
): string[] {
  if (window == null || typeof window !== "object") return [];
  const present = Object.keys(window).filter((k) => k !== "");
  const known = FED_ASSET_ORDER.filter((s) => present.includes(s));
  const unknown = present
    .filter((s) => !(FED_ASSET_ORDER as readonly string[]).includes(s))
    .sort();
  return [...known, ...unknown];
}

/**
 * Every symbol appearing in EITHER window, for the shared row axis.
 *
 * This is the one function that reads both windows, and it deliberately reads
 * only their KEYS — it unions the symbol list so the two columns line up on
 * the same rows, and touches no return. Merging the numbers is what rule B
 * forbids; sharing a row axis is what makes the two windows comparable at a
 * glance.
 */
export function allReactionSymbols(
  reaction: FedPreviousReaction | null | undefined,
): string[] {
  const merged: Record<string, FedWindowReaction> = {
    ...(reactionWindow(reaction, "statement") ?? {}),
    ...(reactionWindow(reaction, "press_conference") ?? {}),
  };
  return windowSymbols(merged);
}

/** One symbol's return in one window. 0 is a value; absent is null (rule C). */
export function windowReturn(
  window: FedReactionWindow | null | undefined,
  symbol: string,
): number | null {
  const entry = window?.[symbol];
  const v = entry?.return_pct;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * The measurement basis, as a badge label.
 *
 * "1m bars" vs "daily" is not a footnote: a DAILY basis cannot separate the
 * statement from the press conference at all, so the badge is what tells the
 * reader whether the two columns beside it are really two measurements or one
 * number shown twice. `dailyBasis` drives the warning that says so.
 */
export function basisText(basis: string | null | undefined, t: TFn): string {
  if (basis === "1m_bars") return t("1-MINUTE BARS", "1 分钟 K 线");
  if (basis === "daily") return t("DAILY BARS", "日 K 线");
  if (basis == null || basis === "") return t("BASIS UNKNOWN", "计算口径未知");
  return basis.replace(/_/g, " ").toUpperCase();
}

/** True when the windows were NOT measured intraday and cannot be separated. */
export function dailyBasis(basis: string | null | undefined): boolean {
  return basis !== "1m_bars";
}

/* -------------------------------------------------------- market pricing */

/**
 * The §42 market-pricing marker, printed LOUD.
 *
 * Deliberately has no branch that returns a number, exactly like
 * `consensusText` in `macro-format`: the implied probability of a cut is the
 * single most expected figure on a Fed screen, and this function plus the type
 * are the two places that guarantee a fabricated one cannot reach the screen.
 */
export function marketPricingText(
  pricing: { status?: string | null } | null | undefined,
  t: TFn,
): string {
  const status = pricing?.status;
  if (typeof status === "string" && status !== "") return status.replace(/_/g, " ");
  return t("UNAVAILABLE", "不可用");
}

/**
 * The labelled proxy entries, e.g. `2y_yield_change_bp` → "+7 bp".
 *
 * Returned as label/value pairs so the caller renders them under an explicit
 * "proxy" heading. The key names the MEASUREMENT ("2Y yield change"), never
 * the thing it stands in for ("probability of a cut") — a proxy that borrows
 * the name of the unavailable number is worse than no proxy at all.
 */
export const PROXY_LABEL: Record<string, { en: string; zh: string }> = {
  "2y_yield_change_bp": { en: "2Y yield change", zh: "2 年期收益率变动" },
  "10y_yield_change_bp": { en: "10Y yield change", zh: "10 年期收益率变动" },
};

export function proxyEntries(
  pricing: { proxy?: Record<string, number | null> | null } | null | undefined,
  t: TFn,
): { key: string; label: string; text: string | null; value: number | null }[] {
  const proxy = pricing?.proxy;
  if (proxy == null || typeof proxy !== "object") return [];
  return Object.keys(proxy)
    .filter((k) => k !== "")
    .sort()
    .map((key) => {
      const raw = proxy[key];
      const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
      const label = PROXY_LABEL[key];
      return {
        key,
        label: label == null ? key.replace(/_/g, " ") : t(label.en, label.zh),
        text: fmtChangeBp(value),
        value,
      };
    });
}

/* ------------------------------------------------------------- formatters */

/** ISO instant → "YYYY-MM-DD HH:MM" UTC. Null in, null out (rule C). */
export function stampMinute(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Date only. */
export function stampDay(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** A FRACTION as a signed percent — the unit the reaction windows use. */
export function fmtReturnPct(
  v: number | null | undefined,
  digits = 2,
): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const pct = v * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

/** A price level, for the pre/post closes behind a window return. */
export function fmtPrice(v: number | null | undefined, digits = 2): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v.toFixed(digits);
}

/**
 * Sign colour for a RETURN.
 *
 * Matching `macro-format`'s `signColor` so a positive move is the same colour
 * on every tab. Note this is applied ONLY to market returns, never to a
 * dimension or a diff row: colouring "FORWARD_GUIDANCE changed" green or red
 * would be the hawk/dove score §43 forbids, drawn instead of written.
 */
export function signColor(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v === 0) return "var(--text-dim)";
  return v < 0 ? "var(--red)" : "var(--green)";
}

/* ------------------------------------------------------------------ reads */

/** Speeches as a real array, in the server's order. */
export function speeches(packet: EventFedPayload["packet"]): NonNullable<
  NonNullable<EventFedPayload["packet"]>["subsequent_speeches"]
> {
  const list = packet?.subsequent_speeches;
  return Array.isArray(list) ? list : [];
}

/** Minutes key paragraphs as a real array. */
export function minutesParagraphs(
  packet: EventFedPayload["packet"],
): string[] {
  const list = packet?.previous_minutes?.key_paragraphs;
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}

/**
 * The data panel's populated slots, in a fixed order.
 *
 * Pass-through values from the Phase G store: this file does not know their
 * shape and does not pretend to, so a non-string value is JSON-stringified
 * rather than dropped. An unrenderable print is still a print the packet saw.
 */
export const DATA_SLOTS = [
  { key: "inflation", en: "Inflation", zh: "通胀" },
  { key: "labor", en: "Labor", zh: "就业" },
  { key: "growth", en: "Growth", zh: "经济增长" },
];

export function dataSlotText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value === "" ? null : value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return String(value);
  try {
    const text = JSON.stringify(value);
    return text === "{}" || text === "[]" ? null : (text ?? null);
  } catch {
    return String(value);
  }
}

/**
 * Coverage notes as a flat list of strings.
 *
 * Accepts the several shapes a coverage block legitimately arrives in, exactly
 * as `macro-format.coverageNotes` does — U3 owns that field and it grows.
 * Anything unrecognised is stringified rather than dropped: an unrenderable
 * caveat is still a caveat.
 */
export function coverageNotes(coverage: unknown): string[] {
  if (coverage == null) return [];
  if (typeof coverage === "string") return coverage === "" ? [] : [coverage];
  if (Array.isArray(coverage)) {
    return coverage.map((n) => (typeof n === "string" ? n : JSON.stringify(n)));
  }
  if (typeof coverage !== "object") return [String(coverage)];

  const record = coverage as Record<string, unknown>;
  const out: string[] = [];
  const notes = record.notes;
  if (Array.isArray(notes)) {
    for (const n of notes) out.push(typeof n === "string" ? n : JSON.stringify(n));
  }
  const reason = record.reason;
  if (typeof reason === "string" && reason !== "") out.push(reason);
  return out;
}

/** The §42/§44 disclaimer lines, verbatim, as a real array. */
export function disclaimers(data: EventFedPayload | null | undefined): string[] {
  const list = data?.disclaimers;
  return Array.isArray(list) ? list.filter((d) => typeof d === "string" && d !== "") : [];
}

/** Whether the payload carries anything worth drawing at all. */
export function hasPacket(data: EventFedPayload | null | undefined): boolean {
  const packet = data?.packet;
  if (packet == null || typeof packet !== "object") return false;
  return (
    packet.previous_statement != null ||
    diffItems(packet.statement_diff).length > 0 ||
    orderedDimensions(packet.dimensions).length > 0 ||
    packet.previous_minutes != null ||
    speeches(packet).length > 0
  );
}

/** Paragraphs of the previous statement, verbatim, as a real array. */
export function statementParagraphs(
  packet: EventFedPayload["packet"],
): string[] {
  const list = packet?.previous_statement?.paragraphs;
  return Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
}

/* --------------------------------------------------------------- backfill */

/**
 * What a backfill actually stored, read from the shape the server sends.
 *
 * The gateway reports its totals NESTED, as `counts: {documents, bars}` — it
 * has never sent top-level `stored_documents` / `stored_bars`. Reading the
 * wrong key with a `?? 0` fallback is silent in the worst way: a backfill that
 * stored four statements and 780 minute bars reports "nothing was stored",
 * because an absent key and a genuine zero become the same number.
 *
 * So this returns `null` for "the server did not tell me" (rule C) and keeps
 * zero as the real finding it is. The caller distinguishes them: `null` means
 * the response shape was unreadable and must not be narrated as an outcome,
 * `0` means the server ran and stored nothing, which deserves its reason.
 */
export function backfillCounts(
  result: EventFedBackfillResult | null | undefined,
): { documents: number; bars: number; total: number } | null {
  const counts = result?.counts;
  if (counts == null || typeof counts !== "object") return null;
  const documents = Number(counts.documents ?? 0);
  const bars = Number(counts.bars ?? 0);
  if (!Number.isFinite(documents) || !Number.isFinite(bars)) return null;
  return { documents, bars, total: documents + bars };
}
