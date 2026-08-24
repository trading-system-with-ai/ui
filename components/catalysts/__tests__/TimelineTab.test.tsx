/**
 * Phase J §57 Timeline-tab tests.
 *
 * Each pins a rule where a plausible-looking timeline lies:
 *
 *  1. ORDER IS THE MEANING. A timeline rendered in payload order is a list
 *     that happens to have dates on it. `sortItems` guarantees ascending time
 *     even if a serializer changes, and an item with NO parseable timestamp
 *     sinks to the end rather than vanishing — it happened, we just do not
 *     know when, and dropping it silently shrinks the record.
 *  2. THE AS-OF MARKER IS DRAWN. Every item is stamped at or before it (§96),
 *     so the marker is the line past which the platform deliberately knows
 *     nothing. Without it an empty tail reads as "nothing since" rather than
 *     "we stopped looking here".
 *  3. FILTERS NARROW; THEY NEVER DELETE. Deselecting everything means NO
 *     filter, not a blank page, and the server's totals stay on screen beside
 *     the visible count so a reader can always see something is hidden.
 *  4. THE CATEGORY FILTER ONLY BINDS ROWS THAT HAVE A CATEGORY. A filing has
 *     no materiality category; hiding filings because the reader narrowed to
 *     GUIDANCE would silently rewrite the record.
 *  5. THE ANCHORS CARRY THEIR CERTAINTY. §7 does not stop applying because a
 *     date is drawn as a node on a rail instead of printed in a table.
 *  6. AN EMPTY WINDOW IS A FINDING WITH ITS REMEDY, not a blank panel — and
 *     it is a DIFFERENT message from "your filters hid everything".
 *  7. TRUNCATION IS ANNOUNCED. A list that quietly ends is a list the reader
 *     will trust as complete.
 *  8. A NEWS TITLE IS ATTACKER-INFLUENCED. Only http(s) URLs become links;
 *     anything else degrades to plain text rather than to a live javascript:.
 *  9. THE RENDERER READS DEFENSIVELY. A payload missing anchors, counts,
 *     window or items must still render — the seam is new and the server may
 *     ship a field late.
 * 10. NOTHING IS COMPUTED HERE (§61). Counts come from `counts`, not from
 *     `items.length`, so a truncated payload reports the SERVER's total.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { EventTimelinePayload, TimelineItem } from "@/lib/types-timeline";
import { TimelineTabContent } from "../TimelineTab";
import {
  anchorDate,
  anchorPresent,
  filterItems,
  fmtScore,
  presentCategories,
  presentKinds,
  safeUrl,
  sortItems,
  stampDay,
  stampMinute,
} from "../timeline-format";

// This jsdom build ships no working localStorage (same shim as NewsTab.test).
const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});

afterEach(() => {
  cleanup();
  store.clear();
});

/* ------------------------------------------------------------- fixtures */

/**
 * Keys spelled exactly as the U1 `build_event_timeline` payload emits them:
 * `anchors.previous_event`, `window.basis`, `counts.by_kind`,
 * `counts.by_category`, and the per-kind item fields.
 */
function makePayload(overrides: Partial<EventTimelinePayload> = {}): EventTimelinePayload {
  return {
    event_id: 41,
    event_key: "ACME:EARNINGS:2026Q3",
    ticker: "ACME",
    as_of: "2026-08-19T13:00:00+00:00",
    anchors: {
      previous_event: {
        event_id: 30,
        event_key: "ACME:EARNINGS:2026Q2",
        date_et: "2026-05-14",
        scheduled_at_utc: "2026-05-14T20:05:00+00:00",
        session: "AFTER_MARKET",
        is_estimated: false,
      },
      as_of: "2026-08-19T13:00:00+00:00",
      next_event: {
        event_id: 41,
        event_key: "ACME:EARNINGS:2026Q3",
        date_et: "2026-08-21",
        scheduled_at_utc: "2026-08-21T20:05:00+00:00",
        session: "AFTER_MARKET",
        is_estimated: true,
      },
    },
    window: {
      start: "2026-05-14T20:05:00+00:00",
      end: "2026-08-19T13:00:00+00:00",
      basis: "previous_event",
    },
    items: [
      {
        kind: "NEWS",
        at: "2026-06-02T12:00:00+00:00",
        title: "ACME raises full-year guidance",
        category: "GUIDANCE",
        publisher: "Wire",
        url: "https://news.example.com/a",
        evidence_id: "ev-1",
        cluster_id: "cl-1",
        score: 0.81,
        article_count: 4,
      },
      {
        kind: "FILING",
        at: "2026-07-01T21:30:00+00:00",
        title: "10-Q filed",
        fiscal_period: "Q2",
        fiscal_year: 2026,
        timeframe: "quarterly",
      },
      {
        kind: "EVENT",
        at: "2026-07-15T14:00:00+00:00",
        title: "ACME investor day",
        event_type: "CORPORATE_EVENT",
        status: "CONFIRMED",
      },
      {
        kind: "ANALYSIS",
        at: "2026-08-10T09:00:00+00:00",
        title: "Stored analysis",
        regime: "EXPECTATIONS_ELEVATED",
        confidence: "MEDIUM",
        id: 7,
      },
    ],
    counts: {
      by_kind: { NEWS: 1, FILING: 1, EVENT: 1, ANALYSIS: 1 },
      by_category: { GUIDANCE: 1 },
      total: 4,
    },
    truncated: false,
    ...overrides,
  };
}

function renderTimeline(data: EventTimelinePayload | null | undefined) {
  return render(
    <LanguageProvider>
      <TimelineTabContent data={data} />
    </LanguageProvider>,
  );
}

function itemTexts(): string[] {
  return screen.getAllByTestId("timeline-item").map((el) => el.textContent ?? "");
}

/* ------------------------------------------------------------------ tests */

describe("TimelineTab — order is the meaning", () => {
  /* Rule 1. */
  it("renders every kind, in ascending time order", () => {
    renderTimeline(makePayload());
    const texts = itemTexts();
    expect(texts).toHaveLength(4);
    expect(texts[0]).toContain("raises full-year guidance");
    expect(texts[1]).toContain("10-Q filed");
    expect(texts[2]).toContain("investor day");
    expect(texts[3]).toContain("Stored analysis");
  });

  it("sorts a payload that arrived out of order rather than trusting it", () => {
    const payload = makePayload();
    const reversed = { ...payload, items: [...(payload.items ?? [])].reverse() };
    renderTimeline(reversed);
    expect(itemTexts()[0]).toContain("raises full-year guidance");
  });

  /* An undated item is a record, not a bug to be swept up. */
  it("keeps an item with no timestamp, at the end", () => {
    const undated: TimelineItem = { kind: "NEWS", at: null, title: "Undated development" };
    renderTimeline(makePayload({ items: [...(makePayload().items ?? []), undated] }));
    const texts = itemTexts();
    expect(texts).toHaveLength(5);
    expect(texts[4]).toContain("Undated development");
    expect(texts[4]).toContain("time unknown");
  });

  it("sortItems is stable for equal timestamps", () => {
    const a: TimelineItem = { kind: "NEWS", at: "2026-06-01T00:00:00+00:00", title: "A" };
    const b: TimelineItem = { kind: "NEWS", at: "2026-06-01T00:00:00+00:00", title: "B" };
    expect(sortItems([a, b]).map((i) => i.title)).toEqual(["A", "B"]);
    expect(sortItems([b, a]).map((i) => i.title)).toEqual(["B", "A"]);
  });
});

describe("TimelineTab — the as-of marker and the anchors", () => {
  /* Rule 2. */
  it("draws the as-of marker with the instant the window was cut at", () => {
    renderTimeline(makePayload());
    const marker = screen.getByTestId("timeline-as-of");
    expect(marker.textContent).toContain("AS OF");
    expect(marker.textContent).toContain("2026-08-19 13:00");
    expect(marker.textContent).toContain("Nothing after this instant is shown");
  });

  it("draws both ends of the window as anchors", () => {
    renderTimeline(makePayload());
    expect(screen.getByTestId("timeline-anchor-previous").textContent).toContain("2026-05-14");
    expect(screen.getByTestId("timeline-anchor-next").textContent).toContain("2026-08-21");
  });

  /* Rule 5 — §7 applies to a date drawn as a node too. */
  it("badges an ESTIMATED anchor date", () => {
    renderTimeline(makePayload());
    expect(screen.getByTestId("timeline-anchor-next-estimated").textContent).toContain(
      "ESTIMATED",
    );
    expect(screen.queryByTestId("timeline-anchor-previous-estimated")).toBeNull();
  });

  it("explains the fallback window when there is no previous event", () => {
    const payload = makePayload();
    renderTimeline({
      ...payload,
      anchors: { ...payload.anchors, previous_event: null },
    });
    expect(screen.getByTestId("timeline-anchor-previous-missing").textContent).toContain(
      "120 days",
    );
  });

  it("prints the server's window bounds and basis verbatim", () => {
    renderTimeline(makePayload());
    const window = screen.getByTestId("timeline-window").textContent ?? "";
    expect(window).toContain("2026-05-14");
    expect(window).toContain("2026-08-19");
    expect(window).toContain("previous_event");
  });
});

describe("TimelineTab — filters narrow, they never delete", () => {
  /* Rule 3. */
  it("narrows to the selected kind and leaves the rest out of view", async () => {
    const user = userEvent.setup();
    renderTimeline(makePayload());
    await user.click(screen.getByTestId("timeline-filter-kind-FILING"));
    const texts = itemTexts();
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("10-Q filed");
  });

  it("keeps the server's total on screen while a filter hides rows", async () => {
    const user = userEvent.setup();
    renderTimeline(makePayload());
    await user.click(screen.getByTestId("timeline-filter-kind-FILING"));
    const counts = screen.getByTestId("timeline-counts").textContent ?? "";
    expect(counts).toContain("1 shown");
    expect(counts).toContain("of 4 in window");
  });

  it("treats deselecting everything as NO filter, not as an empty page", async () => {
    const user = userEvent.setup();
    renderTimeline(makePayload());
    await user.click(screen.getByTestId("timeline-filter-kind-FILING"));
    expect(itemTexts()).toHaveLength(1);
    await user.click(screen.getByTestId("timeline-filter-kind-FILING"));
    expect(itemTexts()).toHaveLength(4);
  });

  it("clears every kind filter with one control", async () => {
    const user = userEvent.setup();
    renderTimeline(makePayload());
    await user.click(screen.getByTestId("timeline-filter-kind-NEWS"));
    await user.click(screen.getByTestId("timeline-clear-kinds"));
    expect(itemTexts()).toHaveLength(4);
  });

  it("marks the active filter with aria-pressed, so it is not colour-only", async () => {
    const user = userEvent.setup();
    renderTimeline(makePayload());
    const chip = screen.getByTestId("timeline-filter-kind-NEWS");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    await user.click(chip);
    expect(screen.getByTestId("timeline-filter-kind-NEWS").getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  /* Rule 4 — the dangerous one. */
  it("a category filter keeps rows that have no category at all", () => {
    const items = makePayload().items ?? [];
    const kept = filterItems(items, [], ["GUIDANCE"]);
    const kinds = kept.map((i) => i.kind);
    expect(kinds).toContain("NEWS");
    expect(kinds).toContain("FILING");
    expect(kinds).toContain("EVENT");
    expect(kinds).toContain("ANALYSIS");
  });

  it("a category filter DOES exclude a news row of another category", () => {
    const items: TimelineItem[] = [
      { kind: "NEWS", at: "2026-06-01T00:00:00+00:00", category: "GUIDANCE", title: "g" },
      { kind: "NEWS", at: "2026-06-02T00:00:00+00:00", category: "LEGAL", title: "l" },
    ];
    expect(filterItems(items, [], ["GUIDANCE"]).map((i) => i.title)).toEqual(["g"]);
  });

  it("offers a category chip only for categories that are actually present", () => {
    renderTimeline(makePayload());
    expect(screen.getByTestId("timeline-filter-category-GUIDANCE")).toBeTruthy();
    expect(screen.queryByTestId("timeline-filter-category-LEGAL")).toBeNull();
  });
});

describe("TimelineTab — states are said, not drawn as blanks", () => {
  /* Rule 6 — and the two empties are different messages. */
  it("explains an empty window and points at the tab that fills one", () => {
    renderTimeline(makePayload({ items: [], counts: { by_kind: {}, by_category: {}, total: 0 } }));
    const empty = screen.getByTestId("timeline-empty").textContent ?? "";
    expect(empty).toContain("That is a state, not a gap");
    expect(empty).toContain("News tab");
  });

  it("says 'your filters hid it' rather than 'nothing happened'", async () => {
    const user = userEvent.setup();
    // Narrowed to ANALYSES only, in a window that holds none. The two empty
    // states must not share a message: "nothing happened here" is a finding
    // about the company, "your filter hid it" is a fact about the control the
    // reader just touched, and confusing them makes a filter look like news.
    renderTimeline(
      makePayload({
        items: [
          { kind: "NEWS", at: "2026-06-01T00:00:00+00:00", category: "GUIDANCE", title: "g" },
        ],
        counts: { by_kind: { NEWS: 1, ANALYSIS: 0 }, by_category: { GUIDANCE: 1 }, total: 1 },
      }),
    );
    await user.click(screen.getByTestId("timeline-filter-kind-ANALYSIS"));
    expect(screen.queryAllByTestId("timeline-item")).toHaveLength(0);
    const empty = screen.getByTestId("timeline-empty").textContent ?? "";
    expect(empty).toContain("matches the current filters");
    expect(empty).not.toContain("That is a state, not a gap");
  });

  /* Rule 7. */
  it("announces truncation and says which end was dropped", () => {
    renderTimeline(makePayload({ truncated: true }));
    const note = screen.getByTestId("timeline-truncated").textContent ?? "";
    expect(note).toContain("TRUNCATED");
    expect(note).toContain("not complete");
  });

  it("stays silent about truncation when nothing was dropped", () => {
    renderTimeline(makePayload({ truncated: false }));
    expect(screen.queryByTestId("timeline-truncated")).toBeNull();
  });
});

describe("TimelineTab — rows print only what the payload carried", () => {
  it("renders the news row's category, publisher, score and article count", () => {
    renderTimeline(makePayload());
    const row = screen.getAllByTestId("timeline-item")[0];
    expect(within(row).getByTestId("timeline-item-category").textContent).toContain("GUIDANCE");
    expect(within(row).getByTestId("timeline-item-score").textContent).toContain("0.81");
    expect(row.textContent).toContain("Wire");
    expect(row.textContent).toContain("4 articles");
  });

  it("renders the filing's fiscal period, and no score it was never given", () => {
    renderTimeline(makePayload());
    const row = screen.getAllByTestId("timeline-item")[1];
    expect(within(row).getByTestId("timeline-item-fiscal").textContent).toContain("Q2 2026");
    expect(within(row).queryByTestId("timeline-item-score")).toBeNull();
    expect(within(row).queryByTestId("timeline-item-category")).toBeNull();
  });

  it("renders the stored analysis's regime and confidence as words", () => {
    renderTimeline(makePayload());
    const row = screen.getAllByTestId("timeline-item")[3];
    expect(row.textContent).toContain("EXPECTATIONS_ELEVATED");
    expect(row.textContent).toContain("MEDIUM");
    // §50: confidence is the model's own wording, never a percentage.
    expect(row.textContent).not.toMatch(/\d+%/);
  });

  /* Rule 8 — the titles came from a news feed. */
  it("links an http(s) title and leaves anything else as plain text", () => {
    renderTimeline(
      makePayload({
        items: [
          { kind: "NEWS", at: "2026-06-01T00:00:00+00:00", title: "safe", url: "https://x.test/a" },
          {
            kind: "NEWS",
            at: "2026-06-02T00:00:00+00:00",
            title: "unsafe",
            url: "javascript:alert(1)",
          },
        ],
      }),
    );
    const rows = screen.getAllByTestId("timeline-item");
    expect(within(rows[0]).getByRole("link").getAttribute("href")).toBe("https://x.test/a");
    expect(within(rows[1]).queryByRole("link")).toBeNull();
    expect(rows[1].textContent).toContain("unsafe");
  });

  it("says '(no title)' rather than rendering an empty line", () => {
    renderTimeline(
      makePayload({ items: [{ kind: "NEWS", at: "2026-06-01T00:00:00+00:00", title: "  " }] }),
    );
    expect(screen.getAllByTestId("timeline-item")[0].textContent).toContain("(no title)");
  });
});

describe("TimelineTab — nothing is computed here (§61)", () => {
  /* Rule 10 — the count comes from the server, not from items.length. */
  it("reports the server's total, not the number of rows it happened to send", () => {
    renderTimeline(
      makePayload({
        counts: { by_kind: { NEWS: 1, FILING: 1, EVENT: 1, ANALYSIS: 1 }, by_category: {}, total: 212 },
        truncated: true,
      }),
    );
    const counts = screen.getByTestId("timeline-counts").textContent ?? "";
    expect(counts).toContain("4 shown");
    expect(counts).toContain("of 212 in window");
  });

  it("renders a server-sent 0 total rather than hiding it", () => {
    renderTimeline(
      makePayload({ items: [], counts: { by_kind: {}, by_category: {}, total: 0 } }),
    );
    expect(screen.getByTestId("timeline-counts").textContent).toContain("of 0 in window");
  });
});

describe("TimelineTab — the renderer is defensive about a new seam", () => {
  /* Rule 9. */
  it("renders with an entirely empty payload", () => {
    renderTimeline({});
    expect(screen.getByTestId("timeline-panel")).toBeTruthy();
    expect(screen.getByTestId("timeline-empty")).toBeTruthy();
  });

  it("renders with a null payload", () => {
    renderTimeline(null);
    expect(screen.getByTestId("timeline-panel")).toBeTruthy();
  });

  it("renders an item of an unknown kind rather than dropping it", () => {
    renderTimeline(
      makePayload({
        items: [{ kind: "REGULATORY_ACTION", at: "2026-06-01T00:00:00+00:00", title: "new kind" }],
        counts: { by_kind: { REGULATORY_ACTION: 1 }, by_category: {}, total: 1 },
      }),
    );
    const row = screen.getAllByTestId("timeline-item")[0];
    expect(row.textContent).toContain("new kind");
    expect(within(row).getByTestId("timeline-item-kind").textContent).toContain(
      "REGULATORY ACTION",
    );
  });
});

describe("timeline-format helpers", () => {
  it("stampMinute and stampDay return null for absent values, never a dash", () => {
    expect(stampMinute(null)).toBeNull();
    expect(stampMinute("")).toBeNull();
    expect(stampDay(undefined)).toBeNull();
    expect(stampDay("2026-08-19T13:00:00+00:00")).toBe("2026-08-19");
  });

  it("fmtScore returns null for a missing score — 0.00 would be a claim", () => {
    expect(fmtScore(null)).toBeNull();
    expect(fmtScore(undefined)).toBeNull();
    expect(fmtScore(Number.NaN)).toBeNull();
    expect(fmtScore(0)).toBe("0.00");
    expect(fmtScore(0.815)).toBe("0.81");
  });

  it("safeUrl admits only http(s)", () => {
    expect(safeUrl("https://x.test/a")).toBe("https://x.test/a");
    expect(safeUrl("http://x.test/a")).toBe("http://x.test/a");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,<b>")).toBeNull();
    expect(safeUrl("/relative")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });

  it("anchorPresent rejects an empty object but accepts a bare date", () => {
    expect(anchorPresent(null)).toBe(false);
    expect(anchorPresent({})).toBe(false);
    expect(anchorPresent({ date_et: "2026-05-14" })).toBe(true);
    expect(anchorPresent({ event_id: 30 })).toBe(true);
  });

  it("anchorDate prefers the ET calendar date the server computed", () => {
    expect(anchorDate({ date_et: "2026-05-14", scheduled_at_utc: "2026-05-15T01:00:00+00:00" })).toBe(
      "2026-05-14",
    );
    expect(anchorDate({ scheduled_at_utc: "2026-05-15T01:00:00+00:00" })).toBe("2026-05-15");
    expect(anchorDate(null)).toBeNull();
  });

  it("presentKinds keeps the fixed order and appends unknown kinds", () => {
    const payload = makePayload({
      counts: { by_kind: { ANALYSIS: 1, ZZZ: 1, NEWS: 1 }, by_category: {}, total: 3 },
      items: [],
    });
    expect(presentKinds(payload)).toEqual(["NEWS", "ANALYSIS", "ZZZ"]);
  });

  it("presentCategories falls back to the items when counts carry none", () => {
    const payload = makePayload({
      counts: { by_kind: {}, by_category: {}, total: 2 },
      items: [
        { kind: "NEWS", at: "2026-06-01T00:00:00+00:00", category: "LEGAL" },
        { kind: "NEWS", at: "2026-06-02T00:00:00+00:00", category: "LEGAL" },
      ],
    });
    expect(presentCategories(payload)).toEqual(["LEGAL"]);
  });
});
