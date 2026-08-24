"use client";

/**
 * Shared display vocabulary for the Catalysts surfaces (§7, §11, §12, §54).
 *
 * Everything here is a TOTAL 1:1 table over a closed backend enum, in the
 * i18n-labels.ts spirit: the display never invents a state the server did
 * not send, and an unrecognised token falls back to the raw string rather
 * than to a guess. No formatter here derives a date, a status or a score —
 * they only render what the payload carries.
 */
import type {
  EventLifecycle,
  EventRow,
  EventSession,
  EventStatus,
  EventType,
  RelevanceTier,
} from "@/lib/types";

/** Translator signature (from useT), for helpers called outside a component. */
export type TFn = (en: string, zh: string) => string;

/** Bilingual string pair resolved at render via useT(). */
export interface L {
  en: string;
  zh: string;
}

/* ---------------------------------------------------------------- status */

/**
 * §7 status badges. ESTIMATED is AMBER on purpose and never green: the date
 * is derived, and the whole point of the status is that a derived date must
 * not read as a scheduled fact.
 */
export const STATUS_BADGE: Record<EventStatus, string> = {
  CONFIRMED: "green",
  ESTIMATED: "amber",
  REVISED: "accent",
  CANCELED: "dim",
};

export const STATUS_LABEL: Record<EventStatus, L> = {
  CONFIRMED: { en: "CONFIRMED", zh: "已确认" },
  ESTIMATED: { en: "ESTIMATED", zh: "估算" },
  REVISED: { en: "REVISED", zh: "已改期" },
  CANCELED: { en: "CANCELED", zh: "已取消" },
};

/* ---------------------------------------------------------------- session */

export const SESSION_LABEL: Record<EventSession, L> = {
  BEFORE_MARKET: { en: "Before market", zh: "盘前" },
  DURING_MARKET: { en: "During market", zh: "盘中" },
  AFTER_MARKET: { en: "After market", zh: "盘后" },
  UNKNOWN: { en: "Time unknown", zh: "时间未知" },
};

/** The compact card form — "BMO" / "AMC" is the trader's shorthand. */
export const SESSION_SHORT: Record<EventSession, L> = {
  BEFORE_MARKET: { en: "BMO", zh: "盘前" },
  DURING_MARKET: { en: "DURING", zh: "盘中" },
  AFTER_MARKET: { en: "AMC", zh: "盘后" },
  UNKNOWN: { en: "TIME UNKNOWN", zh: "时间未知" },
};

/* ---------------------------------------------------------------- type */

export const EVENT_TYPE_LABEL: Record<EventType, L> = {
  EARNINGS: { en: "Earnings", zh: "财报" },
  CPI: { en: "CPI", zh: "CPI 消费者物价" },
  PPI: { en: "PPI", zh: "PPI 生产者物价" },
  PCE: { en: "PCE", zh: "PCE 物价指数" },
  GDP: { en: "GDP", zh: "GDP 国内生产总值" },
  EMPLOYMENT_REPORT: { en: "Employment report", zh: "非农就业报告" },
  JOLTS: { en: "JOLTS", zh: "JOLTS 职位空缺" },
  RETAIL_SALES: { en: "Retail sales", zh: "零售销售" },
  ISM: { en: "ISM", zh: "ISM 采购经理指数" },
  CONSUMER_SENTIMENT: { en: "Consumer sentiment", zh: "消费者信心" },
  FOMC_MEETING: { en: "FOMC meeting", zh: "FOMC 会议" },
  FOMC_DECISION: { en: "FOMC decision", zh: "FOMC 利率决议" },
  FOMC_PRESS_CONFERENCE: { en: "FOMC press conference", zh: "FOMC 新闻发布会" },
  FOMC_MINUTES: { en: "FOMC minutes", zh: "FOMC 会议纪要" },
  FED_SPEECH: { en: "Fed speech", zh: "美联储讲话" },
  FED_BOARD_EVENT: { en: "Fed board event", zh: "美联储理事会活动" },
  CORPORATE_EVENT: { en: "Corporate event", zh: "公司事件" },
  MARKET_HOLIDAY: { en: "Market holiday", zh: "休市日" },
};

/* ---------------------------------------------------------------- relevance */

/** §12 ladder order — the page renders its groups in exactly this sequence. */
export const RELEVANCE_ORDER: RelevanceTier[] = [
  "POSITION",
  "TRADING_POOL",
  "WATCHLIST",
  "MARKET_WIDE",
  "OTHER",
];

export const RELEVANCE_LABEL: Record<RelevanceTier, L> = {
  POSITION: { en: "Positions", zh: "持仓" },
  TRADING_POOL: { en: "Trading Pool", zh: "交易池" },
  WATCHLIST: { en: "Watchlist", zh: "自选列表" },
  MARKET_WIDE: { en: "Market-wide", zh: "全市场" },
  OTHER: { en: "Other", zh: "其他" },
};

/** Why each group exists, so the ordering is explained rather than asserted. */
export const RELEVANCE_MEANING: Record<RelevanceTier, L> = {
  POSITION: {
    en: "You hold this name — the event lands directly on open risk.",
    zh: "你持有该标的 — 事件将直接作用于未平仓风险。",
  },
  TRADING_POOL: {
    en: "Authorized for trading, so the event can affect a position you may open.",
    zh: "已授权交易,事件可能影响你即将开立的仓位。",
  },
  WATCHLIST: {
    en: "On the watchlist — research relevance, no exposure today.",
    zh: "在自选列表中 — 具研究价值,当前无敞口。",
  },
  MARKET_WIDE: {
    en: "Macro and Fed events: no single ticker, but they move the whole book.",
    zh: "宏观与美联储事件:不对应单一标的,却影响整个组合。",
  },
  OTHER: {
    en: "Ingested but not linked to your positions, pool or watchlist.",
    zh: "已采集,但与你的持仓、交易池或自选列表无关联。",
  },
};

export const RELEVANCE_BADGE: Record<RelevanceTier, string> = {
  POSITION: "accent",
  TRADING_POOL: "green",
  WATCHLIST: "dim",
  MARKET_WIDE: "amber",
  OTHER: "dim",
};

/* ---------------------------------------------------------------- lifecycle */

export const LIFECYCLE_LABEL: Record<EventLifecycle, L> = {
  SCHEDULED: { en: "Scheduled", zh: "已排定" },
  PRE_EVENT: { en: "Pre-event", zh: "事件前" },
  LIVE: { en: "Live", zh: "进行中" },
  POST_EVENT: { en: "Post-event", zh: "事件后" },
  ARCHIVED: { en: "Archived", zh: "已归档" },
};

/* ---------------------------------------------------------------- importance */

/**
 * Bilingual names for the §13 importance components the backend emits. The
 * arithmetic is always shown; this only labels the addends, and an unmapped
 * key renders its raw token (never dropped — a hidden component would break
 * the "components must be identifiable" contract).
 */
const IMPORTANCE_COMPONENT_ZH: Record<string, string> = {
  event_type_base: "事件类型基准分",
  base: "基准分",
  relevance: "相关性加分",
  relevance_bonus: "相关性加分",
  speaker: "讲话人加分",
  speaker_seniority: "讲话人级别加分",
};

export function importanceComponentLabel(key: string, lang: string): string {
  if (lang !== "zh") return key.replace(/_/g, " ");
  return IMPORTANCE_COMPONENT_ZH[key] ?? key.replace(/_/g, " ");
}

/* ---------------------------------------------------------------- formatters */

/**
 * "T-2d" / "T-4h" / "T+1d" — the countdown from `days_to_event`.
 *
 * Sub-day distances switch to hours because "T-0d" tells a user nothing on
 * the morning of a release. Past events read "T+" rather than a negative
 * "T-", which would be ambiguous.
 */
export function formatTMinus(daysToEvent: number, t: TFn): string {
  const past = daysToEvent < 0;
  const abs = Math.abs(daysToEvent);
  const sign = past ? "+" : "-";
  if (abs < 1 / 24) {
    const mins = Math.round(abs * 24 * 60);
    return t(`T${sign}${mins}m`, `T${sign}${mins} 分钟`);
  }
  if (abs < 1) {
    const hours = Math.round(abs * 24);
    return t(`T${sign}${hours}h`, `T${sign}${hours} 小时`);
  }
  const days = Math.floor(abs);
  return t(`T${sign}${days}d`, `T${sign}${days} 天`);
}

/**
 * Render the event's OWN local wall clock — the string the payload already
 * carries (`scheduled_at_local`, ISO with offset).
 *
 * Parsed and re-formatted in UTC deliberately: `new Date(iso)` normalises to
 * the VIEWER's browser zone, which would silently relabel an 08:30 ET CPI
 * release as 05:30 for a user in California. Reading the offset-bearing
 * string's own fields back in UTC keeps the exchange-time assertion intact
 * on every machine.
 */
export function formatLocalDateTime(
  isoWithOffset: string,
  lang: string,
  opts?: { withYear?: boolean },
): string {
  const parsed = parseOffsetIso(isoWithOffset);
  if (parsed == null) return isoWithOffset;
  return parsed.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: opts?.withYear ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hour12: lang !== "zh",
  });
}

/** Date only, in the event's own zone (same UTC-shift trick as above). */
export function formatLocalDate(isoWithOffset: string, lang: string): string {
  const parsed = parseOffsetIso(isoWithOffset);
  if (parsed == null) return isoWithOffset;
  return parsed.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Shift an offset-bearing ISO string so its LOCAL wall-clock fields land in
 * UTC, letting toLocaleString({timeZone:"UTC"}) print the event's own time
 * regardless of where the browser is. Returns null on an unparseable string
 * so callers can fall back to the raw value instead of showing "Invalid Date".
 */
function parseOffsetIso(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso);
  if (match == null) return null;
  const [, y, mo, d, h, mi, s] = match;
  const ms = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s ?? "0"),
  );
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** A UTC instant rendered as UTC — used where both stamps are shown side by side. */
export function formatUtc(iso: string | null, lang: string): string {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Short zone label for the "(ET)" suffix — the tz string's last segment. */
export function zoneAbbrev(timezone: string): string {
  const parts = timezone.split("/");
  return parts[parts.length - 1]?.replace(/_/g, " ") ?? timezone;
}

/** USD, matching the platform's existing money formatting. */
export function fmtMoney(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/** The card's headline chip: the ticker when there is one, else the type. */
export function eventChip(event: EventRow, lang: string): string {
  if (event.ticker) return event.ticker;
  const label = EVENT_TYPE_LABEL[event.event_type];
  if (label == null) return event.event_type.replace(/_/g, " ");
  return lang === "zh" ? label.zh : label.en;
}

/** Group events into the §12 ladder, preserving the server's sort within each. */
export function groupByRelevance(events: EventRow[]): Map<RelevanceTier, EventRow[]> {
  const groups = new Map<RelevanceTier, EventRow[]>();
  for (const tier of RELEVANCE_ORDER) groups.set(tier, []);
  for (const event of events) {
    // An unrecognised tier lands in OTHER rather than disappearing: an event
    // the platform ingested must always be visible somewhere on the page.
    const bucket = groups.get(event.relevance_tier) ?? groups.get("OTHER");
    bucket?.push(event);
  }
  return groups;
}
