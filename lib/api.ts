import type {
  Alert,
  AuditActorType,
  AuditEvent,
  BacktestParams,
  BacktestRecord,
  BacktestSummary,
  BarsResponse,
  BrokerReconcile,
  BrokerStatus,
  CheckExitsResult,
  EventBackfillResult,
  EventConfirmRequest,
  EventDetail,
  EventFeed,
  EventHistoryPayload,
  EventHorizonKey,
  EventMutationResult,
  EventFundamentalsContext,
  EventAnalysisHistory,
  EventAnalysisPayload,
  EventNewsBackfillResult,
  EventNewsPayload,
  EventPriceContext,
  EventRefreshResult,
  EventReplayPayload,
  EventType,
  MarketCalendarResponse,
  MarketCapabilities,
  MarketOverview,
  NewsNotAvailableDetail,
  NotConfiguredDetail,
  OpenOrdersResponse,
  OptionChainResponse,
  PortfolioBacktestRecord,
  OptionDirection,
  OptionsEod,
  OrderApproveResult,
  OrderCloseResult,
  OrderPreview,
  PlanApplyResult,
  PlanRevalidateResult,
  PlatformConfig,
  PortfolioRisk,
  PositionMonitorStatus,
  PositionRow,
  PositionStatus,
  ProviderConnections,
  ProviderConnectionsPutResult,
  ProviderConnectionsUpdate,
  Recommendation,
  RecommendationPromoteResult,
  RecommendationRefreshResult,
  RecommendationStatus,
  RelevanceTier,
  StrategyHealth,
  StressRunRequest,
  StressRunResponse,
  ValidationRunResponse,
  SymbolAnalysis,
  SymbolCatalyst,
  TradePlan,
  TradingPoolItem,
  TradingPoolPromoteResult,
  TradingStatus,
  WatchlistItem,
  WatchlistOverviewItem,
} from "./types";
// Phase I options types live in their own module (see types-options.ts): the
// names all belong to the one `/api/events/{id}/options*` endpoint family, so
// keeping them separate keeps that seam's renames off the shared type surface.
import type {
  EventOptionsBackfillResult,
  EventOptionsPayload,
} from "./types-options";
// Phase J timeline types, same rationale as the options module above: one
// endpoint's payload, one file, so its shape can be read in a single screen.
import type { EventTimelinePayload } from "./types-timeline";
// Catalyst research upgrade — web search + prediction markets. Same
// one-endpoint-one-module rule, and kept apart from the news module in
// particular because the two are DIFFERENT evidence layers: conflating a
// searched web document with a structured-news article is exactly the
// mistake the News tab's source filters exist to prevent.
import type {
  PredictionMarketBackfillResult,
  PredictionMarketsSection,
  ResearchBackfillResult,
  WebResearchSection,
} from "./types-research";
// Phase G macro types — same rationale again: the `/macro` payload is
// assembled from four independent government sources and reads as one shape.
import type {
  EventMacroBackfillResult,
  EventMacroPayload,
} from "./types-macro";
// Phase H Fed types — the `/fed` payload is assembled from the Federal
// Reserve's own documents and reads as one shape; same one-endpoint-one-module
// rule as the macro and timeline modules above.
import type {
  EventFedBackfillResult,
  EventFedPayload,
} from "./types-fed";
// Phase K event-risk types — same one-endpoint-one-module rule. Kept apart
// from the options module in particular because the two payloads use OPPOSITE
// percent conventions (percent numbers here, fractions there), and a shared
// module would eventually let one seam's formatter reach the other's numbers.
import type { EventRiskPayload } from "./types-event-risk";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  /** Structured `detail` body when the server sent one (e.g. approve 422 embeds a preview). */
  detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/* ------------------------------------------------ not-configured (503) helpers
 *
 * the configured market-data provider is the only price source. When MARKET_DATA_PROVIDER (or LLM_PROVIDER,
 * or the BROKER) is unset the server refuses to invent numbers and answers 503
 * with {"detail": {"code": ..., "message": ...}}. These helpers are the ONLY
 * sanctioned way for a surface to detect that state — never string-match a
 * provider name, and never substitute a placeholder number.
 *
 * The broker code extends the same rule to EXECUTION: with no broker the server
 * places no order, and the UI must say so instead of falling back to the
 * internal paper simulator. A simulated fill labelled as a broker fill is
 * fabricated data.
 */

/** Narrow an ApiError's `detail` to the structured not-configured body. */
export function notConfiguredDetail(error: unknown): NotConfiguredDetail | null {
  if (!(error instanceof ApiError) || error.status !== 503) return null;
  const d = error.detail;
  if (typeof d !== "object" || d === null) return null;
  const { code, message } = d as { code?: unknown; message?: unknown };
  if (
    code !== "MARKET_DATA_NOT_CONFIGURED" &&
    code !== "LLM_NOT_CONFIGURED" &&
    code !== "BROKER_NOT_CONFIGURED"
  ) {
    return null;
  }
  return { code, message: typeof message === "string" ? message : "" };
}

/** True when the error is the market-data 503 (status 503 + the code field). */
export function isMarketDataNotConfigured(error: unknown): boolean {
  return notConfiguredDetail(error)?.code === "MARKET_DATA_NOT_CONFIGURED";
}

/** True when the error is the LLM 503 (status 503 + the code field). */
export function isLlmNotConfigured(error: unknown): boolean {
  return notConfiguredDetail(error)?.code === "LLM_NOT_CONFIGURED";
}

/**
 * True when the error is the broker 503 (status 503 + the code field) — the
 * server placed NO order. Never treat this as a failed fill or retry it against
 * the internal simulator.
 */
export function isBrokerNotConfigured(error: unknown): boolean {
  return notConfiguredDetail(error)?.code === "BROKER_NOT_CONFIGURED";
}

/** The server's own explanation, for rendering verbatim in the NotConfigured panel. */
export function notConfiguredMessage(error: unknown): string | null {
  const d = notConfiguredDetail(error);
  return d == null ? null : d.message;
}

/* ------------------------------------------------ news-not-available (503, Phase 8)
 *
 * Distinct from the *_NOT_CONFIGURED family: a market-data provider IS
 * configured, but its subscribed Massive plan does not include the news
 * endpoint — so no grounded recommendation can be generated. The server
 * refuses to fall back to ungrounded output, and the UI must say so rather
 * than render the generic red failure or the not-configured panel.
 */

/** Narrow an ApiError's `detail` to the NEWS_NOT_AVAILABLE 503 body. */
export function newsNotAvailableDetail(error: unknown): NewsNotAvailableDetail | null {
  if (!(error instanceof ApiError) || error.status !== 503) return null;
  const d = error.detail;
  if (typeof d !== "object" || d === null) return null;
  const { code, message } = d as { code?: unknown; message?: unknown };
  if (code !== "NEWS_NOT_AVAILABLE") return null;
  return { code, message: typeof message === "string" ? message : "" };
}

/** True when the error is the news-plan 503 (status 503 + the code field). */
export function isNewsNotAvailable(error: unknown): boolean {
  return newsNotAvailableDetail(error) != null;
}

/** The server's own explanation, for rendering verbatim in the news panel. */
export function newsNotAvailableMessage(error: unknown): string | null {
  const d = newsNotAvailableDetail(error);
  return d == null ? null : d.message;
}

/* --------------------------------------------- analysis-not-found (404, Phase F)
 *
 * NOT an error state. `GET /api/events/{id}/analysis` never calls the model,
 * so "nothing stored yet" is what EVERY event looks like before the user
 * asks for one. The 404 carries {code:"ANALYSIS_NOT_FOUND"} precisely so the
 * tab can tell it apart from a genuine failure and render the call-to-action
 * instead of a red banner. Detect it with this, never by matching a message.
 */

/** True when the error is the analysis 404 (status 404 + the code field). */
export function isAnalysisNotFound(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 404) return false;
  const d = error.detail;
  if (typeof d !== "object" || d === null) return false;
  return (d as { code?: unknown }).code === "ANALYSIS_NOT_FOUND";
}

/**
 * Retry predicate for market-data-dependent queries: a 404 (not on the
 * watchlist) and a 503 (provider unconfigured) are both permanent for this
 * render — retrying only delays the honest empty state.
 *
 * `error` is typed `Error` (not `unknown`) so TanStack still infers `TError`
 * as `Error` at the call sites; widening it here would make every
 * `query.error` on those queries `unknown`.
 */
export function retryUnlessTerminal(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && (error.status === 404 || error.status === 503)) return false;
  return failureCount < 1;
}

/**
 * The wire contract this build was written against.
 *
 * The backend ships from its own repository and updates independently, so the
 * two halves can legitimately be at different versions. That mismatch is
 * otherwise INVISIBLE: a field the API stopped sending reads as `undefined`
 * in TypeScript — the type checker cannot catch it — and the symptom a reader
 * sees is an empty panel rather than an error.
 *
 * Bumping this is a deliberate act, done when the UI is updated for a new
 * major API version.
 */
export const EXPECTED_API_VERSION = "1";

/** Set once the first response arrives; `null` until then. */
let observedApiVersion: string | null = null;

export function apiVersionMismatch(): { expected: string; observed: string } | null {
  if (observedApiVersion == null) return null;
  const observedMajor = observedApiVersion.split(".")[0];
  return observedMajor === EXPECTED_API_VERSION
    ? null
    : { expected: EXPECTED_API_VERSION, observed: observedApiVersion };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  // Recorded on EVERY response, including errors: a 404 caused by a moved
  // route is exactly the case this is meant to explain.
  //
  // Guarded because `headers` is optional on a hand-built Response: several
  // component tests stub fetch with a plain object, and a version probe has no
  // business turning a passing test — or a proxy that strips headers — into a
  // TypeError. An unreadable version is simply an unknown one.
  const version = res.headers?.get?.("X-API-Version");
  if (version) observedApiVersion = version;
  if (!res.ok) {
    let message = res.statusText;
    let detail: unknown;
    try {
      const body = await res.json();
      detail = body.detail;
      message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, message, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  watchlist: {
    list: () => request<WatchlistItem[]>("/api/watchlist"),
    add: (ticker: string, note = "") =>
      request<WatchlistItem>("/api/watchlist", {
        method: "POST",
        body: JSON.stringify({ ticker, note }),
      }),
    remove: (ticker: string) =>
      request<void>(`/api/watchlist/${ticker}`, { method: "DELETE" }),
    analysis: (ticker: string) =>
      request<SymbolAnalysis>(`/api/watchlist/${encodeURIComponent(ticker)}/analysis`),
    /** Most recent `limit` daily OHLCV bars (10..600, server default 250), oldest first. */
    bars: (ticker: string, limit?: number) =>
      request<BarsResponse>(
        `/api/watchlist/${encodeURIComponent(ticker)}/bars${limit != null ? `?limit=${limit}` : ""}`,
      ),
    /**
     * §34 read-only research chain (no audit event). `direction` defaults to
     * AUTO server-side, so it is only sent when explicitly non-AUTO.
     */
    options: (ticker: string, direction?: OptionDirection) =>
      request<OptionChainResponse>(
        `/api/watchlist/${encodeURIComponent(ticker)}/options${
          direction != null && direction !== "AUTO" ? `?direction=${direction}` : ""
        }`,
      ),
    /** Free-tier EOD options reference (contracts + previous-day bars) —
     *  what Massive Options Basic serves when the chain snapshot is
     *  plan-gated. Day-cached server-side. */
    optionsEod: (ticker: string) =>
      request<OptionsEod>(`/api/watchlist/${encodeURIComponent(ticker)}/options/eod`),
    overview: () => request<WatchlistOverviewItem[]>("/api/watchlist/overview"),
  },
  backtests: {
    run: (ticker: string, params?: Partial<BacktestParams>, instruments?: string[]) =>
      request<BacktestRecord>("/api/backtests", {
        method: "POST",
        body: JSON.stringify({
          ticker,
          ...(params ? { params } : {}),
          ...(instruments ? { instruments } : {}),
        }),
      }),
    portfolio: {
      run: (
        tickers?: string[],
        params?: Partial<BacktestParams>,
        instruments?: string[],
        controls?: {
          max_gross_pct?: number;
          cash_floor_pct?: number;
          max_positions?: number | null;
        },
      ) =>
        request<PortfolioBacktestRecord>("/api/backtests/portfolio", {
          method: "POST",
          body: JSON.stringify({
            ...(tickers ? { tickers } : {}),
            ...(params ? { params } : {}),
            ...(instruments ? { instruments } : {}),
            ...(controls ?? {}),
          }),
        }),
      list: (limit?: number) =>
        request<PortfolioBacktestRecord[]>(
          `/api/backtests/portfolio${limit != null ? `?limit=${limit}` : ""}`,
        ),
      get: (id: number) =>
        request<PortfolioBacktestRecord>(`/api/backtests/portfolio/${id}`),
    },
    list: (ticker?: string, limit?: number) => {
      const qs = new URLSearchParams();
      if (ticker) qs.set("ticker", ticker);
      if (limit != null) qs.set("limit", String(limit));
      const q = qs.toString();
      return request<BacktestSummary[]>(`/api/backtests${q ? `?${q}` : ""}`);
    },
    get: (id: number) => request<BacktestRecord>(`/api/backtests/${id}`),
  },
  tradingPool: {
    list: () => request<TradingPoolItem[]>("/api/trading-pool"),
    /**
     * §4.3 promote — the server evaluates the promotion checks (MIN_HISTORY,
     * BACKTEST_COMPLETED, BACKTEST_TRADES, LIQUIDITY) in order. All passed (or
     * acknowledgeRisks true) -> 201 with promotion_checks + risks_acknowledged;
     * any failure without acknowledgement -> 422 whose `detail` is a
     * PromotionCheckErrorDetail. Either way the TRADING_POOL_ADD audit event
     * permanently records the checks and the acknowledged flag (§38).
     */
    promote: (ticker: string, acknowledgeRisks = false) =>
      request<TradingPoolPromoteResult>("/api/trading-pool", {
        method: "POST",
        body: JSON.stringify({
          ticker,
          ...(acknowledgeRisks ? { acknowledge_risks: true } : {}),
        }),
      }),
    toggle: (ticker: string, enabled: boolean) =>
      request<TradingPoolItem>(`/api/trading-pool/${ticker}/trading`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    remove: (ticker: string) =>
      request<void>(`/api/trading-pool/${ticker}`, { method: "DELETE" }),
  },
  trading: {
    status: () => request<TradingStatus>("/api/trading/status"),
    pause: (reason: string) =>
      request<TradingStatus>("/api/trading/pause", {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    resume: () =>
      request<TradingStatus>("/api/trading/resume", { method: "POST" }),
  },
  market: {
    overview: () => request<MarketOverview>("/api/market/overview"),
    /**
     * §16 data-plan capabilities — PROBED live against the provider's real
     * API (never assumed from configuration), cached ~5 min server-side.
     * 503 MARKET_DATA_NOT_CONFIGURED when no provider is configured; a
     * probe-less provider (the stub) answers `capabilities: null` + message.
     */
    capabilities: (refresh = false) =>
      request<MarketCapabilities>(
        `/api/market/capabilities${refresh ? "?refresh=true" : ""}`,
      ),
  },
  portfolio: {
    risk: () => request<PortfolioRisk>("/api/portfolio/risk"),
  },
  risk: {
    /**
     * Phase D §26/§51 — run ONE user-defined hypothetical scenario against
     * the current book and return its row (same shape as a catalogue row).
     *
     * This is a READ of the book under a hypothesis: it writes NO audit
     * event (the platform's read views never do), though the server does
     * persist the stress_runs row so the scenario has a history. 422 when a
     * field is outside its documented range — the form mirrors those ranges
     * client-side so the user is warned BEFORE the round trip, never
     * instead of it.
     */
    stressRun: (body: StressRunRequest) =>
      request<StressRunResponse>("/api/risk/stress/run", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /**
     * Phase E §42/§43 — re-run the walk-forward VaR/ES backtests over the
     * current book P&L series and return the fresh rows.
     *
     * Like the stress run this is a READ that PERSISTS: it writes the
     * `risk_model_backtests` rows so the track record accrues, but no audit
     * event (the platform's read views never write one). It takes no body —
     * the windows, confidence grid and minimum forecast count are documented
     * server-side parameters, not user input, so there is nothing here to
     * validate client-side and no 422 to mirror.
     *
     * Normally this runs itself once a day with the scheduled snapshot; the
     * button exists so a user need not wait for tomorrow to see the effect
     * of a fresh window.
     */
    validationRun: () =>
      request<ValidationRunResponse>("/api/risk/validation/run", {
        method: "POST",
      }),
  },
  orders: {
    /**
     * §26 — every NON-terminal order (PENDING_SUBMIT / ACCEPTED /
     * PARTIALLY_FILLED), oldest first. Local rows only: never needs a broker
     * and never 503s. Feeds the positions page's PENDING_UPDATE state.
     */
    open: () => request<OpenOrdersResponse>("/api/orders/open"),
    preview: (ticker: string, quantity?: number) =>
      request<OrderPreview>("/api/orders/preview", {
        method: "POST",
        body: JSON.stringify(quantity != null ? { ticker, quantity } : { ticker }),
      }),
    /**
     * Approve & execute a paper BUY. The server re-runs the FULL gate chain
     * (client previews are never trusted) — a 422 embeds the fresh preview as
     * OrderApproveErrorDetail; 409 means an open position already exists (no
     * pyramiding in V1). `clientOrderId` is an idempotency key (§42): the same
     * key returns the existing order instead of filling twice.
     */
    approve: (ticker: string, quantity?: number, clientOrderId?: string) =>
      request<OrderApproveResult>("/api/orders/approve", {
        method: "POST",
        body: JSON.stringify({
          ticker,
          ...(quantity != null ? { quantity } : {}),
          ...(clientOrderId != null ? { client_order_id: clientOrderId } : {}),
        }),
      }),
    /**
     * Close (fully or partially) a paper position. Allowed even while global
     * trading is paused — closing reduces risk (§18 risk-priority).
     */
    close: (ticker: string, quantity?: number, reason?: string) =>
      request<OrderCloseResult>("/api/orders/close", {
        method: "POST",
        body: JSON.stringify({
          ticker,
          ...(quantity != null ? { quantity } : {}),
          ...(reason != null ? { reason } : {}),
        }),
      }),
  },
  /** LLM catalyst context (upgrade §11/§38 — Phase E): stored
   *  interpretation + cited articles; read-only, never a live LLM call. */
  catalyst: (ticker: string) =>
    request<SymbolCatalyst>(`/api/watchlist/${ticker}/catalyst`),
  /** Research trade plans (upgrade §19/§40 — Phase D). */
  plans: {
    /** Run the §16 research chain and persist the plan (watchlist-gated,
     *  NOT pool-gated — §15). NO TRADE verdicts persist too (§17). */
    generate: (ticker: string, quantity?: number) =>
      request<TradePlan>("/api/plans/generate", {
        method: "POST",
        body: JSON.stringify(quantity != null ? { ticker, quantity } : { ticker }),
      }),
    list: (ticker?: string) =>
      request<TradePlan[]>(
        ticker ? `/api/plans?ticker=${encodeURIComponent(ticker)}` : "/api/plans",
      ),
    get: (id: number) => request<TradePlan>(`/api/plans/${id}`),
    /** §19 Apply: plan → ACTIVE, symbol → Trading Pool (trading stays
     *  DISABLED), never an order. 422 embeds failed §4.3 promotion checks
     *  until acknowledged. */
    apply: (id: number, acknowledgeRisks = false) =>
      request<PlanApplyResult>(`/api/plans/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({ acknowledge_risks: acknowledgeRisks }),
      }),
    cancel: (id: number) =>
      request<TradePlan>(`/api/plans/${id}/cancel`, { method: "POST" }),
    /** §42 "Recompute": re-run the research chain now with the plan's exact
     *  parameters; returns a NEW GENERATED plan beside the old one. */
    revalidate: (id: number) =>
      request<PlanRevalidateResult>(`/api/plans/${id}/revalidate`, {
        method: "POST",
      }),
  },
  broker: {
    /**
     * Read-only broker state. Deliberately NOT a 503 when no broker is set —
     * "not configured" is a reportable state, and the UI needs it to disable
     * execution controls BEFORE the user clicks into a guaranteed 503.
     * `mode` is "paper" or null: the adapter is paper-only and refuses any
     * non-paper base URL, so live trading is unreachable by configuration.
     */
    status: () => request<BrokerStatus>("/api/broker/status"),
    /**
     * Broker truth vs local truth (§18). Any mismatch pauses trading
     * automatically — the broker is authoritative about what actually exists,
     * so the system stops rather than acting on a stale local view.
     */
    reconcile: () => request<BrokerReconcile>("/api/broker/reconcile"),
  },
  positions: {
    list: (status?: PositionStatus | "ALL") =>
      request<PositionRow[]>(`/api/positions${status ? `?status=${status}` : ""}`),
    checkExits: () =>
      request<CheckExitsResult>("/api/positions/check-exits", { method: "POST" }),
    /** Status of the automated exit-sweep monitor (read-only). */
    monitorStatus: () =>
      request<PositionMonitorStatus>("/api/positions/monitor"),
  },
  /**
   * Event registry (§5-§13). Unlike the market-data surfaces, NONE of these
   * 503 when no calendar provider is configured: the feed answers 200 with
   * an empty list plus a `capabilities` block explaining why. That block is
   * the honest answer, so the UI must render it rather than a failure state.
   */
  events: {
    /**
     * The catalyst feed, already sorted server-side by (§12 relevance tier,
     * scheduled_at). An unknown horizon or a malformed custom range is a 422
     * — a client bug, deliberately not a silent empty list.
     */
    list: (params?: {
      horizon?: EventHorizonKey;
      /** Required (with `end`) when horizon is "custom"; ISO dates read as ET. */
      start?: string;
      end?: string;
      types?: EventType[];
      tickers?: string[];
      /** Default true. False hides DERIVED dates that no source confirmed. */
      includeEstimated?: boolean;
      /** Default false — a canceled event is history, not a catalyst. */
      includeCanceled?: boolean;
      relevance?: RelevanceTier[];
      /**
       * Default false. True attaches the §54 `summary` block to each event.
       * Opt-in because it costs the server extra reads per feed, and because
       * a payload that ALWAYS carried the block would leave a caller no way
       * to distinguish "no analysis" from "did not ask".
       */
      summaries?: boolean;
    }) => {
      const qs = new URLSearchParams();
      if (params?.horizon) qs.set("horizon", params.horizon);
      if (params?.start) qs.set("start", params.start);
      if (params?.end) qs.set("end", params.end);
      if (params?.types?.length) qs.set("types", params.types.join(","));
      if (params?.tickers?.length) qs.set("tickers", params.tickers.join(","));
      if (params?.includeEstimated != null) {
        qs.set("include_estimated", String(params.includeEstimated));
      }
      if (params?.includeCanceled != null) {
        qs.set("include_canceled", String(params.includeCanceled));
      }
      if (params?.relevance?.length) qs.set("relevance", params.relevance.join(","));
      // Only sent when true: an explicit `summaries=false` and an omitted
      // flag mean the same thing to the server, and the shorter URL keeps
      // the react-query cache key and the request line in agreement.
      if (params?.summaries) qs.set("summaries", "true");
      const q = qs.toString();
      return request<EventFeed>(`/api/events${q ? `?${q}` : ""}`);
    },
    /** One event plus its §15 previous comparable and the reason it compares. */
    get: (eventId: number) => request<EventDetail>(`/api/events/${eventId}`),
    /**
     * Phase E1 price context (§19, §31, §32, §64): pre-event positioning plus
     * the measured reaction to every previous comparable event.
     *
     * `asOf` is the LOOK-AHEAD GATE, not a display filter — the server keeps
     * only bars that had actually closed at that instant, so passing a past
     * timestamp reproduces what was knowable then. Omit it for "now". A
     * future `as_of` is a 422 by design; an event with no ticker (macro,
     * Fed) answers 200 with {available: false, reason: "no_ticker"}.
     */
    priceContext: (eventId: number, asOf?: string) =>
      request<EventPriceContext>(
        `/api/events/${eventId}/price-context${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * Phase E2 point-in-time fundamentals (§28, §29, §30, §33, §58).
     *
     * Same look-ahead gate as `priceContext`, but keyed on the filing's
     * `acceptance_datetime`: a quarter that ENDED before `asOf` but was not
     * FILED until after it is excluded, because nobody could have traded on
     * it. Omit `asOf` for "now". A macro/Fed event with no ticker answers
     * 200 with {available: false, reason: "no_ticker"}.
     */
    fundamentals: (eventId: number, asOf?: string) =>
      request<EventFundamentalsContext>(
        `/api/events/${eventId}/fundamentals${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /** Stored exchange sessions; defaults to ±30 NY days around today. */
    calendar: (start?: string, end?: string) => {
      const qs = new URLSearchParams();
      if (start) qs.set("start", start);
      if (end) qs.set("end", end);
      const q = qs.toString();
      return request<MarketCalendarResponse>(`/api/events/calendar${q ? `?${q}` : ""}`);
    },
    /**
     * Force ONE ingestion tick, bypassing every provider's re-fetch cadence.
     * Identity is still the natural key, so a refresh that finds the same
     * events creates zero rows — safe to press repeatedly.
     */
    refresh: () =>
      request<EventRefreshResult>("/api/events/refresh", { method: "POST" }),
    /**
     * USER-confirm a date (§7, §78). Goes through the SAME merge rules every
     * provider does, with source USER (rank 0) — authority by data, not a
     * bypass, which is what appends the replaced value to revision_history.
     */
    confirm: (eventId: number, body: EventConfirmRequest) =>
      request<EventMutationResult>(`/api/events/${eventId}/confirm`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /** USER-cancel (§7: CANCELED only ever arrives explicitly, never inferred
     *  from an event vanishing from a provider's feed). */
    cancel: (eventId: number) =>
      request<EventMutationResult>(`/api/events/${eventId}/cancel`, {
        method: "POST",
      }),
    /**
     * Phase C event replay (§20): what was knowable before the release, the
     * release itself, the MINUTE-BY-MINUTE immediate reaction and the daily
     * subsequent one.
     *
     * Same look-ahead gate as `priceContext`, now applied to minute bars too:
     * only bars with `ts <= as_of` are measured, so a replay pulled at 09:45
     * legitimately has no +60m mark. This GET NEVER FETCHES from the provider
     * — it reads bars already stored, so a page load can never spend a
     * provider call per event. Backfilling is an explicit USER action; see
     * `replayBackfill`.
     */
    replay: (eventId: number, asOf?: string) =>
      request<EventReplayPayload>(
        `/api/events/${eventId}/replay${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * Phase C §60 history table: the last 12 CONFIRMED past events of this
     * ticker/type, with the columns the spec names. `intraday_30m` is filled
     * only for events whose minute window was already backfilled — the table
     * never triggers a fetch of its own (see `historyBackfill`).
     */
    history: (eventId: number, asOf?: string) =>
      request<EventHistoryPayload>(
        `/api/events/${eventId}/history${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * USER action: fetch and store the minute-bar window for ONE event.
     *
     * Deliberately a POST and deliberately not automatic. Minute bars are the
     * expensive axis of this platform (one event window is a full trading
     * day of 1-minute bars per symbol), so the user asks for them per event
     * rather than a page load spending twelve provider calls unprompted.
     */
    replayBackfill: (eventId: number) =>
      request<EventBackfillResult>(`/api/events/${eventId}/replay/backfill`, {
        method: "POST",
      }),
    /**
     * USER action: backfill the minute windows of the last N past events.
     * `last` is BOUNDED server-side (default 4, max 12) — the bound is the
     * point, not a formality.
     */
    historyBackfill: (eventId: number, last?: number) =>
      request<EventBackfillResult>(
        `/api/events/${eventId}/history/backfill${last != null ? `?last=${last}` : ""}`,
        { method: "POST" },
      ),
    /**
     * Phase D news evidence (§21-§27, §59): the deduped, clustered and scored
     * news window behind this event.
     *
     * Same look-ahead gate as `priceContext`, applied to `published_at`: an
     * article published after `asOf` is EXCLUDED from the analysis (§96), so
     * a past as-of reproduces the story as it actually stood then rather
     * than one written with hindsight. Omit `asOf` for "now".
     *
     * Like `replay`, this GET NEVER FETCHES from a news provider — it reads
     * stored articles, so scrolling the tab can never spend a provider call.
     * Filling the window is the explicit USER action `newsBackfill`.
     *
     * A macro/Fed event with no ticker answers 200 with
     * {available: false, reason: "no_ticker"} — a result, not an error.
     */
    news: (eventId: number, asOf?: string) =>
      request<EventNewsPayload>(
        `/api/events/${eventId}/news${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * USER action: fetch and store this event's news window from every
     * configured provider.
     *
     * Deliberately a POST and deliberately not automatic. It is throttled
     * per ticker server-side, so pressing it twice is safe and the second
     * press answers `fetched:false` with the throttle as its reason — which
     * the caller must report as a state, never as a failure.
     */
    newsBackfill: (eventId: number) =>
      request<EventNewsBackfillResult>(`/api/events/${eventId}/news/backfill`, {
        method: "POST",
      }),
    /**
     * Stored external web research for this event, as of an instant.
     *
     * FREE AND POLL-SAFE. Like every other event GET it reads stored rows and
     * never reaches a search provider — which matters more here than
     * anywhere else, because search is metered and a tab that searched on
     * every React Query refresh would bill the operator for scrolling.
     * `researchBackfill` is the explicit USER action that spends.
     *
     * Honest states, all 200: `NEVER_RUN` (nobody has researched this event)
     * and `NO_EVIDENCE_ACCEPTED` (a run happened and admitted nothing) are
     * DIFFERENT answers and must render differently.
     */
    research: (eventId: number, asOf?: string) =>
      request<WebResearchSection>(
        `/api/events/${eventId}/research${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * USER action: run this event's bounded external web research.
     *
     * THE ONLY PATH THAT SPENDS SEARCH QUOTA. Throttled per event
     * server-side, so a second press answers `fetched:false` with
     * `RECENTLY_REFRESHED` — a state to report, never an error. An
     * unconfigured provider answers `NOT_CONFIGURED` the same way.
     */
    researchBackfill: (eventId: number) =>
      request<ResearchBackfillResult>(`/api/events/${eventId}/research/backfill`, {
        method: "POST",
      }),
    /**
     * Stored prediction-market matches and pricing, as of an instant.
     *
     * Every price is MARKET-IMPLIED — what the contract costs, never a claim
     * about the outcome's real likelihood. Each entry carries its depth
     * facts so a thin market is not read with a deep market's authority.
     *
     * `NO_RELEVANT_PREDICTION_MARKET` is a SUCCESS: matching ran and honestly
     * accepted nothing, which is the common outcome for most catalysts.
     */
    predictionMarkets: (eventId: number, asOf?: string) =>
      request<PredictionMarketsSection>(
        `/api/events/${eventId}/prediction-markets${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * USER action: discover, match and observe this event's markets.
     *
     * READ-ONLY against the venue — public discovery, pricing and history.
     * There is no wallet, no order and no position anywhere behind this
     * call, and no endpoint exists that could place one.
     */
    predictionMarketsBackfill: (eventId: number) =>
      request<PredictionMarketBackfillResult>(
        `/api/events/${eventId}/prediction-markets/backfill`,
        { method: "POST" },
      ),
    /**
     * Phase F §46 evidence bundle — the DATA/QUANT half of the analysis, with
     * NO language model involved.
     *
     * Same look-ahead gate as every other event GET. Worth having as its own
     * endpoint rather than only inside the analysis payload: the evidence is
     * what the platform actually knows, and it stays readable when the model
     * is unconfigured, failing, or simply not something the user wants to
     * spend a call on.
     */
    evidence: (eventId: number, asOf?: string) =>
      request<EventAnalysisPayload>(
        `/api/events/${eventId}/evidence${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * Phase F §48 stored analysis — the LATEST one on file for this event.
     *
     * This GET NEVER CALLS THE MODEL. Generating is an explicit user action
     * (`generateAnalysis`), so opening the tab can never spend an LLM call;
     * with nothing stored the server answers 404 {code:"ANALYSIS_NOT_FOUND"},
     * which the tab must render as its ordinary first-visit state — a
     * call-to-action — and never as an error.
     */
    analysis: (eventId: number, asOf?: string) =>
      request<EventAnalysisPayload>(
        `/api/events/${eventId}/analysis${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * USER action: generate (or reuse) the analysis for this event.
     *
     * `force` is the difference between "give me the answer" and "spend a
     * call". Without it the server returns the stored row when the evidence
     * bundle has not changed (`cached: true`) — the bundle's digest, not a
     * clock, is what makes a cached answer still true.
     *
     * 503 {code:"LLM_NOT_CONFIGURED"} when no provider is connected: detect
     * it with `isLlmNotConfigured`, never by string-matching a message. A
     * provider that errors mid-call is NOT an error here — it comes back 200
     * with status FAILED and the bundle intact.
     */
    generateAnalysis: (eventId: number, opts?: { asOf?: string; force?: boolean }) => {
      const qs = new URLSearchParams();
      if (opts?.asOf) qs.set("as_of", opts.asOf);
      if (opts?.force != null) qs.set("force", String(opts.force));
      const q = qs.toString();
      return request<EventAnalysisPayload>(
        `/api/events/${eventId}/analysis${q ? `?${q}` : ""}`,
        { method: "POST" },
      );
    },
    /** Phase F §69 event memory: every analysis stored for this event, summarised. */
    analyses: (eventId: number) =>
      request<EventAnalysisHistory>(`/api/events/${eventId}/analyses`),
    /**
     * Phase I options / implied move (§18, §36-§37): what the option market
     * priced for this event, and what comparable events actually delivered.
     *
     * Two DIFFERENT measurements can come back in `current.basis`, and the
     * caller must render which one it got: a LIVE_CHAIN_SNAPSHOT is the
     * current chain's mids for an event still ahead, while a
     * HISTORICAL_DAILY_CLOSE_APPROXIMATION is a straddle reconstructed from
     * the two legs' daily CLOSES — an approximation, since a close is not a
     * mid. They share units and mean different things.
     *
     * Like `replay` and `news`, this GET NEVER FETCHES option history — it
     * reads stored bars, so scrolling events spends no provider calls. A leg
     * with no bars answers 200 with `status: "NO_DATA"` and a reason; nothing
     * is synthesised from a neighbouring strike.
     */
    optionsContext: (eventId: number, asOf?: string) =>
      request<EventOptionsPayload>(
        `/api/events/${eventId}/options${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * USER action: fetch and store the option legs' daily bars for ONE event,
     * then recompute its straddle.
     *
     * Deliberately a POST and deliberately not automatic — option history is
     * fetched per contract leg (a call and a put, each its own OCC symbol),
     * so a page load that did this would spend two provider calls per event
     * scrolled past. A result with `stored_bars` 0 is a STATE with a reason
     * (no contracts existed at that expiry, the provider has no option
     * history), never a failure and never a success.
     */
    backfillOptions: (eventId: number) =>
      request<EventOptionsBackfillResult>(`/api/events/${eventId}/options/backfill`, {
        method: "POST",
      }),
    /**
     * USER action: backfill the option straddles of the previous N comparable
     * events. `last` is BOUNDED server-side — the bound is the point, not a
     * formality, since each event costs two contract-leg fetches.
     */
    backfillOptionsHistory: (eventId: number, last?: number) =>
      request<EventOptionsBackfillResult>(
        `/api/events/${eventId}/options/history/backfill${last != null ? `?last=${last}` : ""}`,
        { method: "POST" },
      ),
    /**
     * Phase J §57 timeline — everything that happened between the PREVIOUS
     * comparable event and the as-of instant: material news developments,
     * fundamental filings, other registry events for the same ticker, and the
     * analyses this platform stored along the way.
     *
     * Same look-ahead gate as every other event GET, and the gate is the whole
     * point here: a timeline is a claim about what was knowable at a moment, so
     * an item stamped after `asOf` is excluded rather than greyed out. Omit
     * `asOf` for "now".
     *
     * Like `replay`, `news` and `optionsContext`, this GET NEVER FETCHES from a
     * provider — it reads stored rows, so opening the tab can never spend a
     * provider call. Filling the window is the explicit user action on the News
     * and History tabs, not a side effect of looking at it.
     */
    timeline: (eventId: number, asOf?: string) =>
      request<EventTimelinePayload>(
        `/api/events/${eventId}/timeline${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * Phase G §38-§41 — the government release behind a macro event: the
     * previous print's actuals, the scheduled next one, the run of prints
     * behind both, what the reference assets did when it last landed, and the
     * other prints and Fed speeches since.
     *
     * There is NO consensus and NO surprise in this payload, ever, and that is
     * a contract rather than a gap: the platform subscribes to no economic
     * estimate provider, so both fields arrive as explicit unavailable markers
     * (§33). Anything that renders this must print the marker rather than an
     * empty cell — a blank where a consensus belongs is read as a number by
     * every trader who has used any other macro screen.
     *
     * Like `timeline`, `replay`, `news` and `optionsContext`, this GET NEVER
     * FETCHES from a provider — it reads stored observations, stored Treasury
     * rows and stored daily bars, so opening the tab can never spend a
     * government API call against a rate limit measured in tens per day.
     * Filling those rows is `backfillMacro`, below. Same look-ahead gate as
     * every other event GET: omit `asOf` for "now".
     */
    macro: (eventId: number, asOf?: string) =>
      request<EventMacroPayload>(
        `/api/events/${eventId}/macro${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * USER action: fetch this release's series from the statistical agency,
     * the Treasury yield curve, and the reference assets' daily bars.
     *
     * The ONLY call in this family that spends anything. The unregistered BLS
     * quota is roughly 25 requests a day, which is why this is an explicit
     * button and not a page-load side effect: a `useQuery` on this endpoint
     * would exhaust the day's budget in one afternoon of browsing.
     */
    backfillMacro: (eventId: number) =>
      request<EventMacroBackfillResult>(`/api/events/${eventId}/macro/backfill`, {
        method: "POST",
      }),
    /**
     * Phase H §42-§45 — the Fed policy packet behind an FOMC or Fed-speech
     * event: the previous statement as published, a deterministic sentence
     * diff against the statement before it, the §43 dimensions reported
     * separately, the vote, the previous meeting's minutes, the speeches
     * since, and what markets did across EACH of the two windows that
     * afternoon.
     *
     * Two things are contracts rather than gaps in this payload. There is NO
     * HAWKISH/DOVISH SCORE (§43) — the dimensions arrive as separate reports
     * because a target range left unchanged beside materially changed forward
     * guidance is the configuration that matters most, and a scalar destroys
     * exactly that pair. And MARKET PRICING IS ALWAYS UNAVAILABLE (§42): the
     * platform subscribes to no fed funds futures feed, so the implied
     * probability of a cut arrives as an explicit unavailable marker with the
     * 2-year yield change offered beside it as a LABELLED proxy. Anything that
     * renders this must print both markers rather than an empty cell.
     *
     * The two reaction windows are separate keys (`statement` 14:00-14:30 ET,
     * `press_conference` 14:30-15:30 ET) and must never be summed — the
     * classic FOMC afternoon is a statement the market reads one way and a
     * press conference that reverses it inside the hour.
     *
     * Like every other event GET, this NEVER FETCHES: it reads stored Federal
     * Reserve documents and stored bars, so opening the tab can never spend a
     * request against federalreserve.gov. Filling those rows is `backfillFed`,
     * below. Omit `asOf` for "now"; a document released after the as-of
     * instant is invisible to the packet.
     */
    fed: (eventId: number, asOf?: string) =>
      request<EventFedPayload>(
        `/api/events/${eventId}/fed${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
    /**
     * USER action: download this meeting's Fed documents and the minute bars
     * around the previous decision.
     *
     * The ONLY call in this family that spends anything: it fetches the last
     * two FOMC statements, the previous meeting's minutes and the speeches
     * since from federalreserve.gov (with the platform's contact User-Agent,
     * as the Fed's access policy requires), and backfills the minute window
     * that lets the two reaction windows be told apart at all. An explicit
     * button rather than a page-load side effect, for the same reason as every
     * other backfill on this surface.
     */
    backfillFed: (eventId: number) =>
      request<EventFedBackfillResult>(`/api/events/${eventId}/fed/backfill`, {
        method: "POST",
      }),
    /**
     * Phase K §62-§67 event risk: the deterministic state assigned to this
     * event, the distribution of what previous comparable events delivered,
     * what the option market is charging for this one, and the §66 options
     * context around it.
     *
     * TWO contracts on this seam are worth stating at the call site, because
     * getting either wrong is silent rather than loud:
     *
     *  1. EVERY PERCENT HERE IS A PERCENT NUMBER (`8.8` = 8.8%), which is the
     *     OPPOSITE of `optionsContext`'s fractions (`0.088` = 8.8%). Format
     *     these with `components/catalysts/risk-format.fmtPctNumber`, never
     *     with `price-format.fmtRatioPct` — the two differ by exactly 100×.
     *  2. `enforcement` is "SHADOW" (§65). This layer computes caps only for a
     *     hypothetical verdict recorded beside the real one; it resizes no
     *     order, rejects none and blocks nothing. Any UI that renders this
     *     payload renders that fact with it.
     *
     * Same look-ahead gate as every other event GET, and like them this GET
     * NEVER FETCHES from a provider — it reads stored option metrics and
     * stored reaction history, so opening the Risk tab spends no provider
     * call. With neither an implied move nor one previous comparable event the
     * server answers 200 with `event_risk_state: "UNKNOWN"` and a reason —
     * an absence of evidence, deliberately NOT a low-risk verdict.
     */
    risk: (eventId: number, asOf?: string) =>
      request<EventRiskPayload>(
        `/api/events/${eventId}/risk${asOf ? `?as_of=${encodeURIComponent(asOf)}` : ""}`,
      ),
  },
  alerts: {
    /**
     * Newest-first severity-classified alerts (§29). `limit` 1..200, server
     * default 50. Read-only — fetching alerts writes no audit events.
     */
    list: (limit?: number) =>
      request<Alert[]>(`/api/alerts${limit != null ? `?limit=${limit}` : ""}`),
  },
  audit: {
    /** All provided filters combine with AND semantics on the server. */
    list: (entityId?: string, action?: string, actorType?: AuditActorType) => {
      const qs = new URLSearchParams();
      if (entityId) qs.set("entity_id", entityId);
      if (action) qs.set("action", action);
      if (actorType) qs.set("actor_type", actorType);
      const q = qs.toString();
      return request<AuditEvent[]>(`/api/audit${q ? `?${q}` : ""}`);
    },
    /** Sorted DISTINCT action values present in the audit table (for filter chips). */
    actions: () => request<string[]>("/api/audit/actions"),
  },
  recommendations: {
    /** Server default is PENDING when no status is given. */
    list: (status?: RecommendationStatus | "ALL") =>
      request<Recommendation[]>(
        `/api/recommendations${status ? `?status=${status}` : ""}`,
      ),
    /**
     * Generate from the configured provider; skips tickers already on the
     * Watchlist or already PENDING. Phase 8: the response carries a `news`
     * fetch summary, and the call 503s with NEWS_NOT_AVAILABLE when the
     * Massive plan lacks the news endpoint (alongside the existing LLM /
     * market-data not-configured 503s).
     */
    refresh: () =>
      request<RecommendationRefreshResult>("/api/recommendations/refresh", {
        method: "POST",
      }),
    dismiss: (id: number) =>
      request<Recommendation>(`/api/recommendations/${id}/dismiss`, {
        method: "POST",
      }),
    /**
     * The ONLY recommendation→watchlist path — an explicit USER action. 409 if
     * the ticker is already on the watchlist or the row is not PENDING.
     */
    promote: (id: number) =>
      request<RecommendationPromoteResult>(`/api/recommendations/${id}/promote`, {
        method: "POST",
      }),
  },
  health: {
    strategy: () => request<StrategyHealth>("/api/health/strategy"),
  },
  config: {
    /** Read-only engine configuration (§44 rule 2 made visible); no secret material. */
    get: () => request<PlatformConfig>("/api/config"),
    providers: {
      /**
       * Runtime provider connections + stored-secret booleans. Secrets are
       * WRITE-ONLY: no response ever carries a secret value, only whether one
       * is stored (secrets_set).
       */
      get: () => request<ProviderConnections>("/api/config/providers"),
      /**
       * Update any subset — only present fields change; an empty string
       * DISCONNECTS a field. 422 on invalid provider names. The response may
       * carry `cash_adopted` when connecting the broker with an empty local
       * ledger adopted the real account's cash.
       */
      put: (update: ProviderConnectionsUpdate) =>
        request<ProviderConnectionsPutResult>("/api/config/providers", {
          method: "PUT",
          body: JSON.stringify(update),
        }),
    },
  },
};
