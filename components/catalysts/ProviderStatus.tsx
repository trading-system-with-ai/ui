"use client";

/**
 * Which calendar sources exist and when each last succeeded (§75 honest
 * capability reporting).
 *
 * The values are the LAST KNOWN state written by an ingestion tick, never a
 * live probe fired by this page load — a remembered verdict with its
 * timestamp is more honest than a fresh one that hides how long ago it was
 * true, and an API read must not trigger six outbound HTTP calls.
 *
 * A capability that is an error STRING renders as that string. Collapsing it
 * to "unavailable" would erase the difference between "the vendor says no"
 * (a subscription fact) and "the probe broke" (an operational fact).
 */
import { useLang, useT } from "@/lib/i18n";
import type { EventCapabilities, EventFreshness } from "@/lib/types";
import { formatUtc } from "./event-format";

const CAPABILITY_LABEL: Record<string, { en: string; zh: string }> = {
  earnings_calendar: { en: "Earnings calendar", zh: "财报日历" },
  earnings_history: { en: "Earnings history", zh: "历史财报" },
  market_calendar: { en: "Market calendar", zh: "交易日历" },
  market_holidays: { en: "Market holidays", zh: "休市日" },
  fed_events: { en: "Fed events", zh: "美联储事件" },
  macro_calendar: { en: "Macro calendar", zh: "宏观日历" },
};

export default function ProviderStatus({
  capabilities,
  freshness,
}: {
  capabilities: EventCapabilities;
  freshness: EventFreshness;
}) {
  const t = useT();
  const { lang } = useLang();
  const providers = freshness.configured_providers;

  // Ops detail matters when something is wrong; when everything is healthy a
  // one-line summary suffices and the grid stays folded out of the way.
  const troubled = providers.filter((name) => {
    const s = freshness.per_provider[name];
    return s == null || s.note === "NEVER_RUN" || (s.last_error != null && s.last_error !== "");
  });
  const latestOk = providers
    .map((name) => freshness.per_provider[name]?.last_ok_at)
    .filter((v): v is string => v != null)
    .sort()
    .pop();

  if (providers.length === 0) {
    return (
      <div className="panel">
        <h2>{t("Calendar sources", "日历数据源")}</h2>
        <p className="empty">
          {t(
            "No calendar provider is configured. No dates are ingested, and none are invented — configure a provider in Settings, or confirm dates manually from each company's IR page.",
            "未配置任何日历数据源。系统不会采集任何日期,也不会凭空生成 — 请在「设置」中配置数据源,或从各公司投资者关系页面手动确认日期。",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <details className="provider-details" open={troubled.length > 0}>
        <summary>
          <span className="pd-title">{t("Calendar sources", "日历数据源")}</span>{" "}
          {troubled.length === 0 ? (
            <span className="pd-summary">
              {t(
                `${providers.length} sources healthy`,
                `${providers.length} 个数据源正常`,
              )}
              {latestOk != null &&
                ` · ${t("last success", "上次成功采集")} ${formatUtc(latestOk, lang)} UTC`}
            </span>
          ) : (
            <span className="pd-summary pd-trouble">
              {t(
                `${troubled.length} of ${providers.length} sources need attention`,
                `${providers.length} 个数据源中 ${troubled.length} 个需要关注`,
              )}
            </span>
          )}
        </summary>
        <div className="provider-grid">
          {providers.map((name) => {
            const state = freshness.per_provider[name];
            const caps = capabilities[name] ?? {};
            const capEntries = Object.entries(caps);
            return (
              <div key={name} className="provider-cell">
                <div className="pc-head">
                  <strong>{name}</strong>
                  {state?.note === "NEVER_RUN" ? (
                    <span className="badge dim">{t("NEVER RUN", "尚未运行")}</span>
                  ) : state?.last_error ? (
                    <span className="badge red">{t("LAST RUN FAILED", "上次失败")}</span>
                  ) : (
                    <span className="badge green">{t("OK", "正常")}</span>
                  )}
                </div>
                <div className="pc-line">
                  {t("Last success", "上次成功")}:{" "}
                  <span className="mono">{formatUtc(state?.last_ok_at ?? null, lang)}</span>
                  {state?.last_ok_at != null && " UTC"}
                </div>
                {state?.last_error != null && state.last_error !== "" && (
                  // Verbatim server text — an operational record, not UI copy.
                  <div className="pc-line pc-error">{state.last_error}</div>
                )}
                {capEntries.length > 0 && (
                  <ul className="pc-caps">
                    {capEntries.map(([capability, value]) => {
                      const label = CAPABILITY_LABEL[capability];
                      return (
                        <li key={capability}>
                          <span className="pc-cap-name">
                            {label == null
                              ? capability.replace(/_/g, " ")
                              : t(label.en, label.zh)}
                          </span>
                          {value === true ? (
                            <span className="badge green">{t("YES", "支持")}</span>
                          ) : value === false ? (
                            <span className="badge dim">{t("NO", "不支持")}</span>
                          ) : (
                            <span className="badge amber" title={String(value)}>
                              {String(value)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <p className="pc-footnote">
          {t(
            "Last known state, recorded by the most recent ingestion run — not probed on page load.",
            "此为最近一次采集运行记录的状态,并非在页面加载时实时探测所得。",
          )}
        </p>
      </details>
    </div>
  );
}
