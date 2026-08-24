"use client";

/**
 * Phase J §56 — the event hero.
 *
 * The hero answers, above the fold and before any tab is opened: WHICH event,
 * WHEN, HOW CERTAIN the date is, HOW MUCH the user has on it, and HOW MUCH the
 * option market is pricing. Everything else on the page is detail beneath it.
 *
 * Five rules live here, each of them a way the strip could quietly lie:
 *
 *  A. THE DATE'S CERTAINTY IS NEVER OPTIONAL. §7: a DERIVED date must not read
 *     as a scheduled fact. The ESTIMATED/CONFIRMED badge is unconditional — it
 *     always renders, one or the other — because a badge that appears only for
 *     estimates trains the reader to read "no badge" as "confirmed", and then a
 *     rendering bug becomes a false confirmation. The SOURCE rides beside it,
 *     since "who says so" is what makes CONFIRMED mean anything.
 *  B. BOTH CLOCKS, ALWAYS (§10). The event's own wall clock plus session, and
 *     the UTC instant the platform compares on. Showing one is how a before-
 *     market release becomes an after-market one on a traveller's laptop.
 *  C. THE RISK CHIP IS AN HONEST PLACEHOLDER. Phase K owns portfolio risk for
 *     this event. Until then the chip SAYS the phase rather than showing a
 *     reassuring "OK" or nothing at all — an absent risk row on a risk-managed
 *     platform reads as "no risk".
 *  D. THE EXPOSURE NUMBER IS COST BASIS, LABELLED (§54). The exact wording
 *     EventCard uses, verbatim, because the same number under two different
 *     labels on two surfaces is worse than the number being absent from one.
 *  E. IMPLIED MOVE ALWAYS CARRIES §37's SENTENCE. Wherever an implied move
 *     appears, "option-market pricing, not a forecast" appears with it — here
 *     as the chip's own tooltip AND as visible text, never only as a hover: a
 *     caveat reachable only by mouse is absent on touch.
 *
 * The hero never fetches. It renders the detail payload the page already has,
 * plus whatever options payload the page chose to load — an above-the-fold
 * component that issued its own request would make the most-rendered element on
 * the page also the most expensive.
 */
import Link from "next/link";
import Term from "@/components/shared/Term";
import { useLang, useT } from "@/lib/i18n";
import type { EventDetail } from "@/lib/types";
import type { EventOptionsPayload } from "@/lib/types-options";
import {
  EVENT_TYPE_LABEL,
  LIFECYCLE_LABEL,
  RELEVANCE_BADGE,
  RELEVANCE_LABEL,
  SESSION_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  fmtMoney,
  formatLocalDateTime,
  formatTMinus,
  formatUtc,
  zoneAbbrev,
} from "./event-format";
import { basisBadge, disclaimerText, fmtBand, metricValue } from "./options-format";

/**
 * The §56 countdown, spelled out.
 *
 * `formatTMinus` gives the compact "T-2d" chip the cards use; the hero has room
 * for the long form, and "T-2 DAYS" is what a person reads. Past events say
 * POST-EVENT beside "T+n" rather than leaving the reader to decode a sign.
 */
export function heroCountdown(daysToEvent: number, t: TFnLocal): string {
  const compact = formatTMinus(daysToEvent, t);
  if (Math.abs(daysToEvent) < 1) return compact;
  const days = Math.floor(Math.abs(daysToEvent));
  const unit =
    days === 1 ? t("DAY", "天") : t("DAYS", "天");
  const sign = daysToEvent < 0 ? "+" : "-";
  return t(`T${sign}${days} ${unit}`, `T${sign}${days} ${unit}`);
}

type TFnLocal = (en: string, zh: string) => string;

export default function EventHero({
  event,
  options,
  onOpenTab,
}: {
  event: EventDetail;
  /** Phase I options payload, when the page already loaded it. Never fetched here. */
  options?: EventOptionsPayload | null;
  /** Lets the hero's chips jump to the tab that explains them. */
  onOpenTab?: (tabId: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();

  const typeLabel = EVENT_TYPE_LABEL[event.event_type];
  const typeText =
    typeLabel == null ? event.event_type.replace(/_/g, " ") : t(typeLabel.en, typeLabel.zh);
  const statusLabel = STATUS_LABEL[event.status];
  const sessionLabel = SESSION_LABEL[event.session];
  const lifecycleLabel = LIFECYCLE_LABEL[event.lifecycle];
  const relevanceLabel = RELEVANCE_LABEL[event.relevance_tier];
  const past = event.days_to_event < 0;

  const current = options?.current ?? null;
  const impliedPct = current == null ? null : metricValue(current, current.implied_move_pct);
  // `fmtBand` takes the FRACTION the wire carries and emits the ± band itself
  // (see options-format): a straddle prices magnitude, so the sign never
  // belongs on it, and pre-multiplying here would print 620%.
  const impliedText = fmtBand(impliedPct, 1);
  const basis = basisBadge(current?.basis, t);
  const disclaimer = disclaimerText(options?.disclaimer, t);

  return (
    <div className="event-hero" data-testid="event-hero">
      <div className="eh-title">
        <h1>
          {event.ticker != null && (
            <Link href={`/watchlist/${event.ticker}`} className="ticker ticker-link">
              {event.ticker}
            </Link>
          )}
          {event.ticker != null && " — "}
          {typeText}
        </h1>
        <span className={`badge ${STATUS_BADGE[event.status] ?? "dim"}`}>
          {statusLabel == null ? event.status : t(statusLabel.en, statusLabel.zh)}
        </span>
        <span className={`badge ${RELEVANCE_BADGE[event.relevance_tier] ?? "dim"}`}>
          {relevanceLabel == null
            ? event.relevance_tier.replace(/_/g, " ")
            : t(relevanceLabel.en, relevanceLabel.zh)}
        </span>
      </div>

      <p className="eh-subtitle">{event.title}</p>

      <div className="eh-tminus">
        <Term k="event_t_minus">
          <span data-testid="hero-countdown">{heroCountdown(event.days_to_event, t)}</span>
        </Term>
        <span className="eh-lifecycle" data-testid="hero-lifecycle">
          {past
            ? t("POST-EVENT", "事件后")
            : lifecycleLabel == null
              ? event.lifecycle.replace(/_/g, " ")
              : t(lifecycleLabel.en, lifecycleLabel.zh)}
        </span>
      </div>

      {/* Rule A + B: the schedule, with its certainty and its source attached.
          The two clocks and the session sit in one strip so they can never be
          read apart. */}
      <div className="eh-schedule" data-testid="hero-schedule">
        <span className="eh-when" data-testid="hero-local">
          {formatLocalDateTime(event.scheduled_at_local, lang, { withYear: true })}{" "}
          <span className="eh-zone">({zoneAbbrev(event.event_timezone)})</span>
        </span>
        <Term k="event_session_timing">
          <span className="chip" data-testid="hero-session">
            {sessionLabel == null
              ? event.session.replace(/_/g, " ")
              : t(sessionLabel.en, sessionLabel.zh)}
          </span>
        </Term>
        <span className="eh-utc mono" data-testid="hero-utc">
          {formatUtc(event.scheduled_at_utc, lang)} UTC
        </span>
        {/* UNCONDITIONAL, both ways — see rule A. */}
        {event.is_estimated ? (
          <span className="badge amber" data-testid="hero-estimated">
            {t("ESTIMATED", "估算")}
          </span>
        ) : (
          <span className="badge green" data-testid="hero-confirmed">
            {t("CONFIRMED", "已确认")}
          </span>
        )}
        {/* Verbatim server tokens — the audit record of where the date came
            from, never paraphrased. */}
        <span className="eh-source" data-testid="hero-source">
          {event.source_name} ({event.source})
        </span>
      </div>

      <div className="eh-chips">
        {/* Data freshness. `last_verified_at` is when a SOURCE last stood
            behind this date; it is not the page load time, and calling it
            "updated" would let a stale row look freshly checked. */}
        <span className="eh-chip" data-testid="hero-freshness">
          <span className="ehc-k">{t("Last verified", "最后核验")}</span>
          <span className="ehc-v mono">
            {formatUtc(event.last_verified_at, lang)}
            {event.last_verified_at != null && " UTC"}
          </span>
        </span>

        {/* Rule D — the exposure number, with EventCard's exact basis wording. */}
        <span className="eh-chip" data-testid="hero-exposure">
          <span className="ehc-k">{t("Exposure", "敞口")}</span>
          {event.exposure != null ? (
            <span className="ehc-v">
              <strong>{fmtMoney(event.exposure.position_market_value)}</strong>{" "}
              <span className="ec-basis">
                {t(
                  `${event.exposure.basis} basis · ${event.exposure.position_qty} qty`,
                  `${event.exposure.basis} 成本基准 · ${event.exposure.position_qty} 数量`,
                )}
              </span>
            </span>
          ) : (
            <span className="ehc-v dim-text">{t("No open position", "无未平仓头寸")}</span>
          )}
        </span>

        {/* Rule E — implied move, only when the payload actually carried one. */}
        {impliedText != null && (
          <span
            className="eh-chip eh-implied"
            data-testid="hero-implied-move"
            title={disclaimer}
          >
            <span className="ehc-k">{t("Implied move", "隐含波动幅度")}</span>
            <span className="ehc-v mono">{impliedText}</span>
            {basis != null && (
              <span className={`badge ${basis.badge}`} data-testid="hero-implied-basis">
                {basis.text}
              </span>
            )}
            <span className="badge dim">{t("NOT A FORECAST", "并非预测")}</span>
          </span>
        )}

        {/* Rule C — the honest Phase K placeholder. */}
        <span className="eh-chip" data-testid="hero-risk">
          <span className="ehc-k">{t("Risk status", "风控状态")}</span>
          <span className="ehc-v dim-text">
            {t("Phase K — not yet available", "Phase K — 尚未提供")}
          </span>
        </span>
      </div>

      {/* Visible, not hover-only. See rule E. */}
      {impliedText != null && (
        <p className="eh-note" data-testid="hero-implied-note">
          {disclaimer}
        </p>
      )}

      <p className="eh-links">
        <span className="mono eh-key">{event.event_key}</span>
        {event.source_url != null && event.source_url !== "" && (
          <>
            {" · "}
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="src-link"
            >
              {t("Open source →", "打开来源 →")}
            </a>
          </>
        )}
        {onOpenTab != null && (
          <>
            {" · "}
            <button
              type="button"
              className="linkish"
              onClick={() => onOpenTab("since")}
              data-testid="hero-open-timeline"
            >
              {t("Timeline since last event →", "自上次事件以来的时间线 →")}
            </button>
          </>
        )}
        {event.previous_event != null && (
          <>
            {" · "}
            <Link href={`/catalysts/${event.previous_event.event_id}`} className="src-link">
              {t("Previous event →", "上一次事件 →")}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
