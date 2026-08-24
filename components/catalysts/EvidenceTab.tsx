"use client";

/**
 * Phase J — the "Evidence" tab: the §46 bundle on its own surface.
 *
 * The Analysis tab already renders this bundle, but underneath the narrative.
 * That ordering is right there — the prose is what the reader came for and the
 * evidence is what backs it — and wrong as the ONLY place the evidence lives,
 * for one reason: `GET /evidence` answers even when no model has ever run, is
 * unconfigured, or failed. The evidence is what the platform ACTUALLY KNOWS,
 * and the part it actually knows must not be reachable only through the part it
 * guessed.
 *
 * Rules:
 *
 *  A. THIS TAB HAS NO LLM ON IT, EVER. It renders the DATA/QUANT half only —
 *     no narrative, no scenarios, no regime. §49's separation is enforced here
 *     by the tab BOUNDARY rather than by a chip, which is the strongest form
 *     of it available: there is no code path on this tab that could render
 *     model prose.
 *  B. THE BUNDLE OPENS EXPANDED. On the Analysis tab the bundle is collapsed
 *     because the narrative is the page. Here the bundle IS the page, and
 *     making the user press a button to see the only content would present
 *     data as an appendix to nothing.
 *  C. AN EMPTY BUNDLE IS A STATE WITH A REASON. A 404 here is not the
 *     ordinary first visit it is on the Analysis tab — the evidence endpoint
 *     computes from stored rows and does not need a model to have run — so it
 *     renders as an explicit "nothing stored for this event yet" with the
 *     server's own message, never as a red failure and never as a blank panel.
 */
import { badgeInfo } from "./eventStatusBadge";
import { useQuery } from "@tanstack/react-query";
import { api, isAnalysisNotFound } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { EventAnalysisPayload } from "@/lib/types";
import EvidenceSections, { TierChip } from "./EvidenceSections";
import PredictionMarketsPanel from "./PredictionMarketsPanel";
import ResearchPanel from "./ResearchPanel";
import type {
  PredictionMarketsSection,
  WebResearchSection,
} from "@/lib/types-research";
import { isoStamp } from "./analysis-format";

/**
 * The render half, split out so tests mount it with a fixed payload — the
 * same split AnalysisTab uses, and the reason is the same: a component that
 * can only be tested through the network is a component whose rendering rules
 * are tested by nobody.
 */
export function EvidenceTabContent({
  data,
  eventId,
  notFound = false,
  errorMessage = null,
}: {
  data: EventAnalysisPayload | null | undefined;
  /** Needed only by the research refresh button; omitted in pure-render
      tests, where the panel renders its list without an action. */
  eventId?: number;
  notFound?: boolean;
  errorMessage?: string | null;
}) {
  const t = useT();

  if (notFound) {
    return (
      <div className="panel" data-testid="evidence-tab">
        <h2>
          {t("Evidence", "证据")} <TierChip tier="DATA" /> <TierChip tier="QUANT" />
        </h2>
        <p className="empty" data-testid="evidence-tab-none">
          {t(
            "No evidence bundle is stored for this event yet. This tab reads what the platform has already computed from stored prices, filings, news and option bars — it never fetches and never calls a model, so an empty bundle means those rows have not been collected, not that anything failed.",
            "本事件尚无已存储的证据数据包。本标签页读取的是平台依据已存储的价格、财务申报、新闻与期权数据计算出的结果 — 它从不抓取数据,也从不调用模型;因此数据包为空,只说明相关数据尚未采集,并不代表出现故障。",
          )}
        </p>
      </div>
    );
  }

  if (errorMessage != null) {
    return (
      <div className="panel" data-testid="evidence-tab">
        <h2>
          {t("Evidence", "证据")} <TierChip tier="DATA" /> <TierChip tier="QUANT" />
        </h2>
        {/* Verbatim server message — a paraphrased error cannot be matched
            against the logs that produced it. */}
        <p className="error" data-testid="evidence-tab-error">
          {t(
            `Could not load the evidence bundle: ${errorMessage}`,
            `无法加载证据数据包：${errorMessage}`,
          )}
        </p>
      </div>
    );
  }

  const bundle = data?.bundle ?? null;
  const asOf = isoStamp(data?.as_of);

  return (
    <div data-testid="evidence-tab">
      <div className="panel" data-testid="evidence-tab-header">
        <h2>
          {t("Evidence", "证据")} <TierChip tier="DATA" /> <TierChip tier="QUANT" />
        </h2>
        <p className="an-note">
          {t(
            "This tab carries no model output at all — not a sentence of it. Everything below was computed by the platform from stored data, and it is exactly what any analysis of this event would be given as its input. It stays readable whether or not a model has ever run.",
            "本标签页不含任何模型输出 — 连一句都没有。以下全部内容均由平台依据已存储数据计算得出,也正是本事件的任何分析所使用的输入。无论模型是否运行过,这些内容始终可查。",
          )}
        </p>
        <p className="an-meta">
          <span className="k">{t("as of", "计算时点")}</span>{" "}
          <span className="mono" data-testid="evidence-tab-as-of">
            {asOf ?? "—"}
          </span>
          {badgeInfo(data?.event_status_badge).show && (
            <>
              {" · "}
              {/* §7 — a DERIVED date may be analysed, but the reader must know
                  the event itself is not confirmed before reading anything
                  scoped to it. */}
              <span
                className="badge amber"
                data-testid="evidence-tab-event-badge"
                title={badgeInfo(data?.event_status_badge).title}
              >
                {badgeInfo(data?.event_status_badge).text}
              </span>
            </>
          )}
        </p>
      </div>

      {/* Catalyst research upgrade — the two external evidence layers get
          first-class panels here rather than a new tab. This is the natural
          home for full transparency: what was retrieved, from whom, at what
          tier, and what the platform refused to admit. */}
      <div className="panel" data-testid="evidence-web-research">
        <h3>
          {t("Web research", "网页研究")} <TierChip tier="DATA" />
        </h3>
        <p className="an-note">
          {t(
            "Externally searched documents the platform admitted for this event, within its point-in-time research window. Source tier is metadata about who published a document — never a claim that it is true.",
            "平台在时点研究窗口内为本次事件采纳的外部搜索文档。来源层级是关于发布方的元数据——并非对其真实性的断言。",
          )}
        </p>
        <ResearchPanel
          eventId={eventId}
          section={(bundle?.web_research ?? undefined) as WebResearchSection | undefined}
        />
      </div>

      <div className="panel" data-testid="evidence-prediction-markets">
        <h3>
          {t("Prediction markets", "预测市场")} <TierChip tier="DATA" />
        </h3>
        <p className="an-note">
          {t(
            "What these contracts COST — market-implied pricing, not a forecast and not a statement about how likely the outcome is. A DERIVED or CONTEXT contract prices something this event merely influences.",
            "这些合约的价格——市场隐含定价，既非预测，也非对结果可能性的断言。DERIVED 或 CONTEXT 合约定价的对象只是受本事件影响，而非本事件本身。",
          )}
        </p>
        <PredictionMarketsPanel
          eventId={eventId}
          section={
            (bundle?.prediction_markets ?? undefined) as
              | PredictionMarketsSection
              | undefined
          }
        />
      </div>

      {/* Rule B — expanded, because here the bundle is the page. */}
      <EvidenceSections bundle={bundle} defaultOpen />
    </div>
  );
}

export default function EvidenceTab({
  eventId,
  asOf,
}: {
  eventId: number;
  asOf?: string;
}) {
  const t = useT();
  const query = useQuery({
    queryKey: ["event-evidence", eventId, asOf ?? null],
    queryFn: () => api.events.evidence(eventId, asOf),
    enabled: Number.isFinite(eventId),
    // A 404 is "nothing stored", which no amount of retrying will change.
    retry: (failureCount, error) => !isAnalysisNotFound(error) && failureCount < 1,
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  const notFound = isAnalysisNotFound(query.error);
  return (
    <EvidenceTabContent
      data={query.data}
      eventId={eventId}
      notFound={notFound}
      errorMessage={!notFound && query.error != null ? query.error.message : null}
    />
  );
}
