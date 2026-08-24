"use client";

/**
 * Phase C — the §60 "LAST 4 / 8 / 12 EARNINGS" history table.
 *
 * §60 asks one question: across the last N comparable events, what did this
 * name actually DO? The table is meant to be read DOWN a column (the
 * distribution of reactions), not across a row (any single quarter).
 *
 * Three things this file exists to keep honest, none of them cosmetic:
 *
 *  1. THE UNAVAILABLE COLUMNS STAY IN THE TABLE. EPS surprise, revenue
 *     surprise and implied move cannot be computed on this platform today —
 *     the first two need a POINT-IN-TIME consensus no provider here supplies,
 *     the third needs the pre-event option chain that Phase I brings. They
 *     render as an explicit UNAVAILABLE cell carrying the server's own
 *     reason. Dropping the columns would read as "these did not matter"; a
 *     blank cell would read as "zero surprise".
 *  2. `intraday_30m` IS EMPTY BY DESIGN. Minute bars are backfilled one event
 *     at a time on user action, so a freshly loaded table legitimately has
 *     none. The cell says so and the "Backfill minute bars (last 4)" button
 *     is the remedy — the GET itself never fetches.
 *  3. THE COLUMN ORDER COMES FROM THE PAYLOAD. `replay.HISTORY_COLUMNS`
 *     travels on the wire precisely so this file cannot drift away from the
 *     spec's order; the local constant is a fallback, never the authority.
 *
 * The size toggle is 4/8/12 and it TRIMS CLIENT-SIDE from the rows the server
 * sent (newest N), rather than refetching — the server already gates by
 * `as_of`, and refetching per toggle would make the same as-of produce three
 * different network answers.
 *
 * Phase J wires the OPTIONS half in, without this file ever fetching it.
 * `optionsHistory` is a PROP, supplied by whoever already holds the
 * `GET /options` payload, for two reasons: the History tab must not issue a
 * second network call for numbers another tab already has, and a component
 * that fetched its own options data would make the two tabs able to disagree
 * about the same event. When the prop is absent the table renders exactly as
 * it did before — the `implied_move` column keeps its UNAVAILABLE cell and
 * the chart does not mount — so nothing regresses on the pages that do not
 * pass it.
 *
 * Rows are joined on `event_key` first and `event_id` second, never on the
 * date: two events can share a date (a company reporting alongside a macro
 * print), and a date join would silently attribute one's straddle to the
 * other.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Term from "@/components/shared/Term";
import { useToast } from "@/components/shared/Toast";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type {
  EventBackfillResult,
  EventHistoryCell,
  EventHistoryPayload,
  EventHistoryRow,
  EventPriceHistoryStats,
} from "@/lib/types";
import type { EventOptionHistoryRow } from "@/lib/types-options";
import { SESSION_SHORT, STATUS_BADGE, STATUS_LABEL } from "./event-format";
import ImpliedVsActualChart from "./ImpliedVsActualChart";
import ReactionHistoryChart from "./ReactionHistoryChart";
import {
  chartRows,
  disclaimerText,
  fmtBand,
  fmtRatio,
  isoDate,
  metricValue,
} from "./options-format";
import { HISTORY_WINDOWS, positiveTally, type HistoryWindow } from "./price-format";
import {
  HISTORY_COLUMNS_FALLBACK,
  HISTORY_SIZES,
  cellAvailable,
  cellReason,
  fmtRatioPct,
  isoStamp,
  signColor,
  type HistorySize,
  unavailableText,
} from "./replay-format";

/** Header label + the ⓘ key for each §60 column. */
const COLUMN_META: Record<
  string,
  { en: string; zh: string; term?: string; num?: boolean }
> = {
  date_et: { en: "Date (ET)", zh: "日期(美东)" },
  session: { en: "Session", zh: "时段", term: "event_session_timing" },
  status: { en: "Status", zh: "状态" },
  eps_surprise: { en: "EPS surprise", zh: "EPS 超预期", term: "event_surprise_unavailable", num: true },
  rev_surprise: { en: "Rev surprise", zh: "营收超预期", term: "event_surprise_unavailable", num: true },
  implied_move: { en: "Implied move", zh: "隐含波动", term: "event_implied_vs_actual", num: true },
  actual_move_abs: { en: "Actual |1D|", zh: "实际 |1日|", term: "event_implied_vs_actual", num: true },
  // Phase J: appended locally (never sent by the server's column list) and
  // only when `optionsHistory` is supplied. See `withOptionColumns`.
  options_actual_move: { en: "Actual move (opt)", zh: "实际波幅(期权)", term: "event_implied_vs_actual", num: true },
  options_ratio: { en: "Actual ÷ implied", zh: "实际 ÷ 隐含", term: "event_implied_vs_actual", num: true },
  gap: { en: "Gap", zh: "跳空", term: "event_gap_return", num: true },
  intraday_30m: { en: "+30m", zh: "+30 分钟", term: "event_intraday_windows", num: true },
  ret_1d: { en: "1D", zh: "1日", term: "event_reaction_returns", num: true },
  ret_5d: { en: "5D", zh: "5日", term: "event_reaction_returns", num: true },
  abnormal_1d: { en: "1D vs SPY", zh: "1日 相对SPY", term: "event_abnormal_return", num: true },
};

/**
 * A cell the platform cannot compute.
 *
 * The badge is deliberately loud and the reason travels verbatim in the
 * title: a beginner reading a blank cell would assume a zero surprise, which
 * is exactly the misreading §33/§98 forbid.
 */
function UnavailableCell({
  cell,
  testId,
}: {
  cell: EventHistoryCell | null | undefined;
  testId?: string;
}) {
  const t = useT();
  const reason = cellReason(cell);
  return (
    <td className="num pt-na" data-testid={testId} title={unavailableText(reason, t)}>
      <span className="badge dim">{t("UNAVAILABLE", "不可用")}</span>
    </td>
  );
}

/** A measured return cell. Null renders the reason, never a zero. */
function NumCell({
  value,
  reason,
  digits = 1,
  signed = true,
  testId,
}: {
  value: number | null | undefined;
  reason: string | null;
  digits?: number;
  signed?: boolean;
  testId?: string;
}) {
  const t = useT();
  const text = fmtRatioPct(value, digits, signed);
  if (text == null) {
    return (
      <td className="num pt-na" data-testid={testId} title={unavailableText(reason, t)}>
        —
      </td>
    );
  }
  return (
    <td
      className="num"
      data-testid={testId}
      style={{ color: signed ? signColor(value) : undefined }}
    >
      {text}
    </td>
  );
}

/**
 * Index the options history by the two identifiers that are safe to join on.
 *
 * NOT by date. Two events can legitimately share a `date_et`, and a date
 * join would attribute one event's straddle to the other — a silent,
 * plausible-looking wrong number, which is worse than no number at all.
 */
function indexOptions(
  optionsHistory: EventOptionHistoryRow[] | null | undefined,
): Map<string, EventOptionHistoryRow> {
  const index = new Map<string, EventOptionHistoryRow>();
  for (const row of optionsHistory ?? []) {
    if (row.event_key != null && row.event_key !== "") {
      index.set(`k:${row.event_key}`, row);
    }
    if (row.event_id != null) index.set(`i:${row.event_id}`, row);
  }
  return index;
}

/** The options row for one history row, or null when nothing joined. */
function optionsFor(
  row: EventHistoryRow,
  index: Map<string, EventOptionHistoryRow>,
): EventOptionHistoryRow | null {
  if (row.event_key != null) {
    const byKey = index.get(`k:${row.event_key}`);
    if (byKey != null) return byKey;
  }
  if (row.event_id != null) {
    const byId = index.get(`i:${row.event_id}`);
    if (byId != null) return byId;
  }
  return null;
}

/**
 * The two Phase J columns, appended to whatever order the payload sent.
 *
 * APPENDED, never inserted: the server owns the column order (§60), and
 * splicing into the middle of its list would make this file an authority it
 * is explicitly not. `implied_move` is already in the server's order and is
 * simply FILLED IN rather than duplicated — a second implied column would
 * invite reading two different measurements as two different facts.
 */
function withOptionColumns(columns: string[]): string[] {
  const extra = ["options_actual_move", "options_ratio"].filter(
    (c) => !columns.includes(c),
  );
  return extra.length === 0 ? columns : [...columns, ...extra];
}

/** One §60 row, rendered in the payload's own column order. */
function HistoryRow({
  row,
  columns,
  options,
}: {
  row: EventHistoryRow;
  columns: string[];
  /** The joined options metrics, or null. Null keeps every Phase-J cell empty. */
  options?: EventOptionHistoryRow | null;
}) {
  const t = useT();
  const forecastNote = disclaimerText(null, t);
  const reasons = row.reasons ?? {};
  const sessionLabel = row.session != null ? SESSION_SHORT[row.session] : null;
  // `status` is typed loosely on the wire (the server may add a state before
  // the UI knows it). An unrecognised token renders VERBATIM in a dim badge
  // rather than being mapped to the nearest known one.
  const statusKey =
    typeof row.status === "string" && row.status in STATUS_LABEL
      ? (row.status as keyof typeof STATUS_LABEL)
      : null;
  const statusLabel = statusKey == null ? null : STATUS_LABEL[statusKey];

  const cellFor = (column: string) => {
    switch (column) {
      case "date_et":
        return (
          <td className="mono" key={column}>
            {row.date_et ?? "—"}
          </td>
        );
      case "session":
        return (
          <td key={column}>
            {sessionLabel == null ? (
              <span className="pt-na">{t("Session unknown", "时段未知")}</span>
            ) : (
              t(sessionLabel.en, sessionLabel.zh)
            )}
          </td>
        );
      case "status":
        return (
          <td key={column}>
            <span
              className={`badge ${statusKey == null ? "dim" : STATUS_BADGE[statusKey]}`}
            >
              {statusLabel == null
                ? (row.status ?? "—")
                : t(statusLabel.en, statusLabel.zh)}
            </span>
          </td>
        );
      case "eps_surprise":
        return <UnavailableCell key={column} cell={row.eps_surprise} testId="cell-eps" />;
      case "rev_surprise":
        return <UnavailableCell key={column} cell={row.rev_surprise} testId="cell-rev" />;
      case "implied_move": {
        // Phase I made this computable; Phase J delivers it here as a prop.
        // With no joined row the column keeps its Phase-C UNAVAILABLE cell —
        // the honest state for a page that was never given the payload.
        const implied = fmtBand(
          options == null ? null : metricValue(options, options.implied_move_pct),
        );
        if (implied == null) {
          return (
            <UnavailableCell key={column} cell={row.implied_move} testId="cell-implied" />
          );
        }
        return (
          // The ± band, never a bare percent: a straddle prices magnitude.
          // The not-a-forecast sentence rides in the title on every cell that
          // prints one.
          <td className="num" key={column} data-testid="cell-implied" title={forecastNote}>
            {implied}
          </td>
        );
      }
      case "options_actual_move": {
        // The realized move AS THE OPTIONS ENGINE MEASURED IT — deliberately
        // its own column rather than reusing `actual_move_abs`, which comes
        // from the bars engine over a possibly different window. Two engines
        // that disagree must be visible as two columns, not reconciled here.
        const actual =
          options == null ? null : metricValue(options, options.actual_move_pct);
        return (
          <NumCell
            key={column}
            testId="cell-options-actual"
            value={actual == null ? null : Math.abs(actual)}
            reason={
              options == null
                ? t("no option metrics joined to this event", "该事件未关联期权指标")
                : null
            }
            signed={false}
          />
        );
      }
      case "options_ratio": {
        const ratio =
          options == null
            ? null
            : metricValue(options, options.implied_realized_ratio);
        const text = fmtRatio(ratio);
        return (
          // "1.34×", not "134%": a ratio rendered as a percent reads as a
          // return. 1.0 means the straddle priced the move exactly.
          <td className="num" key={column} data-testid="cell-options-ratio">
            {text ?? "—"}
          </td>
        );
      }
      case "actual_move_abs":
        return (
          <NumCell
            key={column}
            testId="cell-actual"
            value={row.actual_move_abs}
            reason={reasons.ret_1d ?? reasons.reaction ?? null}
            signed={false}
          />
        );
      case "gap":
        return (
          <NumCell key={column} testId="cell-gap" value={row.gap} reason={reasons.gap ?? null} />
        );
      case "intraday_30m":
        // The ONLY column whose absence is routine and fixable from this
        // page: minute bars are per-event, on request. See the backfill note.
        return cellAvailable(row.intraday_30m) ? (
          <NumCell
            key={column}
            testId="cell-intraday"
            value={row.intraday_30m.move}
            reason={null}
          />
        ) : (
          <td
            className="num pt-na"
            key={column}
            data-testid="cell-intraday"
            title={unavailableText(cellReason(row.intraday_30m), t)}
          >
            —
          </td>
        );
      case "ret_1d":
        return (
          <NumCell
            key={column}
            testId="cell-1d"
            value={row.ret_1d}
            reason={reasons.ret_1d ?? reasons.reaction ?? null}
          />
        );
      case "ret_5d":
        return (
          <NumCell
            key={column}
            testId="cell-5d"
            value={row.ret_5d}
            reason={reasons.ret_5d ?? reasons.reaction ?? null}
          />
        );
      case "abnormal_1d":
        return (
          <NumCell
            key={column}
            testId="cell-abnormal"
            value={row.abnormal_1d}
            reason={reasons.abnormal_1d ?? null}
          />
        );
      default:
        // An unknown column the server added: shown as unmeasured rather
        // than silently dropped, so a new column cannot go missing here.
        return (
          <td className="num pt-na" key={column} title={column}>
            —
          </td>
        );
    }
  };

  return (
    <tr
      data-testid="history-row"
      data-bars-available={row.bars_available === true ? "true" : "false"}
    >
      {columns.map(cellFor)}
    </tr>
  );
}

/** Window label — the sample the summary line came from. */
const WINDOW_LABEL: Record<HistoryWindow, { en: string; zh: string }> = {
  last4: { en: "Last 4", zh: "最近 4 次" },
  last8: { en: "Last 8", zh: "最近 8 次" },
  last12: { en: "Last 12", zh: "最近 12 次" },
};

/**
 * One summary line. Same §64 contract as the Price tab: the sample size
 * travels with the statistic, and the positive tally stays a COUNT.
 */
function SummaryLine({
  horizon,
  window,
  stats,
}: {
  horizon: string;
  window: HistoryWindow;
  stats: EventPriceHistoryStats | null;
}) {
  const t = useT();
  const label = t(WINDOW_LABEL[window].en, WINDOW_LABEL[window].zh);

  if (stats == null || stats.n < 2) {
    return (
      <li className="pt-stat-line" data-testid={`hist-stat-${horizon}-${window}`}>
        <span className="pt-stat-window">{label}</span>{" "}
        <span className="pt-unavailable">
          {unavailableText(
            stats?.reasons?.n ??
              stats?.reasons?.sample ??
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
  const p90 = fmtRatioPct(stats.p90_abs, 1);
  const max = fmtRatioPct(stats.max_abs, 1);
  if (median != null) {
    parts.push(t(`median |${horizon}| ${median}`, `中位 |${horizon}| ${median}`));
  }
  if (p90 != null) parts.push(`p90 ${p90}`);
  if (max != null) parts.push(t(`max ${max}`, `最大 ${max}`));
  const tally = positiveTally(stats.positive_count, stats.n);
  if (tally != null) parts.push(t(`positive ${tally}`, `上涨 ${tally}`));

  return (
    <li className="pt-stat-line" data-testid={`hist-stat-${horizon}-${window}`}>
      <span className="pt-stat-window">{label}</span>
      {": "}
      <span className="pt-stat-body">{parts.join(" · ")}</span>{" "}
      <span className="pt-sample">
        {t(`— based on ${stats.n} events`, `— 基于 ${stats.n} 次事件`)}
      </span>
    </li>
  );
}

/* ---------------------------------------------------------------- table */

/**
 * The body, split from the fetching wrapper so the render contract can be
 * tested against a payload directly.
 */
export function EventHistoryTableContent({
  data,
  onBackfill,
  backfilling = false,
  optionsHistory,
}: {
  data: EventHistoryPayload;
  onBackfill: (last: number) => void;
  backfilling?: boolean;
  /**
   * Phase J: prior-event option metrics from `GET /api/events/{id}/options`,
   * supplied by the caller that already holds that payload. Absent → the
   * table renders exactly as it did in Phase C.
   */
  optionsHistory?: EventOptionHistoryRow[];
}) {
  const t = useT();
  const [size, setSize] = useState<HistorySize>(4);
  const hasOptions = optionsHistory != null && optionsHistory.length > 0;
  const optionsIndex = indexOptions(optionsHistory);

  if (data.available === false) {
    return (
      <div className="panel">
        <h2>{t("Event history", "事件历史")}</h2>
        <p className="empty" data-testid="history-unavailable">
          {unavailableText(data.reason, t)}
        </p>
      </div>
    );
  }

  // The payload's own column order wins; the local list is only a fallback.
  const baseColumns =
    data.columns != null && data.columns.length > 0
      ? data.columns
      : HISTORY_COLUMNS_FALLBACK;
  // The two extra columns exist only when there is something to put in them.
  // Adding empty columns to say "we could have shown this" widens the table
  // for no information.
  const columns = hasOptions ? withOptionColumns(baseColumns) : baseColumns;
  const allRows = data.rows ?? [];
  // Rows arrive oldest-first; the toggle keeps the NEWEST N, then restores
  // chronological order so the table always reads forward in time.
  const shown = allRows.slice(Math.max(0, allRows.length - size));
  const provenance = data.provenance ?? {};

  return (
    <div className="panel">
      <h2>
        <Term k="event_history_table">
          <span>{t("Event history", "事件历史")}</span>
        </Term>{" "}
        <span className="provenance data-driven">
          {t(`BARS ${provenance.bars ?? "DATA"}`, `行情 ${provenance.bars ?? "数据"}`)}
        </span>{" "}
        <span className="provenance quant-derived">
          {t(
            `METRICS ${provenance.metrics ?? "QUANT"}`,
            `指标 ${provenance.metrics ?? "量化"}`,
          )}
        </span>
      </h2>

      <p className="pt-freshness">
        <Term k="event_bars_as_of">
          <span>{t("As of", "计算时点")}</span>
        </Term>{" "}
        <span className="mono" data-testid="history-as-of">
          {isoStamp(data.as_of) ?? data.as_of ?? "—"}
        </span>
        {" · "}
        <span className="mono">{allRows.length}</span>{" "}
        {t("events stored", "次已记录事件")}
      </p>

      <div className="row" role="group" aria-label={t("Window", "窗口")}>
        {HISTORY_SIZES.map((n) => (
          <button
            key={n}
            type="button"
            className={size === n ? "active" : ""}
            aria-pressed={size === n}
            data-testid={`history-size-${n}`}
            onClick={() => setSize(n)}
          >
            {t(`Last ${n}`, `最近 ${n} 次`)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="empty" data-testid="history-empty">
          {t(
            "No earlier comparable event is stored for this ticker. The platform compares only within the same event type and never substitutes a different one.",
            "该标的没有更早的可比事件记录。平台仅在同类型事件之间比较,绝不以其他类型事件替代。",
          )}
        </p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => {
                  const meta = COLUMN_META[column];
                  const label =
                    meta == null ? column.replace(/_/g, " ") : t(meta.en, meta.zh);
                  return (
                    <th key={column} className={meta?.num ? "num" : undefined}>
                      {meta?.term == null ? (
                        label
                      ) : (
                        <Term k={meta.term}>
                          <span>{label}</span>
                        </Term>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <HistoryRow
                  key={`${row.event_id ?? ""}-${row.event_key ?? row.date_et ?? ""}`}
                  row={row}
                  columns={columns}
                  options={hasOptions ? optionsFor(row, optionsIndex) : null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* §37's picture, beneath its WCAG-clean twin: every value the chart
          encodes is already readable as text in the columns above, so a
          reader who never hovers loses nothing. Mounted only when the prop
          arrived — the chart is not a promise the page can make on its own. */}
      {/* WHAT THE STOCK DID, for the same rows the table is showing.
          Deliberately NOT gated on options: it needs only the registry and
          stored bars, so it renders for the many events that have no option
          chain — which is exactly when the reader has nothing else to look
          at. It plots `shown`, so the size toggle moves both together. */}
      <div className="pt-stat-group" data-testid="history-reaction-chart" style={{ marginTop: 14 }}>
        <div className="chart-sublabel">
          <span>{t("Stock reaction, per prior event", "历次事件后的股价反应")}</span>{" "}
          <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
        </div>
        <ReactionHistoryChart
          rows={shown.map((r) => ({
            key: r.event_key ?? r.date_et ?? "",
            label: r.date_et ?? "",
            ret1d: typeof r.ret_1d === "number" ? r.ret_1d : null,
            ret5d: typeof r.ret_5d === "number" ? r.ret_5d : null,
          }))}
        />
      </div>

      {hasOptions && (
        <div className="pt-stat-group" data-testid="history-implied-chart" style={{ marginTop: 14 }}>
          <div className="chart-sublabel">
            <Term k="event_implied_vs_actual">
              <span>
                {t(
                  "Implied vs actual, per prior event",
                  "历次事件的隐含 vs 实际波动",
                )}
              </span>
            </Term>{" "}
            <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
          </div>
          <ImpliedVsActualChart rows={chartRows(optionsHistory)} />
          <p className="pt-note" data-testid="history-implied-note">
            {disclaimerText(null, t)}
          </p>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <Term k="event_minute_bars_backfill">
          <span className="k">{t("Minute bars", "分钟 K 线")}</span>
        </Term>
        <button
          type="button"
          onClick={() => onBackfill(4)}
          disabled={backfilling}
          data-testid="history-backfill"
        >
          {backfilling
            ? t("Backfilling…", "正在回补…")
            : t("Backfill minute bars (last 4)", "回补分钟 K 线（最近 4 次）")}
        </button>
      </div>
      <p className="pt-note">
        {t(
          "The +30m column is filled only for events whose minute window was fetched. Loading this page fetches nothing: twelve event windows would be twelve full days of per-minute bars, so the backfill is bounded and explicit.",
          "「+30 分钟」列仅对已抓取分钟窗口的事件才有数值。打开本页不会抓取任何数据:12 个事件窗口相当于 12 个完整交易日的分钟级 K 线,因此回补操作有上限且必须显式触发。",
        )}
      </p>

      {data.summary != null && Object.keys(data.summary).length > 0 && (
        <div className="pt-stat-group" data-testid="history-summary">
          {Object.entries(data.summary).map(([horizon, windows]) => (
            <div key={horizon}>
              <div className="chart-sublabel">
                <Term k="event_history_stats">
                  <span>{t(`${horizon} absolute move`, `${horizon} 绝对波幅`)}</span>
                </Term>
              </div>
              <ul className="pt-stat-list">
                {HISTORY_WINDOWS.map((w) => (
                  <SummaryLine
                    key={w}
                    horizon={horizon}
                    window={w}
                    stats={windows?.[w] ?? null}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {data.not_backtestable != null && data.not_backtestable.length > 0 && (
        <p className="pt-note" data-testid="history-not-backtestable">
          {t("Not backtested: ", "未经回测：")}
          <span className="mono">{data.not_backtestable.join(", ")}</span>
          {". "}
          {t(
            "These are descriptive measurements of what happened, not validated signals — and a count of past events is never a probability of the next one.",
            "以上均为对既往情况的描述性度量,而非经过验证的信号 — 历史事件的次数统计也绝不等于下一次发生的概率。",
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The fetching wrapper mounted by the event detail page.
 *
 * The backfill invalidates BOTH this query and the replay one: the same
 * stored minute bars feed the §20 tab, and leaving one of the two showing
 * "no minute bars stored" after they were fetched reads as a bug.
 */
export default function EventHistoryTable({
  eventId,
  asOf,
  optionsHistory,
}: {
  eventId: number;
  asOf?: string;
  /**
   * Phase J passthrough. The caller owns the `GET /options` fetch; this
   * component never issues one, so opening the History tab still spends no
   * option-provider calls.
   */
  optionsHistory?: EventOptionHistoryRow[];
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: ["event-history", eventId, asOf ?? null],
    queryFn: () => api.events.history(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  const backfill = useMutation({
    mutationFn: (last: number) => api.events.historyBackfill(eventId, last),
    onSuccess: (result: EventBackfillResult) => {
      const bars = result.bars ?? 0;
      const attempted = result.events_attempted ?? result.results?.length ?? 0;
      if (bars > 0) {
        toast(
          "SUCCESS",
          t(
            `Stored ${bars} minute bars across ${attempted} events.`,
            `已为 ${attempted} 次事件存储 ${bars} 根分钟 K 线。`,
          ),
        );
      } else {
        // Nothing stored is a RESULT, not a success. The roll-up carries no
        // single `reason` — the reasons live per event — so the first one is
        // quoted verbatim rather than a summary sentence being invented.
        const first = result.results?.find((r) => (r.reason ?? "") !== "")?.reason;
        toast(
          "INFO",
          t(
            `No minute bars were stored: ${result.reason ?? first ?? "the server gave no reason"}`,
            `未存储任何分钟 K 线：${result.reason ?? first ?? "服务端未提供原因"}`,
          ),
        );
      }
      qc.invalidateQueries({ queryKey: ["event-history", eventId] });
      qc.invalidateQueries({ queryKey: ["event-replay"] });
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
        <h2>{t("Event history", "事件历史")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null || query.data == null) {
    return (
      <div className="panel">
        <h2>{t("Event history", "事件历史")}</h2>
        <p className="error" data-testid="history-error">
          {t(
            `Could not load the event history: ${query.error?.message ?? "no response"}`,
            `无法加载事件历史：${query.error?.message ?? "无响应"}`,
          )}
        </p>
      </div>
    );
  }

  return (
    <EventHistoryTableContent
      data={query.data}
      onBackfill={(last) => backfill.mutate(last)}
      backfilling={backfill.isPending}
      optionsHistory={optionsHistory}
    />
  );
}
