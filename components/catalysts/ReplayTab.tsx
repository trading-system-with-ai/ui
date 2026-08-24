"use client";

/**
 * Phase C — the "Previous Event" tab: the §20 replay of the linked previous
 * comparable event.
 *
 * §20's question is "what happened LAST time, minute by minute", and the
 * blocks answer it in the order a trader reconstructs it:
 *
 *   1. What was knowable BEFORE the release (references only, never copies).
 *   2. The release itself — the instant, in both clocks, and who said so.
 *   3. The IMMEDIATE reaction: after-hours / gap at open / +5m / +30m / +60m.
 *   4. The SUBSEQUENT reaction: the daily 1D/3D/5D/10D and abnormal-vs-SPY
 *      that Phase E1 already measures, unchanged.
 *
 * Two honesty rules are specific to this tab and neither exists on the daily
 * surfaces:
 *
 *  A. MINUTE BARS ARE ABSENT BY DEFAULT, AND THAT IS NOT AN ERROR. One event
 *     window is a full trading day of per-minute bars, so the GET never
 *     fetches — it reads what is stored. A replay with no stored window
 *     renders the server's reason plus the button that fetches it, as a
 *     STATE with a remedy rather than a failure.
 *  B. AN ASSUMED SESSION IS LABELLED (§85). An UNKNOWN-session release has no
 *     known position relative to the session, so the library assumes an
 *     after-market print and marks the result low confidence. That badge is
 *     rendered from the payload's own `basis`/`confidence` — the tab cannot
 *     assert a confidence the server did not.
 *
 * Everything else follows Phase E1: server reasons render verbatim (§26/§36),
 * a null is never a zero, and provenance comes from the payload's own block.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Term from "@/components/shared/Term";
import { useToast } from "@/components/shared/Toast";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type {
  EventBackfillResult,
  EventIntradayReaction,
  EventReplayInfoRef,
  EventReplayPayload,
  EventReplayRelease,
  EventReplaySubsequent,
  IntradayWindowCell,
} from "@/lib/types";
import { SESSION_SHORT } from "./event-format";
import type { TFn } from "./event-format";
import { ABNORMAL_HORIZONS, HORIZONS, horizonValue } from "./price-format";
import {
  INTRADAY_WINDOWS,
  fmtMultiple,
  fmtRatioPct,
  fmtVolume,
  isAssumedBasis,
  isoStamp,
  lagNote,
  reasonFor,
  signColor,
  unavailableText,
  windowCell,
} from "./replay-format";

/* --------------------------------------------------------------- tiles */

/**
 * One reaction tile. Identical null contract to the Price tab's: `value`
 * null is the ONLY route to the unavailable line, so a tile can never show
 * both a number and a reason, and never neither.
 */
function ReactionTile({
  label,
  termKey,
  value,
  reason,
  sub,
  color,
  testId,
}: {
  label: string;
  termKey: string;
  value: string | null;
  reason: string | null;
  sub?: string | null;
  color?: string;
  testId?: string;
}) {
  const t = useT();
  return (
    <div className="stat pt-tile" data-testid={testId}>
      <div className="label">
        <Term k={termKey}>
          <span>{label}</span>
        </Term>
      </div>
      {value == null ? (
        <div className="pt-unavailable">{unavailableText(reason, t)}</div>
      ) : (
        <>
          <div className="value" style={color ? { color } : undefined}>
            {value}
          </div>
          {sub != null && sub !== "" && <div className="sub">{sub}</div>}
        </>
      )}
    </div>
  );
}

/** The §85 assumed-session badge. Rendered ONLY from the payload's own fields. */
function AssumedBadge({ reaction }: { reaction: EventIntradayReaction }) {
  const t = useT();
  if (!isAssumedBasis(reaction)) return null;
  const basis = reaction.basis ?? "unknown_session";
  return (
    <Term k="event_intraday_confidence">
      <span
        className="badge amber"
        data-testid="assumed-session"
        title={t(
          `Session unknown — an after-market release was ASSUMED (basis: ${basis}). Confidence: ${reaction.confidence ?? "low"}.`,
          `时段未知 — 已按盘后发布「假定」处理(依据：${basis}）。置信度：${reaction.confidence ?? "low"}。`,
        )}
      >
        {t("ASSUMED SESSION", "时段为假定值")}
      </span>
    </Term>
  );
}

/**
 * One +5m/+30m/+60m tile.
 *
 * When the bar that satisfied the mark is more than a minute off the mark,
 * the lag is shown: a +30m read filled by a bar 14 minutes late is a real
 * measurement but not a 30-minute one, and a tile that hides that overstates
 * its own precision.
 */
function WindowTile({
  minutes,
  cell,
}: {
  minutes: number;
  cell: IntradayWindowCell | null;
}) {
  const t = useT();
  const lag = lagNote(cell, t);
  const stamp = isoStamp(cell?.bar_ts_utc);
  const sub = [lag, stamp != null ? `${stamp} UTC` : null]
    .filter((x): x is string => x != null)
    .join(" · ");
  return (
    <ReactionTile
      testId={`window-${minutes}m`}
      label={t(`+${minutes}m`, `+${minutes} 分钟`)}
      termKey="event_intraday_windows"
      value={fmtRatioPct(cell?.move, 1, true)}
      reason={cell?.reason ?? null}
      sub={sub === "" ? null : sub}
      color={signColor(cell?.move)}
    />
  );
}

/**
 * (3) The immediate, minute-level reaction.
 *
 * `available: false` here is the ORDINARY case on a first visit — minute
 * bars are backfilled per event on user action — so it renders as a state
 * with its remedy attached, never as a failure.
 */
function ImmediateReaction({
  reaction,
  onBackfill,
  backfilling,
}: {
  reaction: EventIntradayReaction | null | undefined;
  onBackfill: () => void;
  backfilling: boolean;
}) {
  const t = useT();
  const provenance = reaction?.provenance ?? "QUANT";

  const header = (
    <h2>
      {t("Immediate reaction (minute bars)", "即时反应（分钟 K 线）")}{" "}
      <span className="provenance quant-derived">
        {t(provenance, provenance === "QUANT" ? "量化" : provenance)}
      </span>{" "}
      {reaction != null && <AssumedBadge reaction={reaction} />}
    </h2>
  );

  const backfillButton = (
    <div className="row" style={{ marginTop: 12 }}>
      <Term k="event_minute_bars_backfill">
        <span className="k">{t("Minute bars", "分钟 K 线")}</span>
      </Term>
      <button
        type="button"
        onClick={onBackfill}
        disabled={backfilling}
        data-testid="load-minute-bars"
      >
        {backfilling
          ? t("Loading minute bars…", "正在加载分钟 K 线…")
          : t("Load minute bars", "加载分钟 K 线")}
      </button>
    </div>
  );

  if (reaction == null || reaction.available !== true) {
    return (
      <div className="panel">
        {header}
        <p className="empty" data-testid="intraday-unavailable">
          {unavailableText(
            reaction?.reason ?? reasonFor(reaction?.reasons, "bars", "minute_bars"),
            t,
          )}
        </p>
        <p className="pt-note">
          {t(
            "Minute bars are fetched only on request: one event window is a full trading day of per-minute bars for this symbol, so loading the page never spends a provider call you did not ask for.",
            "分钟 K 线仅在你请求时才抓取:单个事件窗口相当于该标的一整个交易日的分钟级 K 线,因此打开页面绝不会消耗你未主动请求的数据源调用。",
          )}
        </p>
        {backfillButton}
      </div>
    );
  }

  const r = (...keys: string[]) => reasonFor(reaction.reasons, ...keys);
  const volumeRatio = fmtMultiple(reaction.volume_ratio_first_30m);
  const volumeAbs = fmtVolume(reaction.volume_first_30m);
  const volumeBase = fmtVolume(reaction.avg_volume_first_30m_prior_5_days);

  return (
    <div className="panel">
      {header}
      <p className="pt-freshness" data-testid="intraday-basis">
        {t("Basis", "测量依据")}{" "}
        {/* Verbatim server token — WHICH anchor rule produced these numbers. */}
        <span className="mono">{reaction.basis ?? "—"}</span>
        {" · "}
        {t("confidence", "置信度")}{" "}
        <span className="mono">{reaction.confidence ?? "—"}</span>
        {" · "}
        <span className="mono">{reaction.bars_used ?? 0}</span>{" "}
        {t("minute bars", "根分钟 K 线")}
        {reaction.pre_event_close != null && (
          <>
            {" · "}
            {t("pre-event close", "事件前收盘")}{" "}
            <span className="mono">{reaction.pre_event_close.toFixed(2)}</span>
          </>
        )}
      </p>

      <div className="statbar">
        <ReactionTile
          testId="tile-after-hours"
          label={t("After-hours move", "盘后波动")}
          termKey="event_after_hours_move"
          value={fmtRatioPct(reaction.after_hours_move, 1, true)}
          reason={r("after_hours_move", "after_hours")}
          sub={
            reaction.after_hours_bars != null && reaction.after_hours_bars > 0
              ? t(
                  `${reaction.after_hours_bars} bars · last ${isoStamp(reaction.after_hours_last_ts) ?? "—"} UTC`,
                  `${reaction.after_hours_bars} 根 K 线 · 最后 ${isoStamp(reaction.after_hours_last_ts) ?? "—"} UTC`,
                )
              : null
          }
          color={signColor(reaction.after_hours_move)}
        />
        <ReactionTile
          testId="tile-premarket"
          label={t("Pre-market move", "盘前波动")}
          termKey="event_after_hours_move"
          value={fmtRatioPct(reaction.premarket_move, 1, true)}
          reason={r("premarket_move", "premarket")}
          sub={
            reaction.premarket_bars != null && reaction.premarket_bars > 0
              ? t(
                  `${reaction.premarket_bars} bars · last ${isoStamp(reaction.premarket_last_ts) ?? "—"} UTC`,
                  `${reaction.premarket_bars} 根 K 线 · 最后 ${isoStamp(reaction.premarket_last_ts) ?? "—"} UTC`,
                )
              : null
          }
          color={signColor(reaction.premarket_move)}
        />
        <ReactionTile
          testId="tile-gap"
          label={t("Gap at open", "开盘跳空")}
          termKey="event_gap_at_open"
          value={fmtRatioPct(reaction.gap_at_open, 1, true)}
          reason={r("gap_at_open", "open_price", "open")}
          sub={
            reaction.open_ts != null
              ? t(
                  `open ${isoStamp(reaction.open_ts)} UTC`,
                  `开盘 ${isoStamp(reaction.open_ts)} UTC`,
                )
              : null
          }
          color={signColor(reaction.gap_at_open)}
        />
        {INTRADAY_WINDOWS.map((m) => (
          <WindowTile key={m} minutes={m} cell={windowCell(reaction.windows, m)} />
        ))}
        <ReactionTile
          testId="tile-first-hour"
          label={t("Max move, first hour", "首小时最大波幅")}
          termKey="event_first_hour_range"
          value={fmtRatioPct(reaction.max_move_first_hour, 1)}
          reason={r("max_move_first_hour")}
          sub={t("absolute — magnitude only", "取绝对值 — 仅衡量幅度")}
        />
        <ReactionTile
          testId="tile-volume"
          label={t("First 30m volume vs normal", "首 30 分钟成交量 vs 常态")}
          termKey="event_intraday_volume"
          value={volumeRatio}
          reason={r(
            "volume_ratio_first_30m",
            "avg_volume_first_30m_prior_5_days",
            "volume_first_30m",
          )}
          sub={
            volumeAbs != null && volumeBase != null
              ? t(
                  `${volumeAbs} vs ${volumeBase} normal`,
                  `${volumeAbs} vs 常态 ${volumeBase}`,
                )
              : volumeAbs != null
                ? t(`${volumeAbs} traded`, `成交 ${volumeAbs}`)
                : null
          }
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- release */

/** (2) The release itself — both clocks, always (§10). */
function ReleaseBlock({ release }: { release: EventReplayRelease | undefined }) {
  const t = useT();
  const sessionLabel =
    release?.session != null ? SESSION_SHORT[release.session] : null;
  return (
    <div className="panel">
      <h2>
        {t("Release", "公布")}{" "}
        <span className="provenance data-driven">{t("DATA", "数据")}</span>
      </h2>
      <div className="kv">
        <div>
          <div className="k">{t("Timestamp (ET)", "时间（美东）")}</div>
          <div className="v mono" data-testid="release-et">
            {isoStamp(release?.timestamp_et) ?? "—"}
          </div>
        </div>
        <div>
          <div className="k">{t("Timestamp (UTC)", "时间（UTC）")}</div>
          <div className="v mono" data-testid="release-utc">
            {isoStamp(release?.timestamp_utc) ?? "—"}
          </div>
        </div>
        <div>
          <div className="k">{t("Session", "交易时段")}</div>
          <div className="v">
            <Term k="event_session_timing">
              <span>
                {sessionLabel == null
                  ? t("Session unknown", "时段未知")
                  : t(sessionLabel.en, sessionLabel.zh)}
              </span>
            </Term>
          </div>
        </div>
        <div>
          <div className="k">{t("Source", "来源")}</div>
          <div className="v">
            {/* Verbatim server token — the audit record of who asserted it. */}
            {release?.source_name ?? "—"}
            {release?.source_url != null && release.source_url !== "" && (
              <>
                {" "}
                <a
                  href={release.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="src-link"
                >
                  {t("Open source →", "打开来源 →")}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------- information before */

/** Label for each `information_before` reference block. */
const INFO_LABEL: Record<string, { en: string; zh: string }> = {
  fundamentals: { en: "Fundamentals snapshot", zh: "基本面快照" },
  price_context: { en: "Pre-event price context", zh: "事件前价格背景" },
  news_window: { en: "News window", zh: "新闻窗口" },
};

/**
 * (1) What was knowable BEFORE the release.
 *
 * Each entry is a REFERENCE, not a copy. An absent one is
 * `{available:false, reason}` rather than a missing key, because "no news
 * block was built" and "there was no news" are different claims and a UI
 * that cannot tell them apart prints the wrong sentence (§85).
 */
function InformationBefore({
  info,
}: {
  info: Record<string, EventReplayInfoRef> | undefined;
}) {
  const t = useT();
  const entries = Object.entries(info ?? {});
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="panel">
      <h2>{t("Known before the release", "公布前已知的信息")}</h2>
      <ul className="pt-unavailable-list" data-testid="information-before">
        {entries.map(([key, ref]) => {
          const label = INFO_LABEL[key];
          return (
            <li key={key}>
              <span className="k">
                {label == null ? key.replace(/_/g, " ") : t(label.en, label.zh)}
              </span>{" "}
              {ref?.available === true ? (
                <span className="badge dim">{t("AVAILABLE", "可用")}</span>
              ) : (
                <span className="pt-unavailable">{unavailableText(ref?.reason, t)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------ subsequent reaction */

/** One daily-horizon cell. A null is a dim dash carrying its reason. */
function DailyCell({
  label,
  value,
  reason,
}: {
  label: string;
  value: number | null;
  reason: string | null;
}) {
  const t = useT();
  const text = fmtRatioPct(value, 1, true);
  return (
    <div className="stat pt-tile">
      <div className="label">{label}</div>
      {text == null ? (
        <div className="pt-unavailable">{unavailableText(reason, t)}</div>
      ) : (
        <div className="value" style={{ color: signColor(value) }}>
          {text}
        </div>
      )}
    </div>
  );
}

/** (4) Phase E1's daily reaction, unchanged, beside the minute-level one. */
function SubsequentReaction({
  subsequent,
}: {
  subsequent: EventReplaySubsequent | undefined;
}) {
  const t = useT();
  const reaction = subsequent?.reaction ?? null;
  const abnormal = subsequent?.abnormal ?? null;

  if (subsequent == null || subsequent.available !== true || reaction == null) {
    return (
      <div className="panel">
        <h2>
          {t("Subsequent reaction (daily)", "后续反应（日线）")}{" "}
          <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
        </h2>
        <p className="empty" data-testid="subsequent-unavailable">
          {unavailableText(
            subsequent?.reason ?? reasonFor(reaction?.reasons, "bars"),
            t,
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>
        {t("Subsequent reaction (daily)", "后续反应（日线）")}{" "}
        <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
      </h2>
      <p className="cg-meaning">
        {t(
          "Measured close-to-close from the pre-event close. All horizons share that same starting close, so they are cumulative rather than day-by-day.",
          "自事件前收盘价起按收盘价计算。所有周期共用同一个起始收盘价,因此为累计涨跌,而非逐日涨跌。",
        )}
      </p>
      <div className="statbar" data-testid="subsequent-tiles">
        <DailyCell
          label={t("Gap", "跳空")}
          value={reaction.gap_return}
          reason={reasonFor(reaction.reasons, "gap_return")}
        />
        {HORIZONS.map((h) => (
          <DailyCell
            key={h}
            label={`${h}D`}
            value={horizonValue(reaction.returns, h)}
            reason={reasonFor(reaction.reasons, `return_${h}D`, `${h}D`)}
          />
        ))}
        {ABNORMAL_HORIZONS.map((h) => (
          <DailyCell
            key={`ab-${h}`}
            label={t(`${h}D vs SPY`, `${h}日 相对SPY`)}
            value={horizonValue(abnormal?.abnormal, h)}
            reason={
              abnormal?.available === false
                ? (abnormal.reason ?? null)
                : reasonFor(abnormal?.reasons, `abnormal_${h}D`, `${h}D`, "benchmark")
            }
          />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- tab */

/** The header line: which event this replay is OF, and as of when. */
function ReplayHeader({ data, t }: { data: EventReplayPayload; t: TFn }) {
  const ref = data.event;
  const sessionLabel = ref?.session != null ? SESSION_SHORT[ref.session] : null;
  return (
    <div className="panel">
      <h2>
        {t("Replaying", "回放事件")}{" "}
        <span className="provenance data-driven">{t("DATA", "数据")}</span>{" "}
        <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
      </h2>
      <div className="kv">
        <div>
          <div className="k">{t("Event", "事件")}</div>
          <div className="v mono" data-testid="replay-event-key">
            {ref?.event_key ?? data.event_key ?? "—"}
          </div>
        </div>
        <div>
          <div className="k">{t("Date (ET)", "日期(美东)")}</div>
          <div className="v mono">{ref?.date_et ?? "—"}</div>
        </div>
        <div>
          <div className="k">{t("Session", "交易时段")}</div>
          <div className="v">
            {sessionLabel == null
              ? t("Session unknown", "时段未知")
              : t(sessionLabel.en, sessionLabel.zh)}
          </div>
        </div>
        <div>
          <div className="k">
            <Term k="event_bars_as_of">
              <span>{t("As of", "计算时点")}</span>
            </Term>
          </div>
          <div className="v mono" data-testid="replay-as-of">
            {data.as_of ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The tab body, split from the fetching wrapper so the render contract can be
 * tested against a payload directly, with no query client in the way.
 */
export function ReplayTabContent({
  data,
  onBackfill,
  backfilling = false,
}: {
  data: EventReplayPayload;
  onBackfill: () => void;
  backfilling?: boolean;
}) {
  const t = useT();

  // available:false is a RESULT — a FUTURE event has not happened yet, and a
  // macro event has no single ticker to replay. Both are 200s.
  if (data.available === false) {
    return (
      <div className="panel">
        <h2>{t("Event replay", "事件回放")}</h2>
        <p className="empty" data-testid="replay-unavailable">
          {unavailableText(data.reason, t)}
        </p>
      </div>
    );
  }

  return (
    <>
      <ReplayHeader data={data} t={t} />
      <InformationBefore info={data.information_before} />
      <ReleaseBlock release={data.release} />
      <ImmediateReaction
        reaction={data.immediate_reaction}
        onBackfill={onBackfill}
        backfilling={backfilling}
      />
      <SubsequentReaction subsequent={data.subsequent_reaction} />
      <p className="pt-note" data-testid="replay-not-backtestable">
        {data.not_backtestable != null && data.not_backtestable.length > 0 && (
          <>
            {t("Not backtested: ", "未经回测：")}
            <span className="mono">{data.not_backtestable.join(", ")}</span>
            {". "}
          </>
        )}
        {t(
          "This is a record of what happened, not a forecast. Nothing on this tab has been tested as a trading rule, and one previous event is a sample of one.",
          "这是对既往事实的记录,而非预测。本页任何内容都未作为交易规则被检验过,且单次历史事件仅为样本量为 1 的观察。",
        )}
      </p>
    </>
  );
}

/**
 * The fetching wrapper.
 *
 * `eventId` is the PREVIOUS event's id — the caller resolves the §15 linkage
 * and mounts this against it, so the replay endpoint is always asked about
 * the event it is replaying rather than about the upcoming one.
 *
 * `asOf` is threaded into the query key: two as-of instants are two different
 * answers (that is the whole point of the look-ahead gate) and must never
 * share a cache entry.
 */
export default function ReplayTab({
  eventId,
  asOf,
}: {
  eventId: number;
  asOf?: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: ["event-replay", eventId, asOf ?? null],
    queryFn: () => api.events.replay(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  const backfill = useMutation({
    mutationFn: () => api.events.replayBackfill(eventId),
    onSuccess: (result: EventBackfillResult) => {
      const bars = result.bars ?? 0;
      // "Window already stored" is `fetched:false, bars:0` with bars ALREADY
      // present — reporting that as "nothing stored" would tell the user the
      // opposite of the truth, so the stored count is what decides the tone.
      const stored = result.stored_bars ?? 0;
      if (bars === 0 && stored > 0) {
        toast(
          "INFO",
          t(
            `Already stored — ${stored} minute bars are on file for this event window.`,
            `已存储 — 该事件窗口已有 ${stored} 根分钟 K 线。`,
          ),
        );
        qc.invalidateQueries({ queryKey: ["event-replay", eventId] });
        return;
      }
      // A backfill that stored nothing is a RESULT with a reason, not a
      // success — reporting "done" here would imply bars that do not exist.
      if (bars > 0) {
        toast(
          "SUCCESS",
          t(
            `Stored ${bars} minute bars — the reaction below is recomputed from them.`,
            `已存储 ${bars} 根分钟 K 线 — 下方反应指标已据此重新计算。`,
          ),
        );
      } else {
        toast(
          "INFO",
          t(
            `No minute bars were stored: ${result.reason ?? "the server gave no reason"}`,
            `未存储任何分钟 K 线：${result.reason ?? "服务端未提供原因"}`,
          ),
        );
      }
      qc.invalidateQueries({ queryKey: ["event-replay", eventId] });
      qc.invalidateQueries({ queryKey: ["event-history"] });
    },
    onError: (e: Error) =>
      toast(
        "WARNING",
        t(`Backfill failed: ${e.message}`, `回补失败：${e.message}`),
      ),
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("Event replay", "事件回放")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null || query.data == null) {
    return (
      <div className="panel">
        <h2>{t("Event replay", "事件回放")}</h2>
        <p className="error" data-testid="replay-error">
          {t(
            `Could not load the event replay: ${query.error?.message ?? "no response"}`,
            `无法加载事件回放：${query.error?.message ?? "无响应"}`,
          )}
        </p>
      </div>
    );
  }

  return (
    <ReplayTabContent
      data={query.data}
      onBackfill={() => backfill.mutate()}
      backfilling={backfill.isPending}
    />
  );
}
