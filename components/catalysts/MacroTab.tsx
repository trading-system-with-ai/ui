"use client";

/**
 * Phase G §8/§38–§41 — the "Macro" tab.
 *
 * The question this tab answers is the one a trader asks before a government
 * data release: "what did it print last time, what is it expected to print,
 * what moved when it printed, and what has happened since?" Four sections, in
 * that order, because that is the order the question is asked in.
 *
 * Rules specific to this tab:
 *
 *  A. THE CONSENSUS IS ALWAYS UNAVAILABLE, AND SAYS SO LOUDLY. This platform
 *     subscribes to no estimate provider. Every other macro surface a trader
 *     has ever used puts a consensus beside the actual, so an EMPTY cell here
 *     would not read as "we don't have it" — it would read as "there isn't
 *     one", or worse, be filled in from memory. The marker is rendered as a
 *     badge in the same slot the number would occupy, on both the previous and
 *     the current release. It is the most important thing on the tab that is
 *     not a number.
 *  B. A PROXY IS BADGED EVERYWHERE IT APPEARS. IEF is not the 10-year yield
 *     and GLD is not gold. The badge rides on the asset row, the chart's axis
 *     label and the chart's footnote, because a reader who takes the proxy for
 *     the thing has been misled by an omission rather than by a wrong number.
 *  C. THE RELEASE-TIME BASIS IS VISIBLE. §7's rule that a derived date must
 *     never read as a scheduled fact applies to release TIMES. When the packet
 *     says ESTIMATED, the timestamp wears an amber badge — BLS observations
 *     carry no timestamps of their own, and a fallback of period-end + 45 days
 *     is a guess that must look like one.
 *  D. THIS TAB HAS NO LLM ON IT. DATA and QUANT chips only; §41's "which
 *     component will the market care about most" is the ANALYSIS tab's
 *     question, and the separation is enforced here by the tab boundary.
 *  E. THE GET NEVER FETCHES. Opening this tab reads stored observations, bars
 *     and yields. Spending a government API call is the explicit Backfill
 *     button, which is the only control on the tab.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/components/shared/Toast";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type {
  EventMacroBackfillResult,
  EventMacroPayload,
  MacroAssetReaction,
  MacroPreviousReaction,
} from "@/lib/types-macro";
import { TierChip } from "./EvidenceSections";
import { EVENT_TYPE_LABEL } from "./event-format";
import MacroReactionChart, { type MacroReactionRow } from "./MacroReactionChart";
import {
  REACTION_HORIZONS,
  YIELD_TENORS,
  assetRoleLabel,
  consensusText,
  surpriseText,
  coverageNotes,
  directionText,
  fmtActual,
  fmtBp,
  fmtPrint,
  fmtReturnPct,
  hasPacket,
  horizonReturn,
  isProxy,
  orderedAssets,
  orderedRoles,
  roleLabel,
  signColor,
  stampDay,
  stampMinute,
  transformLabel,
  trendPrints,
  trendSeriesIds,
} from "./macro-format";

/* ------------------------------------------------------------- primitives */

/**
 * The §33 marker, in the slot a number would occupy (rule A).
 *
 * A badge rather than plain text: on a table of figures, unstyled prose reads
 * as a footnote, and this is not a footnote — it is the platform declining to
 * supply the number the reader is most primed to look for.
 */
function ConsensusMarker({
  consensus,
  testId,
}: {
  consensus: Parameters<typeof consensusText>[0];
  testId: string;
}) {
  const t = useT();
  return (
    <span className="badge amber mt-consensus" data-testid={testId}>
      {consensusText(consensus, t)}
    </span>
  );
}

/** An instant, with the amber ESTIMATED badge when its basis is a guess. */
function ReleaseStamp({
  iso,
  basis,
  testId,
}: {
  iso: string | null | undefined;
  basis: string | null | undefined;
  testId: string;
}) {
  const t = useT();
  const stamp = stampMinute(iso);
  return (
    <span data-testid={testId}>
      <span className="mono">{stamp == null ? "—" : `${stamp} UTC`}</span>
      {/* Rule C — a derived release time must never read as a scheduled one. */}
      {basis === "ESTIMATED" && (
        <>
          {" "}
          <span className="badge amber" data-testid={`${testId}-estimated`}>
            {t("ESTIMATED", "估算")}
          </span>
        </>
      )}
    </span>
  );
}

/* --------------------------------------------------------------- sections */

/** §38 — the print that already happened, and the estimate we do not have. */
function PreviousRelease({ data }: { data: EventMacroPayload }) {
  const t = useT();
  const previous = data.packet?.previous_release ?? null;
  // The basis belongs to THIS release, not to the packet: a stored schedule
  // row makes the previous print SCHEDULED while the upcoming one is still
  // ESTIMATED. Reading one flag for both would stamp a guess onto a
  // published time, or hide that the other is a guess.
  const basis = previous?.release_time_basis ?? null;

  if (previous == null) {
    return (
      <div className="mt-section" data-testid="macro-previous">
        <h3>
          {t("Previous release", "上次数据发布")} <TierChip tier="DATA" />
        </h3>
        <p className="empty" data-testid="macro-previous-none">
          {t(
            "No earlier release of this series is stored. The packet is built from stored observations only — an absent previous print means those rows have not been backfilled, not that the series never printed.",
            "尚未存储该指标的历史发布数据。数据包仅依据已存储的观测值构建 — 缺少上次数据并不表示该指标从未发布,而是相关数据尚未回填。",
          )}
        </p>
      </div>
    );
  }

  const roles = orderedRoles(previous.actual);

  return (
    <div className="mt-section" data-testid="macro-previous">
      <h3>
        {t("Previous release", "上次数据发布")} <TierChip tier="DATA" />
      </h3>
      <div className="kv">
        <div>
          <div className="k">{t("Reference period", "统计期间")}</div>
          <div className="v mono" data-testid="macro-previous-period">
            {previous.period ?? "—"}
          </div>
        </div>
        <div>
          <div className="k">{t("Released", "发布时间")}</div>
          <div className="v">
            <ReleaseStamp
              iso={previous.release_at}
              basis={basis}
              testId="macro-previous-release-at"
            />
          </div>
        </div>
      </div>

      {roles.length === 0 ? (
        <p className="empty" data-testid="macro-previous-no-actuals">
          {t(
            "The release is on file but none of its series has a stored observation for that period.",
            "该次发布已记录,但其各项指标在该期间均无已存储的观测值。",
          )}
        </p>
      ) : (
        <table className="mt-table" data-testid="macro-actuals-table">
          <thead>
            <tr>
              <th>{t("Reading", "读数")}</th>
              <th>{t("Series", "指标")}</th>
              <th>{t("Basis", "口径")}</th>
              <th className="num">{t("Actual", "实际值")}</th>
              <th>{t("Consensus", "市场预期")}</th>
              <th>{t("Surprise", "超预期幅度")}</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const actual = previous.actual?.[role] ?? null;
              const text = fmtActual(actual);
              return (
                <tr key={role} data-testid={`macro-actual-${role}`}>
                  <td>{roleLabel(role, t)}</td>
                  <td className="mono mt-dim">{actual?.label ?? actual?.series_id ?? "—"}</td>
                  <td>
                    {transformLabel(actual?.transform, t) ?? "—"}
                    {/* NSA vs SA changes what a monthly change MEANS; the
                        packet documents it, so the table prints it. */}
                    {actual?.seasonally_adjusted === false && (
                      <>
                        {" "}
                        <span className="badge dim" data-testid={`macro-nsa-${role}`}>
                          {t("NSA", "未季调")}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="num mono mt-actual" data-testid={`macro-actual-value-${role}`}>
                    {text ?? "—"}
                  </td>
                  {/* Rule A — same slot the number would occupy. */}
                  <td>
                    <ConsensusMarker
                      consensus={previous.consensus}
                      testId={`macro-consensus-${role}`}
                    />
                  </td>
                  <td>
                    <span className="badge dim" data-testid={`macro-surprise-${role}`}>
                      {surpriseText(previous.surprise, t)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** §38 — the print that has not happened. A period, a time, and no estimate. */
function CurrentRelease({ data }: { data: EventMacroPayload }) {
  const t = useT();
  const current = data.packet?.current_release ?? null;
  const basis = current?.release_time_basis ?? null;

  return (
    <div className="mt-section" data-testid="macro-current">
      <h3>
        {t("This release", "本次数据发布")} <TierChip tier="DATA" />
      </h3>
      {current == null ? (
        <p className="empty" data-testid="macro-current-none">
          {t(
            "No scheduled release is stored for this event's series.",
            "该事件对应指标暂无已存储的发布计划。",
          )}
        </p>
      ) : (
        <div className="kv">
          <div>
            <div className="k">{t("Reference period", "统计期间")}</div>
            <div className="v mono" data-testid="macro-current-period">
              {current.period ?? "—"}
            </div>
          </div>
          <div>
            <div className="k">{t("Scheduled", "预定发布")}</div>
            <div className="v">
              <ReleaseStamp
                iso={current.release_at}
                basis={basis}
                testId="macro-current-release-at"
              />
            </div>
          </div>
          <div>
            <div className="k">{t("Consensus", "市场预期")}</div>
            <div className="v">
              <ConsensusMarker
                consensus={current.consensus}
                testId="macro-current-consensus"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** §38 — the run of prints behind the release, with the server's direction. */
function RecentTrend({ data }: { data: EventMacroPayload }) {
  const t = useT();
  const trend = data.packet?.recent_trend ?? null;
  const ids = trendSeriesIds(trend);

  if (ids.length === 0) {
    return (
      <div className="mt-section" data-testid="macro-trend">
        <h3>
          {t("Recent trend", "近期走势")} <TierChip tier="QUANT" />
        </h3>
        <p className="empty" data-testid="macro-trend-none">
          {t(
            "No stored run of prints for this series yet.",
            "该指标暂无已存储的历史发布序列。",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-section" data-testid="macro-trend">
      <h3>
        {t("Recent trend", "近期走势")} <TierChip tier="QUANT" />
      </h3>
      {ids.map((seriesId) => {
        const series = trend?.[seriesId] ?? null;
        const prints = trendPrints(series);
        // Rule C of macro-format — the server's word, printed, never re-derived.
        const direction = directionText(series?.direction, t);
        return (
          <div key={seriesId} className="mt-trend" data-testid={`macro-trend-${seriesId}`}>
            <div className="mt-trend-head">
              <span className="mt-trend-label">{series?.label ?? seriesId}</span>
              <span className="mono mt-dim">{seriesId}</span>
              {direction != null && (
                <span className="badge dim" data-testid={`macro-direction-${seriesId}`}>
                  {direction.glyph} {direction.text}
                </span>
              )}
            </div>
            {prints.length === 0 ? (
              <p className="empty">{t("No prints stored.", "暂无已存储的发布数据。")}</p>
            ) : (
              <table className="mt-table" data-testid={`macro-trend-table-${seriesId}`}>
                <thead>
                  <tr>
                    <th>{t("Period", "期间")}</th>
                    <th className="num">{t("Value", "数值")}</th>
                    <th className="num">{t("Prior", "前值")}</th>
                    <th>{t("Released", "发布时间")}</th>
                  </tr>
                </thead>
                <tbody>
                  {prints.map((print, i) => (
                    <tr key={`${print.period ?? i}`} data-testid="macro-trend-row">
                      <td className="mono">{print.period ?? "—"}</td>
                      <td className="num mono">{fmtPrint(print, series) ?? "—"}</td>
                      <td className="num mono mt-dim">
                        {fmtPrint({ value: print.prior }, series) ?? "—"}
                      </td>
                      <td className="mono mt-dim">{stampDay(print.release_at) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** §39 — what moved when it last printed. Chart, table, and yields apart. */
function PreviousReaction({ reaction }: { reaction: MacroPreviousReaction | null }) {
  const t = useT();

  if (reaction == null) {
    return (
      <div className="mt-section" data-testid="macro-reaction">
        <h3>
          {t("Previous market reaction", "上次市场反应")} <TierChip tier="QUANT" />
        </h3>
        <p className="empty" data-testid="macro-reaction-none">
          {t(
            "No reaction is stored for the previous release. This is measured from stored daily bars for the reference assets — backfilling the macro data fills it.",
            "上次数据发布暂无已存储的市场反应。该指标依据参考资产的已存储日 K 线计算 — 回填宏观数据后即可显示。",
          )}
        </p>
      </div>
    );
  }

  const symbols = orderedAssets(reaction.assets);
  const unavailable = Array.isArray(reaction.unavailable) ? reaction.unavailable : [];
  const yields = reaction.yields ?? null;

  const rows: MacroReactionRow[] = symbols.map((symbol) => {
    const asset: MacroAssetReaction | null = reaction.assets?.[symbol] ?? null;
    return {
      key: symbol,
      label: symbol,
      d1: horizonReturn(asset, "1D"),
      d5: horizonReturn(asset, "5D"),
      proxy: isProxy(asset?.role),
    };
  });

  return (
    <div className="mt-section" data-testid="macro-reaction">
      <h3>
        {t("Previous market reaction", "上次市场反应")} <TierChip tier="QUANT" />
      </h3>
      <p className="an-note">
        {t(
          "Measured from stored daily bars around the previous release, from the last close before it to the first close on or after the first tradeable session. Every one of these is a liquid ETF standing in for an exposure — it is not the exposure itself.",
          "依据上次数据发布前后的已存储日 K 线计算,自发布前最后一个收盘价起,至首个可交易时段当日或之后的首个收盘价止。以下均为代表相应敞口的流动性 ETF — 并非敞口本身。",
        )}
      </p>

      <div className="kv">
        <div>
          <div className="k">{t("Measured around", "计算基准时点")}</div>
          <div className="v mono" data-testid="macro-reaction-at">
            {stampMinute(reaction.event_at_utc) ?? "—"}
          </div>
        </div>
      </div>

      {/* Rule D of the chart — yields are in bp, the assets in percent, so
          they never share an axis. Their own tiles, at their own scale. */}
      {yields != null && (
        <div className="mt-yields" data-testid="macro-yields">
          {YIELD_TENORS.map((tenor) => {
            // The server sends a YieldChange OBJECT per tenor, not a bare
            // number: the change in bp travels beside the two levels it was
            // measured from and a reason for its own absence. Reading
            // `change_bp` off it is what keeps "the curve did not move" (0.0)
            // distinct from "no curve was stored" (null + reason).
            const entry = yields[tenor.key];
            const value =
              entry != null && typeof entry.change_bp === "number" && Number.isFinite(entry.change_bp)
                ? entry.change_bp
                : null;
            return (
              <div key={tenor.key} className="mt-yield" data-testid={`macro-yield-${tenor.key}`}>
                <div className="k">{t(tenor.en, tenor.zh)}</div>
                <div className="mt-yield-v mono" style={{ color: signColor(value) }}>
                  {fmtBp(value) ?? "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MacroReactionChart rows={rows} />

      {symbols.length > 0 && (
        <table className="mt-table" data-testid="macro-reaction-table">
          <thead>
            <tr>
              <th>{t("Asset", "资产")}</th>
              <th>{t("Stands for", "代表敞口")}</th>
              {REACTION_HORIZONS.map((h) => (
                <th key={h} className="num">
                  {h === "1D" ? t("1 day", "1 天") : t("5 days", "5 天")}
                </th>
              ))}
              <th>{t("First reaction", "首个反应日")}</th>
            </tr>
          </thead>
          <tbody>
            {symbols.map((symbol) => {
              const asset = reaction.assets?.[symbol] ?? null;
              return (
                <tr key={symbol} data-testid={`macro-asset-${symbol}`}>
                  <td className="mono">{symbol}</td>
                  <td>
                    {assetRoleLabel(asset?.role, t) ?? "—"}
                    {/* Rule B — badged everywhere it appears. */}
                    {isProxy(asset?.role) && (
                      <>
                        {" "}
                        <span className="badge dim" data-testid={`macro-proxy-${symbol}`}>
                          {t("PROXY", "代理")}
                        </span>
                      </>
                    )}
                  </td>
                  {REACTION_HORIZONS.map((h) => {
                    const v = horizonReturn(asset, h);
                    return (
                      <td
                        key={h}
                        className="num mono"
                        style={{ color: signColor(v) }}
                        data-testid={`macro-return-${symbol}-${h}`}
                      >
                        {fmtReturnPct(v) ?? "—"}
                      </td>
                    );
                  })}
                  <td className="mono mt-dim">
                    {stampDay(asset?.react_date) ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* An asset the server could not measure is NAMED, never dropped: a
          shorter table would read as a complete one. */}
      {unavailable.length > 0 && (
        <div className="mt-unavailable" data-testid="macro-reaction-unavailable">
          <span className="k">{t("Not measured", "未纳入计算")}</span>
          <ul>
            {unavailable.map((entry, i) => (
              <li key={`${entry.symbol ?? i}`}>
                <span className="mono">{entry.symbol ?? "—"}</span>
                {/* Verbatim server reason. */}
                <span className="mt-dim"> — {entry.reason ?? t("no reason given", "未提供原因")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** §40 — other prints and Fed speeches between the last release and as-of. */
function RelatedEvidence({ data }: { data: EventMacroPayload }) {
  const t = useT();
  const related = data.related_evidence ?? null;
  // Server key is `events` (U2's related_evidence_window), with the bounds
  // flat as `window_start` / `window_end` — not a nested `window` object.
  const items = Array.isArray(related?.events) ? related.events : [];

  return (
    <div className="mt-section" data-testid="macro-related">
      <h3>
        {t("Related evidence since", "此后的相关证据")} <TierChip tier="DATA" />
      </h3>
      <div className="tl-window mono" data-testid="macro-related-window">
        <span className="k">{t("Window", "窗口")}</span>{" "}
        {stampDay(related?.window_start) ?? "—"} → {stampDay(related?.window_end) ?? "—"}
      </div>
      {items.length === 0 ? (
        <p className="empty" data-testid="macro-related-empty">
          {t(
            "No other macro print or Fed speech is stored between the previous release and the as-of instant. That is a state, not a gap.",
            "在上次数据发布与计算时点之间,没有已存储的其他宏观数据或美联储讲话。这是一种状态,而非数据缺口。",
          )}
        </p>
      ) : (
        <ul className="mt-related-list">
          {items.map((item, i) => {
            const label = item.event_type == null ? null : EVENT_TYPE_LABEL[
              item.event_type as keyof typeof EVENT_TYPE_LABEL
            ];
            return (
              <li key={`${item.event_id ?? i}`} data-testid="macro-related-item">
                <span className="mono mt-dim">{stampDay(item.scheduled_at) ?? "—"}</span>{" "}
                <span className="chip">
                  {label == null
                    ? (item.event_type ?? "—").replace(/_/g, " ")
                    : t(label.en, label.zh)}
                </span>{" "}
                {item.title ?? "—"}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- content */

/**
 * The render half, split from the query half so tests mount it with a fixed
 * payload and no network — the same split TimelineTab and AnalysisTab use.
 */
export function MacroTabContent({
  data,
  onBackfill,
  backfilling = false,
}: {
  data: EventMacroPayload | null | undefined;
  onBackfill?: () => void;
  backfilling?: boolean;
}) {
  const t = useT();
  const notes = coverageNotes(data?.coverage ?? data?.packet?.coverage);

  return (
    <div className="panel" data-testid="macro-panel">
      <h2>
        {t("Macro release", "宏观数据发布")} <TierChip tier="DATA" />{" "}
        <TierChip tier="QUANT" />
      </h2>
      <p className="an-note">
        {t(
          "The government release behind this event: what it printed last time, what is scheduled next, the run of prints behind both, and what markets did when it last landed. Everything here is measured from stored observations and stored bars — opening this tab fetches nothing.",
          "本页展示该事件对应的政府数据发布：上次公布值、下次发布计划、二者背后的历史序列,以及上次发布时的市场表现。所有内容均依据已存储的观测值与 K 线计算 — 打开本标签页不会触发任何数据抓取。",
        )}
      </p>

      {/* Rule A, stated once at the top in addition to per-row: the reader
          should meet it before the first number, not after. */}
      <div className="capability-banner" role="status" data-testid="macro-disclaimer">
        <p className="cb-line">
          <span className="badge amber">
            {t("CONSENSUS DATA UNAVAILABLE", "无市场一致预期数据")}
          </span>{" "}
          {/* Verbatim server disclaimer when it sends one. */}
          {data?.disclaimer ??
            t(
              "This platform subscribes to no economic-estimate provider, so no consensus and no surprise figure is shown for any release. An actual print is reported on its own terms, against its own history — never against a number nobody here can source.",
              "本平台未订阅任何经济数据预期服务,因此不展示任何发布的市场一致预期与超预期幅度。实际公布值仅依据其自身口径及历史序列呈现 — 绝不与任何无法溯源的数字比较。",
            )}
        </p>
      </div>

      {!hasPacket(data) && (
        <p className="empty" data-testid="macro-empty">
          {t(
            "No macro packet is stored for this event yet. This tab reads observations the platform has already downloaded from the statistical agency — press Backfill to fetch them.",
            "该事件尚无已存储的宏观数据包。本标签页读取平台此前已从统计机构下载的观测值 — 点击「回填」以获取数据。",
          )}
        </p>
      )}

      <PreviousRelease data={data ?? {}} />
      <CurrentRelease data={data ?? {}} />
      <RecentTrend data={data ?? {}} />
      <PreviousReaction reaction={data?.previous_release_reaction ?? null} />
      <RelatedEvidence data={data ?? {}} />

      {notes.length > 0 && (
        <ul className="ot-notes" data-testid="macro-coverage">
          {notes.map((note, i) => (
            /* Verbatim server coverage note. */
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {onBackfill != null && (
        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={onBackfill}
            disabled={backfilling}
            data-testid="macro-backfill"
          >
            {backfilling
              ? t("Backfilling…", "回填中…")
              : t("Backfill macro data", "回填宏观数据")}
          </button>
        </div>
      )}
      <p className="action-note">
        {t(
          "Backfill is the only control here that spends anything: it calls the statistical agency's public API for this release's series, the Treasury yield curve, and the daily bars of the reference assets. Reading this tab never does.",
          "「回填」是本页唯一会消耗外部调用的操作：它会请求统计机构的公开 API 获取本次发布相关指标、美国财政部收益率曲线,以及各参考资产的日 K 线数据。仅浏览本页则不会。",
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- tab */

export default function MacroTab({
  eventId,
  asOf,
}: {
  eventId: number;
  asOf?: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [, setNonce] = useState(0);

  const query = useQuery({
    queryKey: ["event-macro", eventId, asOf ?? null],
    queryFn: () => api.events.macro(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event-macro", eventId] });
    qc.invalidateQueries({ queryKey: ["audit"] });
    setNonce((n) => n + 1);
  };

  /**
   * Report a backfill by what the SERVER stored, never by the fact the request
   * returned 200. A backfill that stored nothing is a RESULT with a reason
   * (the agency rate-limited us, no key is configured for BEA), and calling it
   * a success would imply observations that are not there.
   */
  const backfill = useMutation({
    mutationFn: () => api.events.backfillMacro(eventId),
    onSuccess: (result: EventMacroBackfillResult) => {
      // The server reports what it stored under `counts`, keyed by what was
      // stored rather than by a flat total — an observation, a yield curve and
      // a price bar come from three different agencies and any one of them can
      // come back empty while the others succeed.
      const counts = result.counts ?? {};
      const observations = counts.observations ?? 0;
      const yields = counts.yield_curves ?? 0;
      const bars = counts.bars ?? 0;
      const total = observations + yields + bars;
      if (!Number.isFinite(total) || total <= 0) {
        toast(
          "INFO",
          t(
            `Nothing was stored: ${result.reason ?? result.status ?? "the server gave no reason"}`,
            `未存储任何数据：${result.reason ?? result.status ?? "服务端未提供原因"}`,
          ),
        );
      } else {
        toast(
          "SUCCESS",
          t(
            `Stored ${observations} observation${observations === 1 ? "" : "s"}, ${yields} yield row${yields === 1 ? "" : "s"} and ${bars} daily bar${bars === 1 ? "" : "s"}.`,
            `已存储 ${observations} 条观测值、${yields} 条收益率曲线数据与 ${bars} 条日 K 线数据。`,
          ),
        );
      }
      invalidate();
    },
    onError: (e: Error) =>
      toast(
        "WARNING",
        t(`Macro backfill failed: ${e.message}`, `宏观数据回填失败：${e.message}`),
      ),
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("Macro release", "宏观数据发布")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null) {
    return (
      <div className="panel">
        <h2>{t("Macro release", "宏观数据发布")}</h2>
        {/* Verbatim server message — a paraphrased error is an error that
            cannot be matched against the logs that produced it. */}
        <p className="error" data-testid="macro-error">
          {t(
            `Could not load the macro release: ${query.error.message}`,
            `无法加载宏观数据：${query.error.message}`,
          )}
        </p>
      </div>
    );
  }

  return (
    <MacroTabContent
      data={query.data}
      onBackfill={() => backfill.mutate()}
      backfilling={backfill.isPending}
    />
  );
}
