"use client";

/**
 * Catalysts — the event calendar (§11 horizon, §12 relevance ordering,
 * §53 nav destination, §54 cards).
 *
 * Three honesty rules shape this page and none of them are cosmetic:
 *
 * 1. An empty calendar is EXPLAINED, not just empty. `GET /api/events`
 *    answers 200 with `events: []` plus a capability block when nothing is
 *    configured, so the page renders that block instead of a spinner or a
 *    failure banner. "Nothing is scheduled" and "nothing is being ingested"
 *    are different facts and must look different.
 * 2. ESTIMATED dates are visibly derived. They carry an amber badge, a
 *    sentence saying where the estimate came from, and the only action that
 *    can turn one into a fact — a user confirmation citing a source.
 * 3. Groups follow the §12 ladder (Positions → Trading Pool → Watchlist →
 *    Market-wide → Other) and are rendered in that fixed order, with each
 *    group's meaning stated. The server already sorts by (tier, time); the
 *    page does not re-rank.
 *
 * Polls every 60s like the other live surfaces.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import CapabilityBanner from "@/components/catalysts/CapabilityBanner";
import ConfirmDateDialog from "@/components/catalysts/ConfirmDateDialog";
import EventCard from "@/components/catalysts/EventCard";
import ProviderStatus from "@/components/catalysts/ProviderStatus";
import {
  RELEVANCE_LABEL,
  RELEVANCE_MEANING,
  RELEVANCE_ORDER,
  formatUtc,
  groupByRelevance,
} from "@/components/catalysts/event-format";
import FlowNav from "@/components/shared/FlowNav";
import { useToast } from "@/components/shared/Toast";
import { api } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";
import type {
  EventConfirmRequest,
  EventHorizonKey,
  EventRow,
} from "@/lib/types";

/**
 * The catalyst feed is a SCHEDULE, not a quote. Rows change only when the
 * calendar ingest runs — a button press, not a market tick — so polling it
 * re-rendered a long list under the reader while returning identical bytes.
 * The manual refresh control above the list is the honest way to update it.
 */
const POLL_MS = false as const;

const HORIZONS: { key: EventHorizonKey; en: string; zh: string }[] = [
  { key: "today", en: "Today", zh: "今天" },
  { key: "7d", en: "Next 7 days", zh: "未来 7 天" },
  { key: "30d", en: "Next 30 days", zh: "未来 30 天" },
];

export default function CatalystsPage() {
  const t = useT();
  const { lang } = useLang();
  const qc = useQueryClient();
  const toast = useToast();

  const [horizon, setHorizon] = useState<EventHorizonKey>("7d");
  const [includeEstimated, setIncludeEstimated] = useState(true);
  const [confirming, setConfirming] = useState<EventRow | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const feed = useQuery({
    queryKey: ["events", horizon, includeEstimated],
    // §54: the cards carry the research digest, so the feed is asked for it.
    // The flag is part of the query key above only implicitly — it is
    // constant for this page, so no cache split is needed.
    queryFn: () => api.events.list({ horizon, includeEstimated, summaries: true }),
    refetchInterval: POLL_MS,
  });

  const refresh = useMutation({
    mutationFn: () => api.events.refresh(),
    onSuccess: (result) => {
      const skipped = result.skipped?.length ?? 0;
      toast(
        "SUCCESS",
        t(
          `Calendar refreshed — ${result.created} new, ${result.updated} updated, ${result.alerts} alerts${skipped > 0 ? `, ${skipped} provider(s) skipped` : ""}.`,
          `日历已刷新 — 新增 ${result.created} 条,更新 ${result.updated} 条,提醒 ${result.alerts} 条${skipped > 0 ? `,跳过 ${skipped} 个数据源` : ""}。`,
        ),
      );
      qc.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e: Error) => {
      toast(
        "WARNING",
        t(`Refresh failed: ${e.message}`, `刷新失败：${e.message}`),
      );
    },
  });

  const confirm = useMutation({
    mutationFn: (args: { eventId: number; body: EventConfirmRequest }) =>
      api.events.confirm(args.eventId, args.body),
    onSuccess: (result) => {
      setConfirming(null);
      setConfirmError(null);
      toast(
        "SUCCESS",
        t(
          `${result.ticker ?? result.event_type} date confirmed — status ${result.status}.`,
          `${result.ticker ?? result.event_type} 日期已确认 — 状态 ${result.status}。`,
        ),
      );
      qc.invalidateQueries({ queryKey: ["events"] });
      // A user confirmation writes an audit row (EVENT_UPDATED) and can
      // arm the T-minus alert, so both surfaces are now stale.
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    // Verbatim server message: a 422 explains exactly which field it
    // rejected, and paraphrasing it would lose that.
    onError: (e: Error) => setConfirmError(e.message),
  });

  const data = feed.data;
  const groups = groupByRelevance(data?.events ?? []);
  const total = data?.counts.total ?? 0;

  return (
    <>
      <h1>{t("Catalysts", "催化剂")}</h1>
      <p className="subtitle">
        {t(
          "Scheduled events that can move your book — earnings, macro releases and Fed decisions, ranked by how they touch your positions.",
          "可能影响你账户的已排定事件 — 财报、宏观数据与美联储决议,按其与你持仓的关联度排序。",
        )}
      </p>
      <FlowNav stage="research" />

      <div className="catalyst-toolbar">
        <div className="seg-control" role="group" aria-label={t("Horizon", "时间范围")}>
          {HORIZONS.map((h) => (
            <button
              key={h.key}
              type="button"
              className={horizon === h.key ? "active" : ""}
              aria-pressed={horizon === h.key}
              onClick={() => setHorizon(h.key)}
            >
              {t(h.en, h.zh)}
            </button>
          ))}
        </div>
        <label className="catalyst-toggle">
          <input
            type="checkbox"
            checked={includeEstimated}
            onChange={(e) => setIncludeEstimated(e.target.checked)}
          />
          {t("Show estimated dates", "显示估算日期")}
        </label>
        <button
          type="button"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
        >
          {refresh.isPending ? t("Refreshing…", "刷新中…") : t("Refresh", "刷新")}
        </button>
      </div>

      {data != null && (
        <p className="datasource">
          {t(
            `${data.horizon.label} · ${total} event(s) · ${data.counts.confirmed} confirmed, ${data.counts.estimated} estimated · times in ${data.display_timezone} · last ingest ${formatUtc(data.freshness.last_ingest_at, lang)}${data.freshness.last_ingest_at != null ? " UTC" : ""}`,
            `${data.horizon.label} · 共 ${total} 个事件 · 已确认 ${data.counts.confirmed} 个,估算 ${data.counts.estimated} 个 · 时间基准 ${data.display_timezone} · 上次采集 ${formatUtc(data.freshness.last_ingest_at, lang)}${data.freshness.last_ingest_at != null ? " UTC" : ""}`,
          )}
        </p>
      )}

      {data != null && (
        <CapabilityBanner
          capabilities={data.capabilities}
          freshness={data.freshness}
        />
      )}

      {feed.isLoading && <p className="empty">{t("Loading…", "加载中…")}</p>}

      {feed.error != null && (
        <p className="error">
          {t(
            `Could not load events: ${feed.error.message}`,
            `无法加载事件：${feed.error.message}`,
          )}
        </p>
      )}

      {data != null && total === 0 && (
        <div className="panel">
          <p className="empty">
            {t("No events in this window.", "该时间范围内没有事件。")}
          </p>
          <p className="empty-detail">
            {data.freshness.configured_providers.length === 0
              ? t(
                  "No calendar provider is configured, so nothing is being ingested. The platform shows an empty calendar rather than inventing dates.",
                  "未配置任何日历数据源,因此系统未采集任何数据。平台宁可显示空日历,也不会凭空生成日期。",
                )
              : t(
                  `Configured sources: ${data.freshness.configured_providers.join(", ")}. Try a longer horizon, enable estimated dates, or press Refresh.`,
                  `已配置的数据源：${data.freshness.configured_providers.join("、")}。可尝试拉长时间范围、勾选显示估算日期,或点击「刷新」。`,
                )}
          </p>
        </div>
      )}

      {data != null &&
        RELEVANCE_ORDER.map((tier) => {
          const events = groups.get(tier) ?? [];
          if (events.length === 0) return null;
          return (
            <section key={tier} className="panel catalyst-group">
              <h2>
                {t(RELEVANCE_LABEL[tier].en, RELEVANCE_LABEL[tier].zh)}
                <span className="cg-count">{events.length}</span>
              </h2>
              <p className="cg-meaning">
                {t(RELEVANCE_MEANING[tier].en, RELEVANCE_MEANING[tier].zh)}
              </p>
              <div className="event-grid">
                {events.map((event) => (
                  <EventCard
                    key={event.event_id}
                    event={event}
                    onConfirm={(e) => {
                      setConfirmError(null);
                      setConfirming(e);
                    }}
                  />
                ))}
              </div>
            </section>
          );
        })}

      {data != null && (
        <ProviderStatus
          capabilities={data.capabilities}
          freshness={data.freshness}
        />
      )}

      {confirming != null && (
        <ConfirmDateDialog
          event={confirming}
          pending={confirm.isPending}
          error={confirmError}
          onClose={() => {
            setConfirming(null);
            setConfirmError(null);
          }}
          onSubmit={(body) =>
            confirm.mutate({ eventId: confirming.event_id, body })
          }
        />
      )}
    </>
  );
}
