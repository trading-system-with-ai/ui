/**
 * The coverage matrix exists because the evidence bundle is ~16 sections of
 * nested JSON: faithful as an audit record, unreadable as a summary. These
 * tests pin the honesty rules, which are the reason the component is a matrix
 * and not a score:
 *
 *  1. ABSENT IS ITS OWN STATE, never a dim version of present (§44 rule 18).
 *  2. PARTIAL IS A THIRD STATE. A section that answered but named a gap is
 *     neither "has data" nor "no data", and conflating it with either makes a
 *     reader over-trust a gapped section or ignore a mostly-good one.
 *  3. STATE IS NOT COLOUR ALONE — a glyph and a word carry it too.
 *  4. NO COMPLETENESS SCORE. A count, never a percentage.
 *  5. THE SERVER'S REASON IS VERBATIM in the hover, never paraphrased.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import EvidenceCoverageMap, { type CoverageCell } from "../EvidenceCoverageMap";

afterEach(cleanup);

const CELLS: CoverageCell[] = [
  { key: "news", label: "News", state: "present", detail: "12" },
  {
    key: "consensus",
    label: "Consensus",
    state: "absent",
    reason: "this platform subscribes to no estimate provider",
  },
  { key: "prediction_markets", label: "Prediction markets", state: "partial", detail: "5" },
];

function renderMap(cells: CoverageCell[] = CELLS) {
  return render(
    <LanguageProvider>
      <EvidenceCoverageMap cells={cells} />
    </LanguageProvider>,
  );
}

describe("EvidenceCoverageMap", () => {
  it("gives each state its own mark rather than a shade of one", () => {
    renderMap();
    expect(screen.getByTestId("evidence-cell-news").dataset.state).toBe("present");
    expect(screen.getByTestId("evidence-cell-consensus").dataset.state).toBe("absent");
    expect(screen.getByTestId("evidence-cell-prediction_markets").dataset.state).toBe(
      "partial",
    );
  });

  it("carries state in text, not colour alone", () => {
    renderMap();
    // The word is present in the accessible tree for every cell, so a reader
    // who cannot distinguish the hues still reads the state.
    expect(screen.getByTestId("evidence-cell-consensus").textContent).toMatch(/no data/i);
    expect(screen.getByTestId("evidence-cell-news").textContent).toMatch(/has data/i);
  });

  it("counts sections instead of scoring completeness", () => {
    renderMap();
    const count = screen.getByTestId("evidence-coverage-count").textContent ?? "";
    expect(count).toMatch(/1 of 3/);
    // A percentage would invite comparing two bundles missing different
    // things as if they were the same quantity.
    expect(count).not.toMatch(/%/);
  });

  it("names partial sections separately in the count", () => {
    renderMap();
    expect(screen.getByTestId("evidence-coverage-count").textContent).toMatch(/1 partial/);
  });

  it("puts the server's own reason in the hover, verbatim", () => {
    renderMap();
    const tip = screen.getByTestId("evidence-cell-consensus").getAttribute("title") ?? "";
    expect(tip).toContain("this platform subscribes to no estimate provider");
  });

  it("renders nothing at all when there are no sections", () => {
    const { container } = renderMap([]);
    expect(container.querySelector('[data-testid="evidence-coverage-map"]')).toBeNull();
  });
});
