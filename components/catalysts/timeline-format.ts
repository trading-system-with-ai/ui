"use client";

/**
 * Display vocabulary for the §57 timeline.
 *
 * Same contract as `event-format.ts`: every table here is 1:1 over a closed
 * server enum with the RAW TOKEN as its fallback, and no function derives a
 * fact. Three rules are specific to this file:
 *
 *  A. NOTHING IS SORTED OR COUNTED HERE THAT THE SERVER ALREADY DID. The
 *     payload arrives sorted and pre-counted (§61 — the UI never computes
 *     analytics the backend computes). `sortItems` exists only so a payload
 *     that arrives out of order still renders in time order; it never
 *     re-scores, re-buckets or re-clusters anything.
 *  B. A NULL IS A NULL. Every formatter returns `null` for an absent value
 *     rather than a dash, so the CALLER decides whether the gap is worth a
 *     row at all. A formatter that returned "—" would put a dash on screen
 *     for a field the server never claimed to have.
 *  C. AN UNKNOWN KIND STILL RENDERS. `kindLabel` falls through to the raw
 *     token: the server may add a fifth kind before this file knows it, and
 *     an item silently dropped from a timeline is a hole the reader cannot
 *     see.
 */
import type { TFn } from "./event-format";
import type {
  EventTimelinePayload,
  TimelineAnchor,
  TimelineItem,
  TimelineKind,
} from "@/lib/types-timeline";
import { TIMELINE_KINDS } from "@/lib/types-timeline";

export { TIMELINE_KINDS };
export type { TimelineKind };

/* ------------------------------------------------------------------ kinds */

/** Bilingual name per kind, in the plural the filter row uses. */
export const KIND_LABEL: Record<string, { en: string; zh: string }> = {
  NEWS: { en: "News", zh: "新闻" },
  FILING: { en: "Filings", zh: "财务申报" },
  EVENT: { en: "Events", zh: "事件" },
  ANALYSIS: { en: "Analyses", zh: "分析" },
};

/**
 * A single glyph per kind.
 *
 * Text glyphs, not colour: the timeline is a record of what happened, and a
 * red icon on a LEGAL news row would turn a category into a verdict. All four
 * wear the same neutral chip, and the glyph is only there so a reader
 * skimming the rail can tell a filing from a headline without reading.
 */
export const KIND_GLYPH: Record<string, string> = {
  NEWS: "▪",
  FILING: "▤",
  EVENT: "◆",
  ANALYSIS: "✦",
};

export function kindLabel(kind: string | null | undefined, t: TFn): string {
  if (kind == null || kind === "") return t("Item", "条目");
  const label = KIND_LABEL[kind];
  return label == null ? kind.replace(/_/g, " ") : t(label.en, label.zh);
}

export function kindGlyph(kind: string | null | undefined): string {
  if (kind == null) return "·";
  return KIND_GLYPH[kind] ?? "·";
}

/* -------------------------------------------------------------- categories */

/**
 * §24 materiality categories.
 *
 * Duplicated from NewsTab's private table rather than imported, because that
 * one is a module-private const inside a "use client" component: exporting it
 * would widen NewsTab's surface for a second consumer. The fallback is the raw
 * token in both places, so a category this table has not learned yet still
 * renders as itself.
 */
export const CATEGORY_LABEL: Record<string, { en: string; zh: string }> = {
  EARNINGS: { en: "EARNINGS", zh: "财报" },
  GUIDANCE: { en: "GUIDANCE", zh: "业绩指引" },
  PRODUCT: { en: "PRODUCT", zh: "产品" },
  CUSTOMER: { en: "CUSTOMER", zh: "客户" },
  CONTRACT: { en: "CONTRACT", zh: "合同" },
  REGULATION: { en: "REGULATION", zh: "监管" },
  LEGAL: { en: "LEGAL", zh: "法律诉讼" },
  MANAGEMENT: { en: "MANAGEMENT", zh: "管理层" },
  "M&A": { en: "M&A", zh: "并购" },
  CAPITAL_ALLOCATION: { en: "CAPITAL ALLOCATION", zh: "资本配置" },
  SUPPLY_CHAIN: { en: "SUPPLY CHAIN", zh: "供应链" },
  COMPETITION: { en: "COMPETITION", zh: "竞争" },
  ANALYST_REVISION: { en: "ANALYST REVISION", zh: "分析师调整" },
  MACRO_EXPOSURE: { en: "MACRO EXPOSURE", zh: "宏观敞口" },
  INDUSTRY: { en: "INDUSTRY", zh: "行业" },
  OTHER: { en: "OTHER", zh: "其他" },
};

export function categoryText(category: string | null | undefined, t: TFn): string {
  if (category == null || category === "") return t("uncategorised", "未分类");
  const label = CATEGORY_LABEL[category];
  return label == null ? category.replace(/_/g, " ") : t(label.en, label.zh);
}

/* -------------------------------------------------------------- formatters */

/** The `at` instant as an ISO minute stamp. Null in, null out (rule B). */
export function stampMinute(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** Date only (YYYY-MM-DD), for the day headers and the anchors. */
export function stampDay(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * A 0-1 news score, two decimals.
 *
 * Never rendered for a missing value: a cluster the server did not score is
 * not a cluster that scored zero, and 0.00 beside a headline is a claim.
 */
export function fmtScore(v: number | null | undefined, digits = 2): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v.toFixed(digits);
}

/**
 * An http(s) URL, or null.
 *
 * Anything else — `javascript:`, `data:`, a relative path, a malformed string
 * — comes back null and the caller renders plain text. The titles on this
 * timeline are attacker-influenced (they came from a news feed), so the link
 * scheme is checked here rather than trusted from the payload.
 */
export function safeUrl(url: unknown): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ reads */

/** Items as a real array, whatever the payload did or did not carry. */
export function timelineItems(
  payload: EventTimelinePayload | null | undefined,
): TimelineItem[] {
  const items = payload?.items;
  return Array.isArray(items) ? items : [];
}

/**
 * Chronological order, ascending, stable.
 *
 * The server already sorts; this only guarantees the render is not at the
 * mercy of a serializer change. An item with no parseable `at` sinks to the
 * END rather than being dropped — it happened, the platform just does not
 * know when, and dropping it would silently shrink the record.
 */
export function sortItems(items: TimelineItem[]): TimelineItem[] {
  return items
    .map((item, i) => ({ item, i, ms: parseMs(item.at) }))
    .sort((a, b) => {
      if (a.ms == null && b.ms == null) return a.i - b.i;
      if (a.ms == null) return 1;
      if (b.ms == null) return -1;
      return a.ms === b.ms ? a.i - b.i : a.ms - b.ms;
    })
    .map((row) => row.item);
}

function parseMs(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The distinct news categories present, in the order the server's own
 * `counts.by_category` lists them, falling back to first-seen order over the
 * items. Used to build the category filter row — a filter for a category with
 * nothing behind it would be a dead control.
 */
export function presentCategories(
  payload: EventTimelinePayload | null | undefined,
): string[] {
  const byCategory = payload?.counts?.by_category;
  if (byCategory != null && typeof byCategory === "object") {
    const keys = Object.keys(byCategory).filter((k) => k !== "");
    if (keys.length > 0) return keys;
  }
  const seen: string[] = [];
  for (const item of timelineItems(payload)) {
    const category = item.category;
    if (typeof category === "string" && category !== "" && !seen.includes(category)) {
      seen.push(category);
    }
  }
  return seen;
}

/** The distinct kinds present, in TIMELINE_KINDS order then any unknown ones. */
export function presentKinds(
  payload: EventTimelinePayload | null | undefined,
): string[] {
  const present = new Set<string>();
  for (const item of timelineItems(payload)) {
    if (typeof item.kind === "string" && item.kind !== "") present.add(item.kind);
  }
  const byKind = payload?.counts?.by_kind;
  if (byKind != null && typeof byKind === "object") {
    for (const key of Object.keys(byKind)) if (key !== "") present.add(key);
  }
  const known = TIMELINE_KINDS.filter((k) => present.has(k));
  const unknown = [...present].filter((k) => !TIMELINE_KINDS.includes(k as TimelineKind));
  return [...known, ...unknown.sort()];
}

/** One count out of a counts block. 0 is a finding; absent is null. */
export function countFor(
  counts: Record<string, number> | null | undefined,
  key: string,
): number | null {
  if (counts == null || typeof counts !== "object") return null;
  const v = counts[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** An anchor with anything in it at all — an empty object is not an anchor. */
export function anchorPresent(anchor: TimelineAnchor | null | undefined): boolean {
  if (anchor == null || typeof anchor !== "object") return false;
  return (
    anchor.event_id != null ||
    (typeof anchor.event_key === "string" && anchor.event_key !== "") ||
    (typeof anchor.date_et === "string" && anchor.date_et !== "") ||
    (typeof anchor.scheduled_at_utc === "string" && anchor.scheduled_at_utc !== "")
  );
}

/** The anchor's date, preferring the ET calendar date the server computed. */
export function anchorDate(anchor: TimelineAnchor | null | undefined): string | null {
  if (anchor == null) return null;
  if (typeof anchor.date_et === "string" && anchor.date_et !== "") return anchor.date_et;
  return stampDay(anchor.scheduled_at_utc);
}

/**
 * Filter to the selected kinds and categories.
 *
 * An empty selection means NO FILTER, not "nothing" — a filter row where
 * deselecting everything blanks the page teaches the user not to touch it.
 * The category filter applies ONLY to rows that carry a category (news): a
 * filing has no materiality category, and hiding filings because the reader
 * narrowed to GUIDANCE would silently rewrite the record.
 */
export function filterItems(
  items: TimelineItem[],
  kinds: string[],
  categories: string[],
): TimelineItem[] {
  return items.filter((item) => {
    if (kinds.length > 0) {
      const kind = typeof item.kind === "string" ? item.kind : "";
      if (!kinds.includes(kind)) return false;
    }
    if (categories.length > 0) {
      const category = typeof item.category === "string" ? item.category : null;
      if (category != null && !categories.includes(category)) return false;
    }
    return true;
  });
}

/**
 * A stable React key for a row.
 *
 * Evidence ids and cluster ids are the server's own identity for news; the
 * index is the last resort so two identically-titled headlines at the same
 * instant still render as two rows.
 */
export function itemKey(item: TimelineItem, index: number): string {
  const parts = [
    typeof item.kind === "string" ? item.kind : "?",
    typeof item.evidence_id === "string" ? item.evidence_id : "",
    typeof item.cluster_id === "string" ? item.cluster_id : "",
    item.id != null ? String(item.id) : "",
    typeof item.at === "string" ? item.at : "",
  ].filter((p) => p !== "");
  return `${parts.join("|")}#${index}`;
}
