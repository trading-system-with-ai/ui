/**
 * Phase I — wire types for the §18/§36-§37 options / implied-move surface.
 *
 * These live in their own module rather than in `lib/types.ts` for a boring
 * reason and a good one. The boring one: `types.ts` was owned by another
 * workstream while this phase landed. The good one: every name here belongs
 * to ONE endpoint family (`/api/events/{id}/options*`), so a reader chasing
 * a field on the Options tab has one file to open, and a rename on that seam
 * cannot ripple through the shared type surface.
 *
 * Three shapes carry the whole honesty contract of the tab, and the types
 * encode them rather than leaving them to convention:
 *
 *  A. `basis` IS PART OF EVERY NUMBER. A live ATM straddle read off the
 *     current chain and a straddle reconstructed from daily CLOSES months
 *     after the fact are not the same measurement, and a payload that let
 *     them share a field would let the UI present them identically. The
 *     union has exactly two members and no default — a number whose basis is
 *     unknown is a number the tab must not print.
 *  B. NULL IS THE HONEST ABSENCE, ALWAYS. `current` is nullable, and every
 *     numeric inside it is too. No field is typed `number` where the server
 *     can fail to compute it: the option leg's bars are routinely missing
 *     for a thin strike, and a `0` there would render as "the market priced
 *     no move at all", which is the opposite of "we do not know".
 *  C. `status` IS THE SERVER'S OWN VERDICT, not something the client derives
 *     by counting nulls. PARTIAL exists precisely because a straddle can be
 *     computable while its IV crush is not, and a UI that re-derived the
 *     status from the fields it happened to check would disagree with the
 *     server about what it is looking at.
 */

/** Where an options number came from. There is no third possibility and no default. */
export type OptionMetricBasis =
  | "LIVE_CHAIN_SNAPSHOT"
  | "HISTORICAL_DAILY_CLOSE_APPROXIMATION";

/**
 * The server's verdict on one metric row.
 *
 * PARTIAL is not a softer NO_DATA: it means the straddle computed but
 * something downstream of it (the post-event leg, the IV crush) did not, so
 * the tab shows what exists and names what does not. Widened with `string`
 * because a server that adds a fourth status must not make the tab
 * unrenderable — an unknown token renders verbatim rather than crashing.
 */
export type OptionMetricStatus = "OK" | "NO_DATA" | "PARTIAL" | string;

/**
 * §37's implied-vs-realized verdict.
 *
 * Deliberately about the PAST: it compares what the options market charged
 * before an event that has since happened against what the stock then did.
 * It is not a recommendation and carries no direction — "OVER_PRICED" says
 * the straddle cost more than the move delivered, not that selling premium
 * is the trade.
 */
export type ImpliedClassification =
  | "UNDER_PRICED"
  | "FAIR"
  | "OVER_PRICED"
  | string;

/**
 * The implied-move metrics for ONE event.
 *
 * `implied_move_pct` and `actual_move_pct` are FRACTIONS (0.062 = 6.2%),
 * matching every other ratio on this platform's wire; `implied_move_points`
 * is in dollars of underlying. Mixing the two conventions in one payload is
 * how a 6% move gets rendered as 620%, so the split is by field name and
 * never inferred from magnitude.
 */
export interface EventOptionMetrics {
  event_id?: number | null;
  event_key?: string | null;
  /** Which measurement this is. Rendered as a badge, never hidden. */
  basis: OptionMetricBasis | string;
  status: OptionMetricStatus;
  /** The expiry the straddle was priced on (ISO date). */
  expiry?: string | null;
  strike?: number | null;
  spot?: number | null;
  /** ATM straddle implied move, as a FRACTION of spot. */
  implied_move_pct?: number | null;
  /** The same move in underlying points (dollars), not a percentage. */
  implied_move_points?: number | null;
  iv_before?: number | null;
  iv_after?: number | null;
  /** IV change across the event, as a fraction (−0.42 = a 42% crush). */
  iv_crush_pct?: number | null;
  /** Realized move across the event, as a signed fraction. */
  actual_move_pct?: number | null;
  /** |actual| / implied. 1.0 = the market priced the move exactly. */
  implied_realized_ratio?: number | null;
  classification?: ImpliedClassification | null;
  /** Server notes, rendered VERBATIM (§26/§36) — never paraphrased. */
  notes?: string[] | null;
  /** OCC symbols of the legs the straddle was built from, for auditability. */
  call_ticker?: string | null;
  put_ticker?: string | null;
}

/** One prior event's row in the history table and the chart. */
export interface EventOptionHistoryRow extends EventOptionMetrics {
  /** ISO date of the prior event, used as the row/bar label. */
  event_date?: string | null;
}

/**
 * Distribution of absolute moves over the history window.
 *
 * ABSOLUTE by construction: an implied move has no sign (a straddle prices
 * magnitude, not direction), so the actual moves are folded to |x| before
 * being summarised or the two columns would not be comparable at all.
 * `n` travels with every statistic (§64) — a p90 over three events is a
 * different object from a p90 over twelve, and hiding the count makes them
 * look alike.
 */
export interface OptionMoveStats {
  median_abs?: number | null;
  p90_abs?: number | null;
  max_abs?: number | null;
  n?: number | null;
}

/** The §37 headline comparison: what is priced now vs what has historically happened. */
export interface OptionMoveComparison {
  implied_pct?: number | null;
  hist_median_abs?: number | null;
  hist_p90_abs?: number | null;
  hist_max_abs?: number | null;
}

/** `GET /api/events/{id}/options` — the whole tab in one payload. */
export interface EventOptionsPayload {
  event_id: number;
  event_key?: string | null;
  ticker?: string | null;
  as_of?: string | null;
  /**
   * §37's wording, authored server-side and rendered verbatim. The tab shows
   * it unconditionally: a caveat that appears only when some other field is
   * present is a caveat that silently disappears on the screens that need it.
   */
  disclaimer?: string | null;
  /** THIS event's metrics — null when nothing has been computed or stored yet. */
  current?: EventOptionMetrics | null;
  history?: EventOptionHistoryRow[] | null;
  /** Keyed `actual` and `implied` — the two columns of the same window. */
  stats?: { actual?: OptionMoveStats | null; implied?: OptionMoveStats | null } | null;
  comparison?: OptionMoveComparison | null;
  /** Free-form server coverage notes; `reason` is the one key the tab reads. */
  coverage?: { reason?: string | null; [k: string]: unknown } | null;
}

/**
 * `POST …/options/backfill` and `POST …/options/history/backfill`.
 *
 * Every field is optional on purpose. This is a fire-and-report action whose
 * shape may grow, and the toast that reports it must never be the reason a
 * completed backfill looks like a failure — so the tab reads what is there
 * and says "the server reported no count" rather than printing a zero it
 * invented.
 */
export interface EventOptionsBackfillResult {
  event_id?: number | null;
  status?: OptionMetricStatus | null;
  stored_bars?: number | null;
  metrics?: EventOptionMetrics | null;
  reason?: string | null;
  [k: string]: unknown;
}
