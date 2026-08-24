"use client";

/**
 * Phase G §46 — `macro_context`, on the event's Overview tab.
 *
 * The Macro TAB answers "what is this release?" for a macro event. This CARD
 * answers the mirror question for every OTHER event, and it is the more
 * commonly useful of the two: a reader looking at one company's earnings has
 * no way of knowing that CPI lands the morning before the print, and a single
 * stock's setup is not the same setup when a rate-sensitive macro release sits
 * inside its window. The card exists so that fact is on the page a reader
 * actually opens, rather than reachable only by navigating to a different
 * event they had no reason to look for.
 *
 * Rules:
 *
 *  A. IT DRAWS NOTHING WHEN THERE IS NOTHING. An empty horizon is genuinely
 *     the common case — most weeks hold no CPI and no FOMC — and a permanent
 *     panel reading "no macro events" would be a fixture the eye learns to
 *     skip, which is exactly what would make it invisible on the week it
 *     finally has something in it. When the section is present but its list is
 *     empty the card renders NULL, and the page loses a panel rather than
 *     gaining a blank one. An UNAVAILABLE section (server said it could not
 *     look) is different from an EMPTY one (it looked and found none), and the
 *     card is silent for both — the difference belongs on the Evidence tab,
 *     where coverage is the subject.
 *  B. §7 TRAVELS WITH THE DATE. A macro date derived rather than confirmed
 *     wears the amber ESTIMATED badge here exactly as it does on the card, the
 *     hero and the table. The same fact wears the same badge everywhere or the
 *     badge means nothing.
 *  C. NOTHING IS COMPUTED (§61). `days_to` and `importance` arrive from the
 *     server. Recomputing "days until" in the browser would drift against the
 *     server's own as-of instant the moment a page sat open past midnight UTC.
 *  D. DATA TIER, NO MODEL. This is a list of scheduled events off the
 *     registry. It carries the section's own tier when the server sends one,
 *     and DATA otherwise.
 */
import Link from "next/link";
import { useT } from "@/lib/i18n";
import type { MacroContextEvent, MacroContextSection } from "@/lib/types-macro";
import { TierChip } from "./EvidenceSections";
import { EVENT_TYPE_LABEL } from "./event-format";
import { stampDay } from "./macro-format";

/** The T-minus chip. `days_to` is the SERVER's count (rule C). */
function daysToText(
  daysTo: number | null | undefined,
  t: (en: string, zh: string) => string,
): string | null {
  if (typeof daysTo !== "number" || !Number.isFinite(daysTo)) return null;
  const n = Math.trunc(daysTo);
  if (n === 0) return t("today", "今天");
  if (n === 1) return t("tomorrow", "明天");
  if (n < 0) return t(`${Math.abs(n)}d ago`, `${Math.abs(n)} 天前`);
  return t(`in ${n}d`, `${n} 天后`);
}

/** Read the upcoming list defensively — the section may arrive without it. */
export function upcomingEvents(
  section: MacroContextSection | null | undefined,
): MacroContextEvent[] {
  const upcoming = section?.upcoming;
  return Array.isArray(upcoming) ? upcoming : [];
}

export default function MacroContextCard({
  section,
}: {
  section: MacroContextSection | null | undefined;
}) {
  const t = useT();
  const events = upcomingEvents(section);

  // Rule A — no panel rather than an empty one.
  if (events.length === 0) return null;

  const horizon = section?.horizon_days;
  // Rule D — DATA unless the server explicitly said QUANT. Narrowed to the two
  // tiers this section can legitimately carry rather than passed through: an
  // unrecognised token from the server must not be able to paint a registry
  // listing with the LLM chip, which would label scheduled facts as generated.
  const tier = section?.tier === "QUANT" ? "QUANT" : "DATA";

  return (
    <div className="panel" data-testid="macro-context-card">
      <h2>
        {t("Macro context", "宏观背景")} <TierChip tier={tier} />
      </h2>
      <p className="an-note">
        {typeof horizon === "number" && Number.isFinite(horizon)
          ? t(
              `Scheduled macro releases within ${horizon} days of this event. A single name's setup is not the same setup when one of these lands inside its window.`,
              `本事件前后 ${horizon} 天内已排定的宏观数据发布。当上述数据落在事件窗口内时,个股的交易环境将随之改变。`,
            )
          : t(
              "Scheduled macro releases near this event. A single name's setup is not the same setup when one of these lands inside its window.",
              "本事件附近已排定的宏观数据发布。当上述数据落在事件窗口内时,个股的交易环境将随之改变。",
            )}
      </p>
      <ul className="mc-list">
        {events.map((event, i) => {
          const label =
            event.event_type == null
              ? null
              : EVENT_TYPE_LABEL[event.event_type as keyof typeof EVENT_TYPE_LABEL];
          const when = daysToText(event.days_to, t);
          const row = (
            <>
              <span className="chip mc-type">
                {label == null
                  ? (event.event_type ?? "—").replace(/_/g, " ")
                  : t(label.en, label.zh)}
              </span>
              <span className="mc-title">{event.title ?? event.event_key ?? "—"}</span>
              <span className="mono mc-when" data-testid={`macro-context-when-${i}`}>
                {stampDay(event.scheduled_at) ?? "—"}
              </span>
              {when != null && (
                <span className="badge dim mc-days" data-testid={`macro-context-days-${i}`}>
                  {when}
                </span>
              )}
              {/* Rule B — the same fact wears the same badge everywhere. */}
              {event.is_estimated === true && (
                <span
                  className="badge amber"
                  data-testid={`macro-context-estimated-${i}`}
                >
                  {t("ESTIMATED", "估算")}
                </span>
              )}
            </>
          );
          return (
            <li key={`${event.event_key ?? i}`} data-testid="macro-context-item">
              {/* Linked only when the registry gave us an id to link TO — a
                  dead link to /catalysts/undefined is worse than plain text. */}
              {typeof event.event_id === "number" && Number.isFinite(event.event_id) ? (
                <Link href={`/catalysts/${event.event_id}`} className="mc-link">
                  {row}
                </Link>
              ) : (
                <span className="mc-link">{row}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
