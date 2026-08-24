"use client";

/**
 * Matched prediction markets for one event (Catalyst research upgrade,
 * plan Phase 9). Embedded in the Evidence tab and summarised on Overview —
 * deliberately NOT a new tab, per the brief's "do not create redundant tabs
 * merely because new data exists".
 *
 * THE LANGUAGE RULE IS THE POINT OF THIS COMPONENT. Every number it renders
 * is what a contract COSTS, and it is labelled that way everywhere: heading,
 * value label, and caption. The words "true probability", "actual
 * probability" and "chance of" appear nowhere, and the relation badge says
 * whether this contract even measures the event (DIRECT) or merely something
 * the event influences (DERIVED / CONTEXT) — a 70c DERIVED contract is not a
 * 70% forecast of this catalyst, and the UI must never let it read as one.
 *
 * DEPTH IS SHOWN BESIDE PRICE, NEVER FOLDED INTO IT (Phase 23). Spread,
 * volume and liquidity render as their own facts, and an unknown one says
 * "unknown" rather than showing 0 — a thin market's price and a deep
 * market's price look different here on purpose.
 *
 * HONEST EMPTY STATES. "No sufficiently relevant prediction market was
 * found" (matching ran, accepted nothing — the common outcome) is a
 * DIFFERENT sentence from "never researched" and from "market metadata
 * unavailable". Each renders its own text.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/shared/Toast";
import { useT } from "@/lib/i18n";
import PredictionMarketBars from "./PredictionMarketBars";
import PriceMoveTimeline from "./PriceMoveTimeline";
import type {
  MarketRelation,
  MatchedMarket,
  PredictionMarketsSection,
} from "@/lib/types-research";

/** Relation → short human label. NOT_CLASSIFIED is a real, honest state. */
export function relationLabel(relation: MarketRelation, t: ReturnType<typeof useT>): string {
  switch (relation) {
    case "DIRECT":
      return t("Direct", "直接");
    case "DERIVED":
      return t("Derived", "衍生");
    case "CONTEXT":
      return t("Context", "背景");
    default:
      return t("Unclassified", "未分类");
  }
}

/** What the relation MEANS — rendered as help text, never implied by colour. */
export function relationHelp(relation: MarketRelation, t: ReturnType<typeof useT>): string {
  switch (relation) {
    case "DIRECT":
      return t(
        "This contract measures the event's own outcome.",
        "该合约直接衡量本次事件的结果。",
      );
    case "DERIVED":
      return t(
        "The event materially affects this contract, but the contract is not the event.",
        "事件会实质影响该合约，但合约本身并非该事件。",
      );
    case "CONTEXT":
      return t(
        "Broader backdrop related to the event, not a measure of it.",
        "与事件相关的宏观背景，而非对事件的衡量。",
      );
    default:
      return t(
        "No relation-defining wording was found for this event type.",
        "未找到与该事件类型相关的界定性表述。",
      );
  }
}

/**
 * The scope qualifier a non-DIRECT contract must carry beside its price.
 *
 * A DIRECT contract measures this event, so its price needs no caveat. A
 * DERIVED or CONTEXT one prices something the event merely influences, and
 * a bare "63%" next to a catalyst reads as that catalyst's odds — which is
 * exactly the misreading the relation vocabulary exists to prevent. Empty
 * string for DIRECT so callers can interpolate unconditionally.
 */
export function relationScopeNote(
  relation: MarketRelation,
  t: ReturnType<typeof useT>,
): string {
  if (relation === "DIRECT") return "";
  return t("on a related outcome", "针对相关结果");
}

/** A contract price as a percentage, or the honest unknown. */
export function pricingText(value: number | null | undefined, t: ReturnType<typeof useT>): string {
  if (value == null || !Number.isFinite(value)) {
    return t("unavailable", "不可用");
  }
  return `${(value * 100).toFixed(1)}%`;
}

/** A signed change in percentage POINTS — the honest unit for a price delta. */
export function changeText(value: number | null | undefined, t: ReturnType<typeof useT>): string {
  if (value == null || !Number.isFinite(value)) {
    return t("unavailable", "不可用");
  }
  const points = value * 100;
  const sign = points > 0 ? "+" : "";
  return `${sign}${points.toFixed(1)}pp`;
}

function DepthFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="pm-depth-fact">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function MarketRow({ market }: { market: MatchedMarket }) {
  const t = useT();
  const history = market.history ?? null;

  return (
    <li className="pm-market" data-testid="pm-market" data-relation={market.relation}>
      <div className="pm-market-head">
        <span className="badge dim" data-testid="pm-relation" title={relationHelp(market.relation, t)}>
          {relationLabel(market.relation, t)}
        </span>
        <span className="pm-question">{market.safe_question}</span>
      </div>

      <div className="pm-pricing">
        {/* The label is half the honesty: the number never stands alone. */}
        <span className="muted">
          {t("Market-implied pricing", "市场隐含定价")}
        </span>
        <strong data-testid="pm-implied">
          {pricingText(market.market_implied_probability, t)}
        </strong>
      </div>

      {history ? (
        <div className="pm-changes">
          <DepthFact label={t("1d", "1日")} value={changeText(history.change_1d, t)} />
          <DepthFact label={t("7d", "7日")} value={changeText(history.change_7d, t)} />
          <DepthFact
            label={t("Since previous event", "自上次事件")}
            value={changeText(history.change_since_previous_event, t)}
          />
        </div>
      ) : (
        <p className="muted" data-testid="pm-no-history">
          {t("Prediction-market history is unavailable.", "预测市场历史数据不可用。")}
        </p>
      )}

      {/* WHEN this contract changed its mind. The panel above says where the
          price is; this says when it got there, which is the question that
          leads to why. */}
      <PriceMoveTimeline moves={market.notable_moves ?? []} />

      {/* Depth facts, unfolded (Phase 23). Unknown says unknown. */}
      <div className="pm-depth">
        <DepthFact
          label={t("Spread", "价差")}
          value={
            market.spread == null
              ? t("unknown", "未知")
              : `${(market.spread * 100).toFixed(1)}pp`
          }
        />
        <DepthFact
          label={t("Volume", "成交量")}
          value={
            market.data_quality?.volume_known && market.volume != null
              ? market.volume.toLocaleString()
              : t("unknown", "未知")
          }
        />
        <DepthFact
          label={t("Liquidity", "流动性")}
          value={
            market.data_quality?.liquidity_known && market.liquidity != null
              ? market.liquidity.toLocaleString()
              : t("unknown", "未知")
          }
        />
      </div>

      <div className="pm-meta muted">
        <span>{market.provider}</span>
        {market.observed_at ? (
          <span data-testid="pm-observed">
            {t("observed", "观测于")} {market.observed_at}
          </span>
        ) : (
          <span>{t("no observation stored", "未存储观测数据")}</span>
        )}
      </div>

      {market.safe_resolution_criteria ? (
        <p className="pm-resolution muted">
          {t("Resolves:", "结算依据：")} {market.safe_resolution_criteria}
        </p>
      ) : null}
    </li>
  );
}

/**
 * The spending half, isolated exactly as ResearchPanel isolates its own:
 * only this component needs a query client and a toast host, so the market
 * list stays renderable on a bare surface.
 *
 * READ-ONLY AGAINST THE VENUE. This button discovers and observes public
 * pricing. There is no order, no wallet and no credential behind it, and no
 * endpoint exists that could add one.
 */
function RefreshMarketsButton({ eventId }: { eventId: number }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();

  const refresh = useMutation({
    mutationFn: () => api.events.predictionMarketsBackfill(eventId),
    onSuccess: (result) => {
      if (!result.fetched) {
        // Each declined state is a DIFFERENT answer, and the operator can
        // only act on the one they are actually in.
        const reason =
          result.reason === "NOT_CONFIGURED"
            ? t(
                "Prediction markets are not enabled — turn Polymarket on in Settings.",
                "未启用预测市场——请在设置中开启 Polymarket。",
              )
            : result.reason === "RECENTLY_REFRESHED"
              ? t("Markets were refreshed recently.", "预测市场最近已刷新。")
              : result.reason === "PROVIDER_UNAVAILABLE"
                ? t(
                    "The prediction-market venue could not be reached.",
                    "无法连接预测市场平台。",
                  )
                : (result.reason ?? t("Nothing was fetched.", "未获取到内容。"));
        toast("INFO", String(reason));
        return;
      }
      toast(
        "SUCCESS",
        result.reason === "PARTIAL_DISCOVERY"
          ? t(
              `Discovery was incomplete — ${result.candidates_considered ?? 0} candidate(s) seen, none accepted.`,
              `发现过程不完整——已查看 ${result.candidates_considered ?? 0} 个候选，未采纳任何一个。`,
            )
          : t(
              `Matched ${result.markets_accepted ?? 0} of ${result.candidates_considered ?? 0} candidate market(s).`,
              `已从 ${result.candidates_considered ?? 0} 个候选市场中匹配 ${result.markets_accepted ?? 0} 个。`,
            ),
      );
      qc.invalidateQueries({ queryKey: ["event-evidence", eventId] });
    },
    onError: (err: unknown) => {
      toast("CRITICAL", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <div className="wr-actions">
      <button
        type="button"
        className="btn"
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
        data-testid="pm-refresh"
      >
        {refresh.isPending
          ? t("Refreshing markets…", "正在刷新市场……")
          : t("Refresh prediction markets", "刷新预测市场")}
      </button>
      <span className="muted">
        {t(
          "Public read-only discovery and pricing — no trading credentials involved.",
          "公开只读的发现与定价——不涉及任何交易凭证。",
        )}
      </span>
    </div>
  );
}

export default function PredictionMarketsPanel({
  eventId,
  section,
}: {
  /** Omitted on read-only surfaces: without it the list renders and the
      spending button simply does not exist. */
  eventId?: number;
  section: PredictionMarketsSection | undefined;
}) {
  const t = useT();

  if (!section) {
    return null;
  }

  if (!section.available) {
    // Three DIFFERENT answers. Conflating them would tell the reader the
    // platform looked when it did not, or gave up when it simply found
    // nothing relevant.
    const text =
      section.reason === "NO_RELEVANT_PREDICTION_MARKET"
        ? t(
            "No sufficiently relevant prediction market was found.",
            "未找到足够相关的预测市场。",
          )
        : section.reason === "MARKET_METADATA_UNAVAILABLE"
          ? t(
              "Matched markets could not be rendered — market metadata is unavailable.",
              "已匹配的市场无法呈现——市场元数据不可用。",
            )
          : t(
              "Prediction markets have not been researched for this event yet.",
              "尚未针对本次事件研究预测市场。",
            );
    return (
      <div>
        {eventId != null ? <RefreshMarketsButton eventId={eventId} /> : null}
        <p className="muted" data-testid="pm-unavailable" data-reason={section.reason ?? ""}>
          {text}
        </p>
      </div>
    );
  }

  const markets = section.matched_markets ?? [];
  return (
    <div className="pm-panel" data-testid="pm-panel">
      {eventId != null ? <RefreshMarketsButton eventId={eventId} /> : null}
      {/* WHERE THE MONEY IS, before the per-contract detail. The list below
          is the right form for auditing ONE contract and the wrong form for
          comparing them, which is the reader's first question. */}
      <PredictionMarketBars markets={markets} series={section.market_series ?? []} />
      <ul className="pm-markets">
        {markets.map((m) => (
          <MarketRow key={m.market_ref} market={m} />
        ))}
      </ul>
      {section.markets_unrenderable ? (
        <p className="muted" data-testid="pm-withheld">
          {t(
            `${section.markets_unrenderable} matched market(s) withheld — metadata unavailable or flagged.`,
            `${section.markets_unrenderable} 个已匹配市场被保留——元数据不可用或已被标记。`,
          )}
        </p>
      ) : null}
    </div>
  );
}
