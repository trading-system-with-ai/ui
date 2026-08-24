"use client";

/**
 * What the calendar CAN and CANNOT know, stated on the page rather than
 * inferred from an empty list.
 *
 * `GET /api/events` never 503s: with no provider configured it answers 200
 * with `events: []` and a capability block. That block is the honest answer
 * to "why is this empty", so it is rendered — not swallowed into a spinner
 * or a generic empty state.
 *
 * The earnings banner is the one the platform lives with today: the vendor's
 * earnings-calendar endpoint returns 403 on this subscription tier, so every
 * upcoming earnings date is DERIVED from SEC 8-K filing cadence. Saying so
 * once, prominently, is what keeps the amber ESTIMATED badges on the cards
 * from looking like a glitch.
 */
import { useT } from "@/lib/i18n";
import type { EventCapabilities, EventFreshness } from "@/lib/types";

/** True when at least one provider reports earnings_calendar explicitly false. */
export function earningsCalendarDenied(capabilities: EventCapabilities): boolean {
  return Object.values(capabilities).some(
    (caps) => caps?.earnings_calendar === false,
  );
}

/** Capability values that are ERROR STRINGS, not booleans — a probe that
 *  failed is a third state and must not be shown as a plain "false". */
export function capabilityErrors(
  capabilities: EventCapabilities,
): { provider: string; capability: string; message: string }[] {
  const out: { provider: string; capability: string; message: string }[] = [];
  for (const [provider, caps] of Object.entries(capabilities)) {
    for (const [capability, value] of Object.entries(caps ?? {})) {
      if (typeof value === "string" && value.trim() !== "") {
        out.push({ provider, capability, message: value });
      }
    }
  }
  return out;
}

export default function CapabilityBanner({
  capabilities,
  freshness,
}: {
  capabilities: EventCapabilities;
  freshness: EventFreshness;
}) {
  const t = useT();
  const denied = earningsCalendarDenied(capabilities);
  const errors = capabilityErrors(capabilities);
  const neverRun = Object.entries(freshness.per_provider).filter(
    ([, state]) => state.note === "NEVER_RUN",
  );

  if (!denied && errors.length === 0 && neverRun.length === 0) return null;

  return (
    <div className="capability-banner" role="status">
      {denied && (
        <p className="cb-line">
          <span className="badge amber">{t("ESTIMATED DATES", "估算日期")}</span>{" "}
          {t(
            "Earnings calendar subscription not available — upcoming earnings dates are ESTIMATED from filing cadence (SEC 8-K history). Confirm a date from the company's IR page to mark it CONFIRMED.",
            "财报日历订阅不可用 — 即将到来的财报日期为依据申报节奏（SEC 8-K 历史记录）估算所得。可从公司投资者关系页面确认日期后将其标记为已确认。",
          )}
        </p>
      )}
      {errors.map((e) => (
        <p key={`${e.provider}:${e.capability}`} className="cb-line">
          <span className="badge red">{t("PROBE FAILED", "探测失败")}</span>{" "}
          {t(
            `${e.provider} · ${e.capability.replace(/_/g, " ")}: `,
            `${e.provider} · ${e.capability.replace(/_/g, " ")}：`,
          )}
          <code>{e.message}</code>
        </p>
      ))}
      {neverRun.map(([name]) => (
        <p key={name} className="cb-line">
          <span className="badge dim">{t("NEVER RUN", "尚未运行")}</span>{" "}
          {t(
            `${name} is configured but has not fetched yet — use Refresh to run it now.`,
            `${name} 已配置但尚未抓取数据 — 可点击「刷新」立即运行。`,
          )}
        </p>
      ))}
    </div>
  );
}
