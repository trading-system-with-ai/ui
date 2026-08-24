/**
 * The move timeline answers "when did this contract change its mind" — the
 * question that leads to "why". These tests pin the honesty rules:
 *
 *  1. THE MARK SPANS THE OBSERVATION WINDOW. With daily points the true
 *     moment lies between two observations; a pinpoint would send a reader
 *     looking for news on the wrong day.
 *  2. NO CAUSE IS NAMED. A price move and a same-day headline are a
 *     coincidence until someone checks. The chart offers a window to search,
 *     never a conclusion.
 *  3. DIRECTION IS GEOMETRY AND TEXT, not colour alone — and "up" is not
 *     "good": on a "<0.5% growth" bracket a rise prices a WORSE economy.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { PriceMove } from "@/lib/types-research";
import PriceMoveTimeline from "../PriceMoveTimeline";

afterEach(cleanup);

const MOVE = (over: Partial<PriceMove> = {}): PriceMove => ({
  from_ts: "2026-04-28T00:00:00+00:00",
  to_ts: "2026-04-29T00:00:00+00:00",
  from_price: 0.08,
  to_price: 0.46,
  change: 0.38,
  direction: "UP",
  ...over,
});

function renderTimeline(moves: PriceMove[]) {
  return render(
    <LanguageProvider>
      <PriceMoveTimeline moves={moves} />
    </LanguageProvider>,
  );
}

describe("PriceMoveTimeline", () => {
  it("draws each move as a span, never a zero-width pinpoint", () => {
    renderTimeline([
      MOVE(),
      MOVE({
        from_ts: "2026-07-08T00:00:00+00:00",
        to_ts: "2026-07-09T00:00:00+00:00",
        change: -0.365,
        direction: "DOWN",
      }),
    ]);
    for (const mark of screen.getAllByTestId("mv-mark")) {
      expect(Number(mark.getAttribute("width"))).toBeGreaterThan(0);
    }
  });

  it("puts the window in the hover so a reader can go looking", () => {
    renderTimeline([MOVE()]);
    const title = screen.getByTestId("mv-mark").querySelector("title");
    expect(title?.textContent).toContain("2026-04-28");
    expect(title?.textContent).toContain("2026-04-29");
  });

  it("offers a window to search, never a cause", () => {
    renderTimeline([MOVE()]);
    const text = screen.getByTestId("price-move-timeline").textContent ?? "";
    expect(text).toMatch(/not a cause/i);
  });

  it("separates direction by geometry, not colour alone", () => {
    renderTimeline([
      MOVE({ direction: "UP", change: 0.38 }),
      MOVE({
        from_ts: "2026-07-08T00:00:00+00:00",
        to_ts: "2026-07-09T00:00:00+00:00",
        change: -0.365,
        direction: "DOWN",
      }),
    ]);
    const [up, down] = screen.getAllByTestId("mv-mark");
    expect(up.dataset.direction).toBe("UP");
    expect(down.dataset.direction).toBe("DOWN");
    // The up mark ends where the down mark begins: the midline.
    const upBottom = Number(up.getAttribute("y")) + Number(up.getAttribute("height"));
    expect(upBottom).toBeCloseTo(Number(down.getAttribute("y")), 0);
  });

  it("renders nothing when no move cleared the threshold", () => {
    const { container } = renderTimeline([]);
    expect(container.querySelector('[data-testid="price-move-timeline"]')).toBeNull();
  });
});
