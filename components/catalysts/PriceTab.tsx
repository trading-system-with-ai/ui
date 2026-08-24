"use client";

/**
 * Phase E1 — the Price tab of the event detail page (spec §19, §31, §32, §64).
 *
 * Three questions, in the order a trader asks them:
 *  1. Where does the stock STAND going in? (pre-event positioning tiles)
 *  2. What did it DO the last dozen times? (previous-reactions table)
 *  3. How big were those moves, and out of how many? (history-stat strip)
 *
 * Everything on this tab is QUANT: measured from stored daily bars by a
 * stated formula, never an LLM opinion and never a forecast. The bars
 * themselves are DATA. Both labels come from the payload's own `provenance`
 * block and are rendered with the existing .provenance classes, so this tab
 * cannot claim a provenance the server did not assert.
 *
 * The honesty rules this file exists to keep, hardest-to-break first:
 *
 *  1. NO FABRICATED NUMBERS. Every missing metric renders "Unavailable —
 *     <server reason>". Not a zero, not a lone em dash, not a blank cell.
 *     The oldest stored earnings events predate the first daily bar, and
 *     those rows say "bars unavailable" with the reason rather than showing
 *     a 0.0% reaction — which is what the whole table would otherwise imply.
 *  2. SAMPLE SIZE TRAVELS WITH THE STATISTIC (§64). "median |1D| 4.2%" alone
 *     is not shippable; "based on 8 events" is part of the sentence, and the
 *     positive tally is "5/8", never "62%" — a count of history is not a
 *     probability of a future.
 *  3. FRESHNESS IS VISIBLE. `as_of` and `bars_through` are shown, because a
 *     15:59 ET load legitimately holds one bar fewer than a 16:01 one, and
 *     an unexplained difference between two loads reads as a bug.
 *  4. `available: false` IS A RESULT, NOT AN ERROR. A macro event has no
 *     ticker; an unconfigured provider has no bars. Both are 200s carrying a
 *     reason, and both render as an explanation rather than a failure state.
 *  5. Server strings render verbatim (§26/§36) — reasons carry real dates and
 *     real shortfalls that no client-side wording could reproduce.
 */
import { useQuery } from "@tanstack/react-query";
import Term from "@/components/shared/Term";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type {
  EventPriceAbnormal,
  EventPriceContext,
  EventPriceHistoryStats,
  EventPricePreContext,
  EventPricePreviousEvent,
  PriceReasons,
} from "@/lib/types";
import { SESSION_SHORT } from "./event-format";
import type { TFn } from "./event-format";
import {
  ABNORMAL_HORIZONS,
  HISTORY_HORIZONS,
  HISTORY_WINDOWS,
  HORIZONS,
  type HistoryWindow,
  fmtPrice,
  fmtRatioPct,
  horizonValue,
  isoDate,
  positiveTally,
  reasonFor,
  signColor,
  unavailableText,
} from "./price-format";

/* ---------------------------------------------------------------- tiles */

/**
 * One pre-event positioning tile.
 *
 * `value` is already-formatted text or null. Null is the ONLY path to the
 * unavailable line — a tile can never show a number and a reason at once,
 * and can never show neither.
 */
function PriceTile({
  label,
  termKey,
  value,
  reason,
  sub,
  color,
}: {
  label: string;
  termKey: string;
  value: string | null;
  reason: string | null;
  sub?: string | null;
  color?: string;
}) {
  const t = useT();
  return (
    <div className="stat pt-tile">
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

/**
 * (a) Pre-event price positioning — §32's "the stock has run up X% since the
 * last print" framing, plus the trend/vol context that says whether that
 * run-up is unusual for this name.
 */
function PreEventTiles({ pre }: { pre: EventPricePreContext }) {
  const t = useT();
  const r = (...keys: string[]) => reasonFor(pre.reasons, ...keys);

  const anchorSub =
    pre.anchor_date_et != null
      ? t(`since ${pre.anchor_date_et}`, `自 ${pre.anchor_date_et} 起`)
      : pre.anchor_basis != null
        ? // Verbatim server token — it names WHICH window was used when there
          // is no previous event to anchor on (e.g. a 63-bar lookback).
          t(`basis: ${pre.anchor_basis}`, `基准：${pre.anchor_basis}`)
        : null;

  return (
    <div className="statbar">
      <PriceTile
        label={t("Run-up since last event", "自上次事件以来涨跌")}
        termKey="event_run_up"
        value={fmtRatioPct(pre.run_up_pct ?? pre.since_anchor_return, 1, true)}
        reason={r("run_up_pct", "since_anchor_return")}
        sub={anchorSub}
        color={signColor(pre.run_up_pct ?? pre.since_anchor_return)}
      />
      <PriceTile
        label={t("vs SPY", "相对 SPY")}
        termKey="event_relative_return"
        value={fmtRatioPct(pre.relative_return, 1, true)}
        reason={r("relative_return", "benchmark_return")}
        sub={
          fmtRatioPct(pre.benchmark_return, 1, true) != null
            ? t(
                `SPY ${fmtRatioPct(pre.benchmark_return, 1, true)}`,
                `SPY ${fmtRatioPct(pre.benchmark_return, 1, true)}`,
              )
            : null
        }
        color={signColor(pre.relative_return)}
      />
      <PriceTile
        label={t("Max drawdown", "最大回撤")}
        termKey="event_max_drawdown_window"
        value={fmtRatioPct(pre.max_drawdown, 1)}
        reason={r("max_drawdown")}
        sub={anchorSub}
      />
      <PriceTile
        label={t("Realized vol 20d", "已实现波动率 20 日")}
        termKey="event_realized_vol_20d"
        value={fmtRatioPct(pre.realized_vol_20d, 1)}
        reason={r("realized_vol_20d")}
        sub={t("annualised", "年化")}
      />
      <PriceTile
        label={t("ATR%", "ATR%")}
        termKey="event_atr_pct"
        value={fmtRatioPct(pre.atr_pct, 2)}
        reason={r("atr_pct", "atr14")}
        sub={
          fmtPrice(pre.atr14) != null
            ? t(`ATR14 ${fmtPrice(pre.atr14)}`, `ATR14 ${fmtPrice(pre.atr14)}`)
            : null
        }
      />
      <PriceTile
        label={t("vs SMA20", "距 20 日均线")}
        termKey="event_sma_distance"
        value={fmtRatioPct(pre.sma20_distance_pct, 1, true)}
        reason={r("sma20_distance_pct", "sma20")}
        sub={fmtPrice(pre.sma20) != null ? `SMA20 ${fmtPrice(pre.sma20)}` : null}
        color={signColor(pre.sma20_distance_pct)}
      />
      <PriceTile
        label={t("vs SMA50", "距 50 日均线")}
        termKey="event_sma_distance"
        value={fmtRatioPct(pre.sma50_distance_pct, 1, true)}
        reason={r("sma50_distance_pct", "sma50")}
        sub={fmtPrice(pre.sma50) != null ? `SMA50 ${fmtPrice(pre.sma50)}` : null}
        color={signColor(pre.sma50_distance_pct)}
      />
      <PriceTile
        label={t("vs SMA200", "距 200 日均线")}
        termKey="event_sma_distance"
        value={fmtRatioPct(pre.sma200_distance_pct, 1, true)}
        reason={r("sma200_distance_pct", "sma200")}
        sub={fmtPrice(pre.sma200) != null ? `SMA200 ${fmtPrice(pre.sma200)}` : null}
        color={signColor(pre.sma200_distance_pct)}
      />
      <PriceTile
        label={t("Below 52w high", "距 52 周高点")}
        termKey="event_52w_distance"
        value={fmtRatioPct(pre.distance_from_52w_high_pct, 1)}
        reason={r("distance_from_52w_high_pct", "high_52w")}
        sub={fmtPrice(pre.high_52w) != null ? `high ${fmtPrice(pre.high_52w)}` : null}
      />
      <PriceTile
        label={t("Above 52w low", "距 52 周低点")}
        termKey="event_52w_distance"
        value={fmtRatioPct(pre.distance_from_52w_low_pct, 1)}
        reason={r("distance_from_52w_low_pct", "low_52w")}
        sub={fmtPrice(pre.low_52w) != null ? `low ${fmtPrice(pre.low_52w)}` : null}
      />
      <PriceTile
        label={t("Volume trend", "成交量趋势")}
        termKey="event_volume_trend"
        value={fmtRatioPct(pre.volume_trend, 1, true)}
        reason={r("volume_trend")}
        sub={t("last 20d vs prior 60d", "近 20 日 vs 此前 60 日")}
        color={signColor(pre.volume_trend)}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- table */

/**
 * One measured return cell. Blank cells are impossible by construction: a
 * null value renders the reason (title-attribute + a dim dash), so hovering
 * any missing number tells the user why it is missing.
 */
function ReturnCell({
  value,
  reasons,
  reasonKeys,
}: {
  value: number | null;
  reasons: PriceReasons | null | undefined;
  reasonKeys: string[];
}) {
  const t = useT();
  const text = fmtRatioPct(value, 1, true);
  if (text == null) {
    const reason = reasonFor(reasons, ...reasonKeys);
    return (
      <td className="num pt-na" title={unavailableText(reason, t)}>
        —
      </td>
    );
  }
  return (
    <td className="num" style={{ color: signColor(value) }}>
      {text}
    </td>
  );
}

/**
 * (b) One previous-event row.
 *
 * A row whose bars are unavailable does NOT get zeros across its horizons —
 * it collapses into a single spanning cell carrying the server's reason. The
 * live registry holds earnings back to Nov-2023 while stored bars start
 * 2024-03-20, so the oldest one or two rows per ticker land here every time;
 * rendering them as flat 0.0% reactions would silently drag every historical
 * statistic on this page toward zero.
 */
function PreviousEventRow({ row }: { row: EventPricePreviousEvent }) {
  const t = useT();
  const reaction = row.reaction;
  const abnormal: EventPriceAbnormal | null = row.abnormal_vs_spy ?? null;
  const sessionLabel = row.session != null ? SESSION_SHORT[row.session] : null;
  const unavailable = !row.bars_available || !reaction.bars_available;

  // §85 — WHICH WINDOW PRODUCED THE NUMBER IS PART OF THE NUMBER. When the
  // session is UNKNOWN the library cannot tell a BMO print from an AMC one, so
  // it measures across a conservative two-day span: the "1D" in that row is a
  // two-session move, not a single-session reaction, and it is NOT comparable
  // with the rows above it. The server states this in `basis`; leaving it in
  // the payload would let a widened measurement read as a precise one.
  const spanFlagged = reaction.basis === "unknown_session_two_day_span";

  const head = (
    <>
      <td className="mono">{isoDate(row.date_et) ?? "—"}</td>
      <td>
        {sessionLabel == null ? (
          <span className="pt-na">{t("Session unknown", "时段未知")}</span>
        ) : (
          t(sessionLabel.en, sessionLabel.zh)
        )}
        {spanFlagged && (
          <>
            {" "}
            <span
              className="badge dim"
              data-testid="basis-two-day-span"
              title={t(
                `Session unknown — measured across a two-day span (basis: ${reaction.basis}). Not directly comparable with single-session rows.`,
                `时段未知 — 按两日跨度测量（依据：${reaction.basis}）。与单日行数据不可直接比较。`,
              )}
            >
              {t("2-DAY SPAN", "两日跨度")}
            </span>
          </>
        )}
      </td>
    </>
  );

  if (unavailable) {
    // 1 date + 1 session are rendered; everything measured collapses into one
    // honest cell: 4 return columns + gap + 2 abnormal columns = 7.
    const reason =
      row.reason ?? reasonFor(reaction.reasons, "bars", "react_bar", "bars_available");
    return (
      <tr data-testid="prev-row" data-bars-available="false">
        {head}
        <td colSpan={7} className="pt-row-unavailable">
          <span className="badge dim">{t("BARS UNAVAILABLE", "无行情数据")}</span>{" "}
          {unavailableText(reason, t)}
        </td>
      </tr>
    );
  }

  return (
    <tr data-testid="prev-row" data-bars-available="true">
      {head}
      <ReturnCell
        value={reaction.gap_return}
        reasons={reaction.reasons}
        reasonKeys={["gap_return"]}
      />
      {HORIZONS.map((h) => (
        <ReturnCell
          key={h}
          value={horizonValue(reaction.returns, h)}
          reasons={reaction.reasons}
          reasonKeys={[`return_${h}D`, `returns.${h}D`, `${h}D`]}
        />
      ))}
      {ABNORMAL_HORIZONS.map((h) => (
        <ReturnCell
          key={`ab-${h}`}
          value={horizonValue(abnormal?.abnormal, h)}
          reasons={abnormal?.reasons}
          reasonKeys={[
            `abnormal_${h}D`,
            `abnormal.${h}D`,
            `${h}D`,
            "benchmark",
            "benchmark_bars",
          ]}
        />
      ))}
    </tr>
  );
}

function PreviousEventsTable({ rows }: { rows: EventPricePreviousEvent[] }) {
  const t = useT();
  if (rows.length === 0) {
    return (
      <p className="empty">
        {t(
          "No earlier comparable event is stored for this ticker, so there is no measured reaction to show. The platform compares only within the same event type and never substitutes a different one.",
          "该标的没有更早的可比事件记录,因此没有可展示的实测反应。平台仅在同类型事件之间比较,绝不以其他类型事件替代。",
        )}
      </p>
    );
  }
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t("Date (ET)", "日期(美东)")}</th>
            <th>
              <Term k="event_session_timing">
                <span>{t("Session", "时段")}</span>
              </Term>
            </th>
            <th className="num">
              <Term k="event_gap_return">
                <span>{t("Gap", "跳空")}</span>
              </Term>
            </th>
            {HORIZONS.map((h) => (
              <th className="num" key={h}>
                <Term k="event_reaction_returns">
                  <span>{`${h}D`}</span>
                </Term>
              </th>
            ))}
            {ABNORMAL_HORIZONS.map((h) => (
              <th className="num pt-abnormal-col" key={`ab-${h}`}>
                <Term k="event_abnormal_return">
                  <span>{t(`${h}D vs SPY`, `${h}日 相对SPY`)}</span>
                </Term>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PreviousEventRow key={`${row.event_id}-${row.event_key}`} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- stats */

/** Window label — the sample the numbers on this line came from. */
const WINDOW_LABEL: Record<HistoryWindow, { en: string; zh: string }> = {
  last4: { en: "Last 4", zh: "最近 4 次" },
  last8: { en: "Last 8", zh: "最近 8 次" },
  last12: { en: "Last 12", zh: "最近 12 次" },
};

/**
 * (c) One history-stat line:
 *   "Last 8: median |1D| 4.2% · p90 9.1% · positive 5/8 — based on 8 events"
 *
 * The trailing sample-size clause is not decoration (§19/§64): eight prints
 * is a small sample, p90 over eight events is literally the second-largest of
 * eight, and the positive tally stays a COUNT so it can never be misread as a
 * 62% chance. `n_available` is shown when it differs from `n` — the gap is
 * exactly the events whose bars were missing.
 */
function HistoryStatLine({
  horizon,
  window,
  stats,
}: {
  horizon: string;
  window: HistoryWindow;
  stats: EventPriceHistoryStats | null;
}) {
  const t = useT();
  const label = WINDOW_LABEL[window];
  const labelText = t(label.en, label.zh);

  if (stats == null || stats.n < 2) {
    const reason = reasonFor(stats?.reasons, "n", "sample", "insufficient_events");
    return (
      <li className="pt-stat-line" data-testid={`stat-${horizon}-${window}`}>
        <span className="pt-stat-window">{labelText}</span>{" "}
        <span className="pt-unavailable">
          {unavailableText(
            reason ??
              t(
                "fewer than 2 events with measured bars in this window",
                "该窗口内可用行情的事件不足 2 次",
              ),
            t,
          )}
        </span>
      </li>
    );
  }

  const parts: string[] = [];
  const median = fmtRatioPct(stats.median_abs, 1);
  const p75 = fmtRatioPct(stats.p75_abs, 1);
  const p90 = fmtRatioPct(stats.p90_abs, 1);
  const max = fmtRatioPct(stats.max_abs, 1);
  if (median != null) parts.push(t(`median |${horizon}| ${median}`, `中位 |${horizon}| ${median}`));
  if (p75 != null) parts.push(`p75 ${p75}`);
  if (p90 != null) parts.push(`p90 ${p90}`);
  if (max != null) parts.push(t(`max ${max}`, `最大 ${max}`));
  const tally = positiveTally(stats.positive_count, stats.n);
  if (tally != null) parts.push(t(`positive ${tally}`, `上涨 ${tally}`));

  return (
    <li className="pt-stat-line" data-testid={`stat-${horizon}-${window}`}>
      <span className="pt-stat-window">{labelText}</span>
      {": "}
      <span className="pt-stat-body">{parts.join(" · ")}</span>{" "}
      <span className="pt-sample">
        {t(`— based on ${stats.n} events`, `— 基于 ${stats.n} 次事件`)}
        {stats.n_available !== stats.n && (
          <>
            {" "}
            {t(
              `(${stats.n_available} of ${stats.n} had usable bars)`,
              `(${stats.n} 次中 ${stats.n_available} 次有可用行情)`,
            )}
          </>
        )}
      </span>
    </li>
  );
}

function HistoryStats({
  stats,
}: {
  stats: Record<string, Record<string, EventPriceHistoryStats | null>> | undefined;
}) {
  const t = useT();
  if (stats == null || Object.keys(stats).length === 0) {
    return (
      <p className="empty">
        {t(
          "No historical reaction statistics — they need at least two past events with stored bars.",
          "无历史反应统计 — 至少需要两次已有行情数据的历史事件。",
        )}
      </p>
    );
  }
  return (
    <>
      {HISTORY_HORIZONS.filter((h) => stats[h] != null).map((h) => (
        <div key={h} className="pt-stat-group">
          <div className="chart-sublabel">
            <Term k="event_history_stats">
              <span>{t(`${h} absolute move`, `${h} 绝对波幅`)}</span>
            </Term>
          </div>
          <ul className="pt-stat-list">
            {HISTORY_WINDOWS.map((w) => (
              <HistoryStatLine
                key={w}
                horizon={h}
                window={w}
                stats={stats[h]?.[w] ?? null}
              />
            ))}
          </ul>
        </div>
      ))}
      <p className="pt-note">
        {t(
          "Absolute moves — direction is deliberately discarded, so these measure MAGNITUDE only. A historical count is never a probability: \"positive 5/8\" is what happened eight times, not a 62% chance of the ninth.",
          "此处为绝对波幅 — 刻意舍弃方向,只衡量幅度。历史计数绝不等于概率:「上涨 5/8」是过去 8 次的实际结果,不代表第 9 次有 62% 的上涨概率。",
        )}
      </p>
    </>
  );
}

/* ---------------------------------------------------------------- header */

/** Freshness line: the look-ahead gate, made visible (§14/§96). */
function FreshnessLine({ data }: { data: EventPriceContext }) {
  const t = useT();
  const fresh = data.data_freshness;
  return (
    <p className="pt-freshness">
      <Term k="event_bars_as_of">
        <span>{t("As of", "计算时点")}</span>
      </Term>{" "}
      <span className="mono">{data.as_of ?? "—"}</span>
      {" · "}
      {t("bars through", "数据截至")}{" "}
      <span className="mono">{fresh?.bars_through ?? "—"}</span>
      {fresh?.n_bars != null && (
        <>
          {" · "}
          <span className="mono">{fresh.n_bars}</span> {t("bars", "根 K 线")}
        </>
      )}
      {fresh?.bars_source != null && fresh.bars_source !== "" && (
        <>
          {" · "}
          {t("source", "来源")} <span className="mono">{fresh.bars_source}</span>
        </>
      )}
    </p>
  );
}

/** The two provenance chips, driven by the payload's own provenance block. */
function ProvenanceChips({ data, t }: { data: EventPriceContext; t: TFn }) {
  const bars = data.provenance?.bars ?? "DATA";
  const metrics = data.provenance?.metrics ?? "QUANT";
  return (
    <>
      <span className="provenance data-driven">
        {t(`BARS ${bars}`, `行情 ${bars === "DATA" ? "数据" : bars}`)}
      </span>{" "}
      <span className="provenance quant-derived">
        {t(`METRICS ${metrics}`, `指标 ${metrics === "QUANT" ? "量化" : metrics}`)}
      </span>
    </>
  );
}

/* ---------------------------------------------------------------- tab */

/**
 * The tab body. Split from the fetching wrapper so the render contract can be
 * tested against a payload directly, with no query client in the way.
 */
export function PriceTabContent({ data }: { data: EventPriceContext }) {
  const t = useT();

  // available:false is a RESULT (no ticker, provider unconfigured), not an
  // error — rendered as the explanation it is.
  if (data.available === false) {
    return (
      <div className="panel">
        <h2>{t("Price context", "价格背景")}</h2>
        <p className="empty" data-testid="price-unavailable">
          {unavailableText(data.reason, t)}
        </p>
      </div>
    );
  }

  const pre = data.pre_event ?? null;
  const rows = data.previous_events ?? [];
  const unavailable = data.unavailable ?? [];
  const notBacktestable = data.not_backtestable ?? [];

  return (
    <>
      <div className="panel">
        <h2>
          {t("Pre-event price positioning", "事件前价格位置")}{" "}
          <ProvenanceChips data={data} t={t} />
        </h2>
        <FreshnessLine data={data} />
        {pre == null ? (
          <p className="empty" data-testid="pre-event-unavailable">
            {unavailableText(
              data.reason ??
                unavailable.find((u) => u.field === "pre_event")?.reason ??
                null,
              t,
            )}
          </p>
        ) : (
          <PreEventTiles pre={pre} />
        )}
      </div>

      <div className="panel">
        <h2>
          {t("Previous event reactions", "历次事件反应")}{" "}
          <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
        </h2>
        <p className="cg-meaning">
          {t(
            "Measured close-to-close from the pre-event close. All horizons share that same starting close, so they are cumulative rather than day-by-day.",
            "自事件前收盘价起按收盘价计算。所有周期共用同一个起始收盘价,因此为累计涨跌,而非逐日涨跌。",
          )}
        </p>
        <PreviousEventsTable rows={rows} />
      </div>

      <div className="panel">
        <h2>
          {t("Historical reaction size", "历史反应幅度")}{" "}
          <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
        </h2>
        <HistoryStats stats={data.history_stats} />
      </div>

      {(unavailable.length > 0 || notBacktestable.length > 0) && (
        <div className="panel">
          <h2>{t("What this block could not compute", "本区块未能计算的项目")}</h2>
          {unavailable.length > 0 && (
            <ul className="pt-unavailable-list" data-testid="unavailable-list">
              {unavailable.map((u) => (
                <li key={u.field}>
                  <span className="mono">{u.field}</span> —{" "}
                  {/* Verbatim server reason (§26/§36). */}
                  <span className="pt-unavailable">{u.reason}</span>
                </li>
              ))}
            </ul>
          )}
          {notBacktestable.length > 0 && (
            <p className="pt-note" data-testid="not-backtestable">
              {t("Not backtested: ", "未经回测：")}
              <span className="mono">{notBacktestable.join(", ")}</span>
              {". "}
              {t(
                "These are descriptive measurements of what happened, not validated signals — nothing here has been tested as a trading rule.",
                "以上均为对既往情况的描述性度量,而非经过验证的信号 — 其中没有任何一项作为交易规则被检验过。",
              )}
            </p>
          )}
        </div>
      )}
    </>
  );
}

/**
 * The fetching wrapper mounted by the event detail page.
 *
 * `asOf` is threaded through to the query key: two different as-of instants
 * are two different answers (that is the whole point of the look-ahead gate),
 * so they must never share a cache entry.
 */
export default function PriceTab({
  eventId,
  asOf,
}: {
  eventId: number;
  asOf?: string;
}) {
  const t = useT();
  const query = useQuery({
    queryKey: ["event-price-context", eventId, asOf ?? null],
    queryFn: () => api.events.priceContext(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("Price context", "价格背景")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null || query.data == null) {
    return (
      <div className="panel">
        <h2>{t("Price context", "价格背景")}</h2>
        <p className="error" data-testid="price-error">
          {t(
            `Could not load price context: ${query.error?.message ?? "no response"}`,
            `无法加载价格背景：${query.error?.message ?? "无响应"}`,
          )}
        </p>
      </div>
    );
  }

  return <PriceTabContent data={query.data} />;
}
