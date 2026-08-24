/**
 * Formatter + label-table tests for the Catalysts surfaces.
 *
 * The load-bearing property here is TIMEZONE HONESTY: `scheduled_at_local`
 * carries the event's own wall clock with an offset, and the UI must render
 * that clock verbatim on every machine. A naive `new Date(iso)` would
 * re-express it in the viewer's browser zone and quietly turn an 08:30 ET
 * CPI release into 05:30 for a user in California — the exact class of bug
 * §10 exists to prevent. These tests pin that, plus the total-ness of every
 * enum table (a missing key must fall back, never render "undefined").
 */
import { describe, expect, it } from "vitest";
import type { EventRow, EventStatus, EventType, RelevanceTier } from "@/lib/types";
import {
  EVENT_TYPE_LABEL,
  RELEVANCE_BADGE,
  RELEVANCE_LABEL,
  RELEVANCE_MEANING,
  RELEVANCE_ORDER,
  SESSION_LABEL,
  SESSION_SHORT,
  STATUS_BADGE,
  STATUS_LABEL,
  formatLocalDate,
  formatLocalDateTime,
  formatTMinus,
  formatUtc,
  groupByRelevance,
  importanceComponentLabel,
  zoneAbbrev,
} from "./event-format";

const en = (a: string) => a;
const t = (a: string, _b: string) => a;

function makeEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    event_id: 1,
    event_key: "EARNINGS:NVDA:2026-08-27",
    event_type: "EARNINGS",
    title: "NVDA earnings",
    ticker: "NVDA",
    company_id: null,
    scheduled_at_utc: "2026-08-27T20:05:00+00:00",
    scheduled_at_local: "2026-08-27T16:05:00-04:00",
    event_timezone: "America/New_York",
    session: "AFTER_MARKET",
    status: "CONFIRMED",
    is_estimated: false,
    source: "COMPANY_IR_SEC",
    source_name: "sec_edgar",
    source_url: null,
    source_event_id: null,
    last_verified_at: null,
    previous_event_id: null,
    comparison_reason: null,
    days_to_event: 2.4,
    lifecycle: "PRE_EVENT",
    relevance_tier: "POSITION",
    importance: 90,
    importance_stored: 90,
    importance_components: { event_type_base: 60, relevance: 30 },
    importance_raw_total: 90,
    importance_was_clamped: false,
    importance_model_version: "v1",
    series_id: null,
    agency: null,
    release_period: null,
    fiscal_quarter: null,
    fiscal_year: null,
    speaker: null,
    topic: null,
    revision_history: [],
    exposure: null,
    ...overrides,
  };
}

describe("formatLocalDateTime — the event's own wall clock, not the viewer's", () => {
  it("renders the ET hour from an ET-offset string regardless of browser zone", () => {
    // 16:05 ET. A naive new Date(iso) would print this in the test runner's
    // local zone; the event asserts 16:05 and 16:05 is what must show.
    const out = formatLocalDateTime("2026-08-27T16:05:00-04:00", "en");
    expect(out).toContain("4:05");
    expect(out).toContain("PM");
    expect(out).toContain("Aug");
    expect(out).toContain("27");
  });

  it("a before-market ET release stays before-market (08:30, not shifted)", () => {
    const out = formatLocalDateTime("2026-09-10T08:30:00-04:00", "en");
    expect(out).toContain("8:30");
    expect(out).toContain("AM");
  });

  it("a WINTER (EST, -05:00) instant renders its own clock too", () => {
    // Same wall clock, different offset — DST must not move the display.
    const out = formatLocalDateTime("2026-01-14T08:30:00-05:00", "en");
    expect(out).toContain("8:30");
    expect(out).toContain("AM");
    expect(out).toContain("Jan");
  });

  it("withYear adds the year; the default form omits it", () => {
    expect(formatLocalDateTime("2026-08-27T16:05:00-04:00", "en", { withYear: true })).toContain(
      "2026",
    );
    expect(formatLocalDateTime("2026-08-27T16:05:00-04:00", "en")).not.toContain("2026");
  });

  it("zh renders a 24-hour clock (no AM/PM)", () => {
    const out = formatLocalDateTime("2026-08-27T16:05:00-04:00", "zh");
    expect(out).toContain("16:05");
    expect(out).not.toContain("PM");
  });

  it("an unparseable string falls back to the raw value, never 'Invalid Date'", () => {
    expect(formatLocalDateTime("not-a-date", "en")).toBe("not-a-date");
    expect(formatLocalDate("", "en")).toBe("");
  });

  it("formatLocalDate keeps the event's own calendar day", () => {
    // 23:30 ET is still Aug 27 locally even though it is Aug 28 in UTC.
    const out = formatLocalDate("2026-08-27T23:30:00-04:00", "en");
    expect(out).toContain("27");
    expect(out).not.toContain("28");
  });
});

describe("formatUtc — the instant, rendered as UTC", () => {
  it("prints the UTC hour, not the runner's local hour", () => {
    expect(formatUtc("2026-08-27T20:05:00+00:00", "en")).toContain("20:05");
  });

  it("null renders the em dash placeholder, never a fabricated time", () => {
    expect(formatUtc(null, "en")).toBe("—");
    expect(formatUtc("", "en")).toBe("—");
  });

  it("an unparseable stamp falls back to the raw string", () => {
    expect(formatUtc("garbage", "en")).toBe("garbage");
  });
});

describe("formatTMinus", () => {
  it("future days count down with T-", () => {
    expect(formatTMinus(2.4, t)).toBe("T-2d");
    expect(formatTMinus(7.0, t)).toBe("T-7d");
  });

  it("past events read T+, never a negative T-", () => {
    expect(formatTMinus(-3.2, t)).toBe("T+3d");
  });

  it("sub-day distances switch to hours — 'T-0d' would say nothing", () => {
    expect(formatTMinus(0.25, t)).toBe("T-6h");
    expect(formatTMinus(-0.5, t)).toBe("T+12h");
  });

  it("sub-hour distances switch to minutes", () => {
    expect(formatTMinus(10 / (24 * 60), t)).toBe("T-10m");
  });

  it("zh renders its own units", () => {
    const zh = (_a: string, b: string) => b;
    expect(formatTMinus(2.4, zh)).toBe("T-2 天");
    expect(formatTMinus(0.25, zh)).toBe("T-6 小时");
  });
});

describe("label tables are TOTAL over the backend enums", () => {
  const STATUSES: EventStatus[] = ["ESTIMATED", "CONFIRMED", "REVISED", "CANCELED"];
  const TYPES: EventType[] = [
    "EARNINGS",
    "CPI",
    "PPI",
    "PCE",
    "GDP",
    "EMPLOYMENT_REPORT",
    "JOLTS",
    "RETAIL_SALES",
    "ISM",
    "CONSUMER_SENTIMENT",
    "FOMC_MEETING",
    "FOMC_DECISION",
    "FOMC_PRESS_CONFERENCE",
    "FOMC_MINUTES",
    "FED_SPEECH",
    "FED_BOARD_EVENT",
    "CORPORATE_EVENT",
    "MARKET_HOLIDAY",
  ];

  it("every EventType has a bilingual label", () => {
    for (const type of TYPES) {
      expect(EVENT_TYPE_LABEL[type]?.en, type).toBeTruthy();
      expect(EVENT_TYPE_LABEL[type]?.zh, type).toBeTruthy();
    }
  });

  it("every EventStatus has a bilingual label and a badge class", () => {
    for (const status of STATUSES) {
      expect(STATUS_LABEL[status]?.zh, status).toBeTruthy();
      expect(STATUS_BADGE[status], status).toBeTruthy();
    }
  });

  it("ESTIMATED is amber and CONFIRMED is green — a derived date never reads as a fact", () => {
    expect(STATUS_BADGE.ESTIMATED).toBe("amber");
    expect(STATUS_BADGE.CONFIRMED).toBe("green");
    expect(STATUS_BADGE.ESTIMATED).not.toBe(STATUS_BADGE.CONFIRMED);
  });

  it("every session has both a long and a short bilingual label", () => {
    for (const session of ["BEFORE_MARKET", "DURING_MARKET", "AFTER_MARKET", "UNKNOWN"] as const) {
      expect(SESSION_LABEL[session]?.zh, session).toBeTruthy();
      expect(SESSION_SHORT[session]?.zh, session).toBeTruthy();
    }
  });

  it("UNKNOWN session says the time is unknown rather than implying a default", () => {
    expect(SESSION_LABEL.UNKNOWN.en.toLowerCase()).toContain("unknown");
    expect(SESSION_SHORT.UNKNOWN.en.toLowerCase()).toContain("unknown");
  });

  it("every relevance tier has a label, a meaning and a badge", () => {
    for (const tier of RELEVANCE_ORDER) {
      expect(RELEVANCE_LABEL[tier]?.zh, tier).toBeTruthy();
      expect(RELEVANCE_MEANING[tier]?.zh, tier).toBeTruthy();
      expect(RELEVANCE_BADGE[tier], tier).toBeTruthy();
    }
  });

  it("RELEVANCE_ORDER is the §12 ladder, in order", () => {
    expect(RELEVANCE_ORDER).toEqual([
      "POSITION",
      "TRADING_POOL",
      "WATCHLIST",
      "MARKET_WIDE",
      "OTHER",
    ]);
  });
});

describe("importanceComponentLabel", () => {
  it("en humanises the raw key", () => {
    expect(importanceComponentLabel("event_type_base", "en")).toBe("event type base");
  });

  it("zh translates known keys", () => {
    expect(importanceComponentLabel("event_type_base", "zh")).toBe("事件类型基准分");
  });

  it("an UNKNOWN component still renders its key — never dropped from the sum", () => {
    expect(importanceComponentLabel("implied_move_bonus", "zh")).toBe("implied move bonus");
    expect(importanceComponentLabel("implied_move_bonus", "en")).toBe("implied move bonus");
  });
});

describe("groupByRelevance", () => {
  it("buckets events into the §12 ladder and preserves the server's order", () => {
    const events = [
      makeEvent({ event_id: 1, relevance_tier: "POSITION" }),
      makeEvent({ event_id: 2, relevance_tier: "POSITION" }),
      makeEvent({ event_id: 3, relevance_tier: "WATCHLIST" }),
    ];
    const groups = groupByRelevance(events);
    expect(groups.get("POSITION")?.map((e) => e.event_id)).toEqual([1, 2]);
    expect(groups.get("WATCHLIST")?.map((e) => e.event_id)).toEqual([3]);
    expect(groups.get("TRADING_POOL")).toEqual([]);
  });

  it("always exposes all five buckets, so a group can render as empty", () => {
    const groups = groupByRelevance([]);
    expect([...groups.keys()]).toEqual(RELEVANCE_ORDER);
  });

  it("an UNRECOGNISED tier lands in OTHER rather than vanishing", () => {
    const rogue = makeEvent({
      event_id: 9,
      relevance_tier: "SOMETHING_NEW" as RelevanceTier,
    });
    const groups = groupByRelevance([rogue]);
    expect(groups.get("OTHER")?.map((e) => e.event_id)).toEqual([9]);
    const total = [...groups.values()].reduce((n, list) => n + list.length, 0);
    expect(total).toBe(1);
  });
});

describe("zoneAbbrev", () => {
  it("takes the tz string's last segment and unslugs it", () => {
    expect(zoneAbbrev("America/New_York")).toBe("New York");
    expect(zoneAbbrev("UTC")).toBe("UTC");
  });
});

describe("test helper sanity", () => {
  it("en() passthrough keeps the fixture readable", () => {
    expect(en("x")).toBe("x");
  });
});
