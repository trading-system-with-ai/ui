"use client";

/**
 * Admitted external web research for one event (Catalyst research upgrade,
 * plan Phase 9). Embedded in the Evidence and News surfaces — not its own
 * tab: a searched document is another EVIDENCE LAYER, not another subject.
 *
 * THE COST BOUNDARY IS VISIBLE HERE. The list is free to read (it renders
 * stored rows), and the single button is the only thing on this surface that
 * spends search quota. It reports what it bought — queries executed, results
 * considered, results accepted — because Phase 12 forbids hiding API
 * expenditure, and a throttled or unconfigured press reports its reason as a
 * STATE rather than an error.
 *
 * SEARCH RANK IS NOT RELIABILITY. Every row wears its source tier, so an
 * OFFICIAL release and an UNKNOWN blog are visibly different evidence even
 * when the search engine ranked them adjacently.
 *
 * NO URLS ARE RENDERED. The bundle section deliberately carries none (§81),
 * so this component shows publisher and domain instead — enough to judge a
 * source, without turning retrieved third-party text into a clickable
 * destination the platform vouches for.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/shared/Toast";
import type { SourceTier, WebEvidenceItem, WebResearchSection } from "@/lib/types-research";

/** Tier → chip class. Authority is metadata, never a truth flag. */
const TIER_CLASS: Record<SourceTier, string> = {
  OFFICIAL: "tier-official",
  PRIMARY: "tier-primary",
  HIGH_QUALITY_NEWS: "tier-news",
  INDUSTRY: "tier-industry",
  SECONDARY: "tier-secondary",
  SOCIAL: "tier-social",
  UNKNOWN: "tier-unknown",
};

export function tierLabel(tier: SourceTier | null, t: ReturnType<typeof useT>): string {
  switch (tier) {
    case "OFFICIAL":
      return t("Official", "官方");
    case "PRIMARY":
      return t("Primary", "一手");
    case "HIGH_QUALITY_NEWS":
      return t("Professional", "专业媒体");
    case "INDUSTRY":
      return t("Industry", "行业");
    case "SECONDARY":
      return t("Secondary", "二手");
    case "SOCIAL":
      return t("Social", "社交");
    default:
      return t("Unknown", "未知");
  }
}

function EvidenceRow({ item }: { item: WebEvidenceItem }) {
  const t = useT();
  return (
    <li className="wr-item" data-testid="wr-item" data-tier={item.source_tier ?? "UNKNOWN"}>
      <div className="wr-item-head">
        <span
          className={`badge dim ${TIER_CLASS[item.source_tier ?? "UNKNOWN"]}`}
          data-testid="wr-tier"
        >
          {tierLabel(item.source_tier, t)}
        </span>
        <span className="wr-title">{item.safe_title}</span>
      </div>
      <div className="wr-item-meta muted">
        <span>{item.publisher ?? item.domain}</span>
        {/* Absent is absent: a document whose publisher stated no time says so. */}
        <span>
          {item.published_at ?? t("Publication time unavailable from provider.", "提供方未给出发布时间。")}
        </span>
        {item.topic ? <span>{item.topic}</span> : null}
      </div>
    </li>
  );
}

/**
 * The spending half, isolated.
 *
 * Kept a SEPARATE component because it is the only part that needs a query
 * client and a toast host: the evidence list must stay renderable on a bare
 * surface (and in pure-render tests), and a refresh button that dragged
 * provider requirements into the list would make the read path depend on
 * the write path's plumbing.
 */
function RefreshSourcesButton({ eventId }: { eventId: number }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();

  const refresh = useMutation({
    mutationFn: () => api.events.researchBackfill(eventId),
    onSuccess: (result) => {
      // A declined press is a STATE, not a failure — say which state.
      if (!result.fetched) {
        const reason =
          result.reason === "NOT_CONFIGURED"
            ? t("Web Search is not configured.", "未配置网页搜索。")
            : result.reason === "RECENTLY_REFRESHED"
              ? t("Research was refreshed recently.", "研究数据最近已刷新。")
              : result.reason === "NO_QUERIES_PLANNED"
                ? t("No queries could be planned for this event.", "无法为本次事件规划查询。")
                : (result.reason ?? t("Nothing was fetched.", "未获取到内容。"));
        toast("INFO", String(reason));
        return;
      }
      // Cost transparency (Phase 12): say what the press bought.
      toast(
        "SUCCESS",
        t(
          `Searched: ${result.queries_executed ?? 0} queries, ${result.results_accepted ?? 0} of ${result.results_considered ?? 0} results admitted.`,
          `已搜索：${result.queries_executed ?? 0} 条查询，采纳 ${result.results_accepted ?? 0}/${result.results_considered ?? 0} 条结果。`,
        ),
      );
      // The panels read the shared evidence bundle, so THAT is the query
      // that must refetch. A key nothing subscribes to would leave the list
      // showing pre-refresh evidence after a successful spend.
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
        data-testid="wr-refresh"
      >
        {refresh.isPending
          ? t("Refreshing sources…", "正在刷新来源……")
          : t("Refresh sources", "刷新来源")}
      </button>
      {/* The button spends; the label says so before it is pressed. */}
      <span className="muted">
        {t(
          "Runs a bounded external web search — this spends search quota.",
          "执行有上限的外部网页搜索——会消耗搜索配额。",
        )}
      </span>
    </div>
  );
}

export default function ResearchPanel({
  eventId,
  section,
}: {
  /** Omitted on read-only surfaces: without it the list renders and the
      spending button simply does not exist. */
  eventId?: number;
  section: WebResearchSection | undefined;
}) {
  const t = useT();
  const items = section?.important_evidence ?? [];

  return (
    <div className="wr-panel" data-testid="wr-panel">
      {eventId != null ? <RefreshSourcesButton eventId={eventId} /> : null}

      {!section || !section.available ? (
        <p className="muted" data-testid="wr-unavailable" data-reason={section?.reason ?? ""}>
          {section?.reason === "NO_EVIDENCE_ACCEPTED"
            ? t(
                "Search completed, but no additional high-quality evidence was found.",
                "搜索已完成，但未发现额外的高质量证据。",
              )
            : t(
                "No external research has been run for this event yet.",
                "尚未针对本次事件执行外部研究。",
              )}
        </p>
      ) : (
        <>
          <div className="wr-counts muted" data-testid="wr-counts">
            <span>
              {t("Admitted", "已采纳")}: {section.results_accepted ?? 0}
            </span>
            <span>
              {t("Considered", "已考量")}: {section.results_considered ?? 0}
            </span>
            <span>
              {t("Queries", "查询")}: {section.queries_executed ?? 0}
            </span>
            {section.run_status === "PARTIAL" ? (
              <span data-testid="wr-partial">
                {t("Partial run — some queries failed.", "部分运行——部分查询失败。")}
              </span>
            ) : null}
          </div>
          {section.suppressed_suspicious ? (
            <p className="muted" data-testid="wr-suppressed">
              {t(
                `${section.suppressed_suspicious} result(s) withheld: instruction-shaped text.`,
                `${section.suppressed_suspicious} 条结果被保留：文本疑似指令注入。`,
              )}
            </p>
          ) : null}
          <ul className="wr-items">
            {items.map((item) => (
              <EvidenceRow key={item.evidence_key} item={item} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
