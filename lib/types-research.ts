/**
 * External web research + prediction markets (Catalyst research upgrade,
 * plan §5-§6). Mirrors the gateway payloads from
 * `apps/gateway/event_research.py` and `event_prediction_markets.py`.
 *
 * TWO RULES THIS FILE ENCODES IN ITS TYPES:
 *
 * 1. ABSENT IS NOT ZERO. Every field the provider may not supply is
 *    `| null` — never defaulted to 0 in the type, because a 0 spread and an
 *    unknown spread are different claims and the UI must be able to tell
 *    them apart (§44 rule 18).
 * 2. PRICES ARE PRICING, NOT PROBABILITY. The field is
 *    `market_implied_probability` — what the contract COSTS. No type here
 *    is named `probability` alone, so no component can accidentally render
 *    it as a claim about how likely an outcome actually is.
 */

/** The honest states a stored research read can report. */
export type WebResearchReason = "NEVER_RUN" | "NO_EVIDENCE_ACCEPTED";

/** The honest states a stored prediction-market read can report. */
export type PredictionMarketReason =
  | "NEVER_RUN"
  | "NO_RELEVANT_PREDICTION_MARKET"
  | "MARKET_METADATA_UNAVAILABLE";

/** Why a backfill declined to spend, or could not complete. */
export type ResearchBackfillReason =
  | "NOT_CONFIGURED"
  | "RECENTLY_REFRESHED"
  | "NO_QUERIES_PLANNED"
  | "PROVIDER_UNAVAILABLE"
  | "PARTIAL_DISCOVERY"
  | "NO_RELEVANT_PREDICTION_MARKET";

export type SourceTier =
  | "OFFICIAL"
  | "PRIMARY"
  | "HIGH_QUALITY_NEWS"
  | "INDUSTRY"
  | "SECONDARY"
  | "SOCIAL"
  | "UNKNOWN";

export type MarketRelation = "DIRECT" | "DERIVED" | "CONTEXT" | "NOT_CLASSIFIED";

/** The point-in-time window a research run covered. */
export interface ResearchWindow {
  start: string | null;
  end: string | null;
  basis: string | null;
  /** null when no comparable predecessor existed — see `fallback_reason`. */
  previous_event_id: number | null;
  /** Populated ONLY when the window is a documented fallback. */
  fallback_reason: string | null;
}

export interface SearchPlanQuery {
  purpose: string;
  query: string;
  priority: number;
  result_type: string;
}

export interface SearchPlan {
  profile_key?: string;
  queries?: SearchPlanQuery[];
}

/**
 * One admitted web document. Model-facing text only: `safe_title` is the
 * sanitized form, and there is deliberately NO url field here — the bundle
 * section never carries one (§81).
 */
export interface WebEvidenceItem {
  evidence_key: string;
  safe_title: string;
  publisher: string | null;
  domain: string;
  published_at: string | null;
  source_tier: SourceTier | null;
  topic: string | null;
  relevance: number | null;
  result_type: string;
}

export interface WebResearchSection {
  available: boolean;
  reason: WebResearchReason | null;
  tier: string;
  provider?: string;
  research_window?: ResearchWindow;
  search_plan?: SearchPlan;
  queries_executed?: number;
  results_considered?: number;
  results_accepted?: number;
  excluded_by_as_of?: number;
  excluded_suspicious_at_read?: number;
  suppressed_suspicious?: number;
  skipped?: { purpose?: string; reason?: string }[];
  run_status?: "OK" | "PARTIAL" | "FAILED";
  source_mix?: Record<string, number>;
  topic_mix?: Record<string, number>;
  important_evidence?: WebEvidenceItem[];
  retrieved_at?: string | null;
}

/**
 * Deterministic history features. Every field is null when unresolvable.
 *
 * NAMES MATCH THE WIRE EXACTLY. `current_price` and `price_range` are the
 * backend's own names (libs/trading_core/events/prediction_intel.py) and are
 * NOT renamed to something friendlier here: a type that spells a field
 * differently from the payload does not fail — it silently reads undefined,
 * which then renders as an absent value the platform in fact computed.
 * `current_price` is also the honest word: it is the contract's price, not
 * an estimate of how likely the outcome is.
 */
export interface MarketHistoryFeatures {
  current_price?: number | null;
  change_1h?: number | null;
  change_1d?: number | null;
  change_7d?: number | null;
  change_since_previous_event?: number | null;
  change_since_window_start?: number | null;
  recent_high?: number | null;
  recent_low?: number | null;
  price_range?: number | null;
  trend?: string | null;
  observation_count?: number | null;
  history_start?: string | null;
  history_end?: string | null;
  /** Which feature-computation version produced these numbers. */
  model_version?: string | null;
}

/** Depth FACTS, not a folded confidence score (Phase 23). */
export interface MarketDataQuality {
  snapshot_available: boolean;
  liquidity_known: boolean;
  volume_known: boolean;
  history_available: boolean;
}

export interface MatchedMarket {
  /** Stable citation id: `pm:{provider}:{provider_market_id}`. */
  market_ref: string;
  provider: string;
  safe_question: string;
  safe_resolution_criteria: string | null;
  relation: MarketRelation;
  relevance: number | null;
  reason: string | null;
  ambiguity: string | null;
  matched_by: string;
  market_status: string | null;
  primary_outcome: string | null;
  /** What the contract COSTS — never "the probability of the outcome". */
  market_implied_probability: number | null;
  spread: number | null;
  best_bid: number | null;
  best_ask: number | null;
  volume: number | null;
  liquidity: number | null;
  observed_at: string | null;
  snapshot_available: boolean;
  history: MarketHistoryFeatures | null;
  data_quality: MarketDataQuality;
  /** Which bracket series this contract belongs to; null when standalone. */
  series_key?: string | null;
  /** True when the accept cap cut this contract's series in half. */
  series_truncated?: boolean;
  /** Days this contract repriced sharply — windows to investigate, not causes. */
  notable_moves?: PriceMove[];
}

/**
 * One notable step between consecutive observations.
 *
 * `from_ts`/`to_ts` bound the window a reader would search for a cause. They
 * are OBSERVATION instants, not a claim about when news broke: with daily
 * points the true moment lies somewhere inside, and a single date would put
 * false precision on the one number a reader uses to go looking.
 */
export interface PriceMove {
  from_ts: string;
  to_ts: string;
  from_price: number;
  to_price: number;
  change: number;
  direction: "UP" | "DOWN";
}

export interface PredictionMarketsSection {
  available: boolean;
  reason: PredictionMarketReason | null;
  tier: string;
  candidates_considered?: number;
  markets_unrenderable?: number;
  matched_at?: string | null;
  matched_markets?: MatchedMarket[];
  market_series?: MarketSeriesBlock[];
}

/**
 * One BRACKET SERIES — a distribution the venue split across one contract per
 * range ("GDP <0.5%", "0.5-1.0%", ... ">3.0%").
 *
 * `complete` is decided by the series' OWN arithmetic: mutually exclusive,
 * collectively exhaustive brackets price to ~1.00 in total. `price_sum`
 * travels with the verdict so a reader can check it — four brackets summing
 * to 0.21 are visibly missing their siblings, and drawing them as if they
 * were the whole distribution is what made the market look like it expected
 * nothing.
 */
export interface MarketSeriesBlock {
  series_key: string;
  n_brackets: number;
  market_refs: (string | null)[];
  price_sum: number | null;
  complete: boolean | null;
  flagged_truncated: boolean;
}

/** The research backfill report (POST /research/backfill). */
export interface ResearchBackfillResult {
  event_id: number;
  event_key: string;
  as_of: string;
  fetched: boolean;
  reason?: ResearchBackfillReason | null;
  detail?: string;
  provider?: string;
  status?: "OK" | "PARTIAL" | "FAILED";
  queries_planned?: number;
  queries_executed?: number;
  results_considered?: number;
  results_accepted?: number;
  suppressed_suspicious?: number;
  skipped?: { purpose?: string; reason?: string }[];
  research_window?: ResearchWindow;
}

/** The prediction-market backfill report (POST /prediction-markets/backfill). */
export interface PredictionMarketBackfillResult {
  event_id: number;
  event_key: string;
  as_of: string;
  fetched: boolean;
  reason?: ResearchBackfillReason | null;
  detail?: string;
  provider?: string;
  queries?: number;
  candidates_considered?: number;
  markets_accepted?: number;
  snapshots_stored?: number;
  history_points_stored?: number;
  skipped?: { market_id?: string; stage?: string; reason?: string }[];
}
