"use client";

/**
 * WHAT THE MATCHED CONTRACTS COST, all of them, in one picture.
 *
 * The panel below this chart prints each contract as its own block. That is
 * the right form for auditing one contract and the wrong form for the
 * reader's actual first question — "where is the money?" — which is a
 * comparison ACROSS contracts and cannot be answered by scrolling through
 * them one at a time.
 *
 * Form (dataviz step 1): horizontal bars on a SHARED 0–1 axis, one row per
 * contract, ordered as the panel orders them. The variable is a price in
 * [0,1] over a short nominal set, and the reader's task is to compare
 * magnitudes and spot the outlier — which is a bar chart. Horizontal because
 * the category labels are long questions, and a vertical chart would either
 * truncate them or rotate them.
 *
 * Encoding decisions that are honesty rules, not taste:
 *
 *  A. THE AXIS IS ALWAYS THE FULL 0–1. Never scaled to the data's own range.
 *     Four contracts priced 0.02–0.08 on a 0–0.08 axis look like a wide
 *     spread of opinion; on the true axis they look like what they are — a
 *     market assigning all four outcomes a low price. Truncating this axis
 *     would be the single most misleading thing this chart could do.
 *  B. THE BAR IS PRICE, NOT PROBABILITY, AND THE LABEL SAYS SO. Same rule the
 *     panel enforces in words: this is what a contract COSTS. A DERIVED
 *     contract at 63c is not a 63% forecast of this catalyst, so the relation
 *     rides on every row rather than in a legend the reader must remember.
 *  C. THESE BARS DO NOT SUM TO ANYTHING. They are separate contracts, not
 *     shares of one whole — several may be near-certain together, or none.
 *     Hence separate rows on a common axis, never a stacked bar or a pie,
 *     both of which would assert a partition that does not exist.
 *  D. AN ABSENT PRICE DRAWS NO BAR. Not a zero-width one: "we have no
 *     observation" and "the contract is worthless" are opposite claims, and a
 *     bar pinned at the origin says the second.
 *
 * Palette: the accent for DIRECT, a muted tone for everything else — the
 * relation is what changes the reading, so it is what earns the ink. Colour
 * is redundant with the badge text on each row.
 *
 * Every value drawn here is printed in the panel below, so a reader who never
 * hovers loses nothing.
 */
import { useT } from "@/lib/i18n";
import type { MarketSeriesBlock, MatchedMarket } from "@/lib/types-research";
import { relationLabel } from "./PredictionMarketsPanel";

/** DIRECT measures the event itself; the rest are context and read dimmer. */
const DIRECT_FILL = "#4493f8";
const INDIRECT_FILL = "#6e7681";


export default function PredictionMarketBars({
  markets,
  series = [],
}: {
  markets: MatchedMarket[];
  series?: MarketSeriesBlock[];
}) {
  const t = useT();
  // An INCOMPLETE distribution must be labelled, not drawn as if it were
  // whole. The verdict comes from the series' own arithmetic upstream —
  // exclusive exhaustive brackets sum to ~1.00 — and the sum travels with it
  // so the warning cites its evidence instead of asserting.
  const incomplete = series.filter((b) => b.complete === false);
  // Rule D: a contract with no observed price is not plotted as zero. It stays
  // in the panel below with its own "unavailable" wording.
  const priced = markets.filter(
    (m) =>
      typeof m.market_implied_probability === "number" &&
      Number.isFinite(m.market_implied_probability),
  );
  if (priced.length === 0) return null;

  return (
    <div className="pm-bars" data-testid="pm-bars">
      <div className="pm-bars-head">
        <span className="k">
          {/* Rule B: the axis is named as a COST, in the heading, every time. */}
          {t("What each contract costs", "各合约价格")}
        </span>
        <span className="muted pm-bars-note">
          {t(
            "Contract price, 0–1. Separate contracts — these do not sum to 1.",
            "合约价格，区间 0–1。各合约相互独立——其总和并非 1。",
          )}
        </span>
      </div>

      {incomplete.length > 0 && (
        <p className="pm-bars-warn" data-testid="pm-series-incomplete">
          {t(
            `Incomplete distribution: ${incomplete
              .map((b) => `${b.n_brackets} brackets summing to ${Math.round((b.price_sum ?? 0) * 100)}c`)
              .join("; ")} — a full set of ranges prices to about 100c, so brackets are missing here. Read these as individual contracts, not as the market's whole view.`,
            `分布不完整：${incomplete
              .map((b) => `${b.n_brackets} 个区间合计 ${Math.round((b.price_sum ?? 0) * 100)}c`)
              .join("；")} — 完整区间应合计约 100c，因此此处缺少部分区间。请将其视为独立合约，而非市场的完整判断。`,
          )}
        </p>
      )}

      <div className="pm-bars-rows">
        {priced.map((m, i) => {
          const price = m.market_implied_probability as number;
          const direct = m.relation === "DIRECT";
          const pct = Math.max(0, Math.min(1, price)) * 100;
          const tip = [
            m.safe_question,
            `${relationLabel(m.relation, t)} — ${(price * 100).toFixed(1)}c`,
          ].join("\n");
          return (
            <div className="pm-bar-row" key={`${m.market_ref}-${i}`} title={tip}>
              <div className="pm-bar-track">
                <div
                  className="pm-bar-fill"
                  style={{
                    width: `${pct}%`,
                    background: direct ? DIRECT_FILL : INDIRECT_FILL,
                  }}
                  data-testid="pm-bar-fill"
                  data-relation={m.relation}
                />
              </div>
              <span className="pm-bar-value mono" data-testid="pm-bar-value">
                {(price * 100).toFixed(1)}c
              </span>
              <span className="pm-bar-label" title={m.safe_question}>
                <span className="badge dim pm-bar-rel">{relationLabel(m.relation, t)}</span>
                {m.safe_question}
              </span>
            </div>
          );
        })}
      </div>

      {/* Rule A made visible: the axis is labelled at both ends, always 0 and
          1, so a reader can see it was never truncated to fit the data. */}
      <div className="pm-bars-axis" aria-hidden="true">
        <span>
          <span>0c</span>
          <span>100c</span>
        </span>
        <span />
        <span />
      </div>
    </div>
  );
}
