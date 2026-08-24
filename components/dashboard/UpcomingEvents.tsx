"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { EVENT_TYPE_LABEL } from "@/components/catalysts/event-format";

const MAX_ROWS = 8;

/** Calendar-day distance from now to the event's UTC instant, floored at 0. */
function daysUntil(utc: string): number {
  const now = new Date();
  const ev = new Date(utc);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfEvent = new Date(ev.getFullYear(), ev.getMonth(), ev.getDate());
  return Math.max(0, Math.round((startOfEvent.getTime() - startOfToday.getTime()) / 86400000));
}

/**
 * The analyst's first question every morning — "what is on the calendar this
 * week?" — answered on the dashboard itself instead of one page away. Feed
 * order is the server's (§12 relevance, then time); this strip only truncates.
 */
export default function UpcomingEvents() {
  const t = useT();
  const feed = useQuery({
    queryKey: ["events-dashboard-strip"],
    queryFn: () => api.events.list({ horizon: "7d" }),
  });

  const rows = feed.data?.events.slice(0, MAX_ROWS) ?? [];

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>{t("Next 7 Days", "未来 7 天日程")}</h2>
        <Link href="/research?tab=catalysts" style={{ fontSize: 12 }}>
          {t("Full calendar →", "完整日历 →")}
        </Link>
      </div>
      {feed.isPending ? (
        <p className="empty">{t("Loading…", "加载中…")}</p>
      ) : feed.isError ? (
        <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
          {t("Event calendar unavailable:", "事件日历不可用：")} {feed.error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="empty">
          {t(
            "No known events in the next 7 days.",
            "未来 7 天没有已知事件。",
          )}
        </p>
      ) : (
        <ul className="upcoming-events">
          {rows.map((ev) => {
            const d = daysUntil(ev.scheduled_at_utc);
            const typeLabel = EVENT_TYPE_LABEL[ev.event_type];
            return (
              <li key={ev.event_id}>
                <Link href={`/catalysts/${ev.event_id}`} className="ue-row">
                  <span className="ue-when">
                    {d === 0 ? t("Today", "今天") : `T-${d}d`}
                  </span>
                  <span className="ue-date">
                    {new Date(ev.scheduled_at_utc).toLocaleDateString()}
                  </span>
                  <span className="ue-type">
                    {typeLabel == null
                      ? ev.event_type.replace(/_/g, " ")
                      : t(typeLabel.en, typeLabel.zh)}
                  </span>
                  {ev.ticker != null && <span className="ticker">{ev.ticker}</span>}
                  {ev.is_estimated && (
                    <span className="badge stale">{t("EST", "估算")}</span>
                  )}
                </Link>
              </li>
            );
          })}
          {(feed.data?.events.length ?? 0) > MAX_ROWS && (
            <li className="ue-more">
              <Link href="/research?tab=catalysts">
                {t(
                  `+${feed.data!.events.length - MAX_ROWS} more this week`,
                  `本周还有 ${feed.data!.events.length - MAX_ROWS} 个事件`,
                )}
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
