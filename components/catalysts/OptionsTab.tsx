"use client";

/**
 * Phase I — the "Options" tab: what the option market priced for this event
 * (§18, §36-§37), against what comparable events actually delivered.
 *
 * The tab answers one question — "is the move being priced into this event
 * large or small, by this stock's own standards" — and §37 constrains how it
 * may be answered. Four rules are specific to this surface:
 *
 *  A. THE IMPLIED MOVE IS A PRICE, NOT A FORECAST. It is what buyers and
 *     sellers of one straddle agreed to transact at. The §37 wording is
 *     rendered UNCONDITIONALLY at the top — before any number — because a
 *     caveat placed after the figure is a caveat read after the damage, and
 *     one that renders only when some server field is populated disappears
 *     on exactly the degraded payloads that most need it.
 *  B. EVERY NUMBER WEARS ITS BASIS. A live ATM straddle read off the current
 *     chain and one reconstructed from the two legs' DAILY CLOSES months
 *     later are different measurements with identical units. The historical
 *     one is an approximation — a close is not a mid — and it says so in a
 *     badge beside the figure, not in a footnote.
 *  C. NO STRADDLE IS EVER SYNTHESISED. If a leg has no bars, the straddle is
 *     not computed; the tab prints the server's reason where the number
 *     would have been. There is no zero, no dash-that-reads-as-zero, and no
 *     "approximately" filled in from a neighbouring strike.
 *  D. THE CLASSIFICATION IS ARITHMETIC, NOT ADVICE. "OVER-PRICED" means one
 *     straddle cost more than one realized move; it carries no colour, no
 *     direction, and has never been tested as a trading rule. Sizing it as
 *     a signal is the failure this tab is written to avoid.
 *
 * Like every other event tab, the GET never fetches from a provider — it
 * reads what is stored, so scrolling events costs no provider calls. Filling
 * the option bars is the explicit user action behind the two buttons.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Term from "@/components/shared/Term";
import { useToast } from "@/components/shared/Toast";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type {
  EventOptionHistoryRow,
  EventOptionMetrics,
  EventOptionsBackfillResult,
  EventOptionsPayload,
} from "@/lib/types-options";
import ImpliedVsActualChart from "./ImpliedVsActualChart";
import {
  basisBadge,
  chartRows,
  classificationText,
  disclaimerText,
  firstNote,
  fmtBand,
  fmtIv,
  fmtRatio,
  fmtRatioPct,
  isoDate,
  metricValue,
  noData,
  statsLine,
  unavailableText,
} from "./options-format";

/* ---------------------------------------------------------------- tiles */

/**
 * One metric tile. Same null contract as the Price and Replay tabs': `value`
 * null is the ONLY route to the unavailable line, so a tile can never show
 * both a number and a reason, and never neither.
 */
function OptionTile({
  label,
  termKey,
  value,
  reason,
  sub,
  testId,
}: {
  label: string;
  termKey?: string;
  value: string | null;
  reason: string | null;
  sub?: string | null;
  testId?: string;
}) {
  const t = useT();
  const heading =
    termKey == null ? (
      <span>{label}</span>
    ) : (
      <Term k={termKey}>
        <span>{label}</span>
      </Term>
    );
  return (
    <div className="stat ot-tile" data-testid={testId}>
      <div className="label">{heading}</div>
      {value == null ? (
        <div className="ot-unavailable">{unavailableText(reason, t)}</div>
      ) : (
        <>
          <div className="value">{value}</div>
          {sub != null && sub !== "" && <div className="sub">{sub}</div>}
        </>
      )}
    </div>
  );
}

/**
 * The §37 statement. Rendered before any figure and never conditionally.
 *
 * The server's own `disclaimer` wins when present (§26/§36 — the audit-worthy
 * wording belongs to the server); the local sentence exists only so the
 * caveat cannot be absent from the screen.
 */
function DisclaimerBanner({ text }: { text: string | null | undefined }) {
  const t = useT();
  return (
    <div className="capability-banner" role="note" data-testid="options-disclaimer">
      <p className="cb-line">
        <span className="badge dim">{t("NOT A FORECAST", "并非预测")}</span>{" "}
        {disclaimerText(text, t)}
      </p>
    </div>
  );
}

/** The basis badge plus, when the basis is known, its plain-language caveat. */
function BasisBadge({
  basis,
  testId,
}: {
  basis: string | null | undefined;
  testId?: string;
}) {
  const t = useT();
  const spec = basisBadge(basis, t);
  return (
    <span
      className={`badge ${spec.badge}`}
      data-testid={testId ?? "options-basis"}
      title={spec.note ?? undefined}
    >
      {spec.text}
    </span>
  );
}

/* ------------------------------------------------------------- sections */

/**
 * (1) THIS event's implied move.
 *
 * The headline tile is the ± band, because that is the shape of the claim: a
 * straddle prices magnitude with no direction, and a bare "6.2%" invites
 * reading it as an expected gain.
 */
function CurrentBlock({
  current,
  coverageReason,
}: {
  current: EventOptionMetrics | null | undefined;
  coverageReason: string | null;
}) {
  const t = useT();
  const missing = noData(current);
  const note = firstNote(current) ?? coverageReason;

  return (
    <div className="panel">
      <h2>
        {t("Implied move for this event", "本次事件的隐含波动幅度")}{" "}
        <span className="provenance data-driven">{t("DATA", "数据")}</span>
        {current?.basis != null && <> <BasisBadge basis={current.basis} /></>}
        {current?.status != null && current.status !== "OK" && (
          <>
            {" "}
            {/* Verbatim server status token — PARTIAL is not a softer OK. */}
            <span className="badge dim" data-testid="options-status">
              {current.status}
            </span>
          </>
        )}
      </h2>

      {missing ? (
        <p className="empty" data-testid="options-no-data">
          {unavailableText(
            note ??
              t(
                "no option straddle has been computed for this event",
                "尚未为该事件计算跨式期权价格",
              ),
            t,
          )}{" "}
          {t(
            "No number is shown in its place. A straddle needs BOTH legs; when either leg has no prices on file it is not computed, and it is never approximated from a neighbouring strike.",
            "此处不会以任何数字替代。跨式期权需要「两条腿」同时存在;任一条腿缺少价格数据时即不予计算,也绝不会用相邻行权价近似替代。",
          )}
        </p>
      ) : (
        <>
          <div className="statbar">
            <OptionTile
              testId="implied-move"
              label={t("Implied move", "隐含波动幅度")}
              termKey="expected_move"
              value={fmtBand(metricValue(current, current?.implied_move_pct))}
              reason={note}
              sub={
                metricValue(current, current?.implied_move_points) == null
                  ? null
                  : `${metricValue(current, current?.implied_move_points)?.toFixed(2)} ${t("pts", "点")}`
              }
            />
            <OptionTile
              testId="iv-before"
              label={t("IV before", "事件前隐含波动率")}
              termKey="iv"
              value={fmtIv(metricValue(current, current?.iv_before))}
              reason={note}
            />
            <OptionTile
              testId="iv-after"
              label={t("IV after", "事件后隐含波动率")}
              termKey="iv"
              value={fmtIv(metricValue(current, current?.iv_after))}
              reason={note}
            />
            <OptionTile
              testId="iv-crush"
              label={t("IV crush", "波动率坍塌")}
              termKey="iv_crush"
              value={fmtRatioPct(metricValue(current, current?.iv_crush_pct), 1, true)}
              reason={note}
            />
            <OptionTile
              testId="actual-move"
              label={t("Actual move", "实际波动幅度")}
              termKey="event_reaction_returns"
              value={fmtRatioPct(metricValue(current, current?.actual_move_pct), 2, true)}
              reason={note}
            />
            <OptionTile
              testId="implied-realized-ratio"
              label={t("Actual ÷ implied", "实际 ÷ 隐含")}
              termKey="event_implied_vs_actual"
              value={fmtRatio(metricValue(current, current?.implied_realized_ratio))}
              reason={note}
              sub={classificationText(current?.classification, t)}
            />
          </div>

          {/* The contract the straddle was actually priced on. Printed so the
              number is auditable — a different expiry or strike is a
              different measurement, not a rounding difference. */}
          <div className="kv" style={{ marginTop: 12 }} data-testid="options-contract">
            <div>
              <div className="k">{t("Expiry", "到期日")}</div>
              <div className="v">{isoDate(current?.expiry) ?? "—"}</div>
            </div>
            <div>
              <div className="k">{t("Strike", "行权价")}</div>
              <div className="v">
                {current?.strike != null && Number.isFinite(current.strike)
                  ? current.strike.toFixed(2)
                  : "—"}
              </div>
            </div>
            <div>
              <div className="k">{t("Spot", "标的价格")}</div>
              <div className="v">
                {current?.spot != null && Number.isFinite(current.spot)
                  ? current.spot.toFixed(2)
                  : "—"}
              </div>
            </div>
            <div>
              <div className="k">{t("Legs", "期权合约")}</div>
              <div className="v">
                {[current?.call_ticker, current?.put_ticker]
                  .filter((x): x is string => x != null && x !== "")
                  .join(" / ") || "—"}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Server notes, verbatim (§26/§36) — they name the real dates and the
          real shortfall, which no client-side wording could reproduce. */}
      {current?.notes != null && current.notes.length > 0 && (
        <ul className="ot-notes" data-testid="options-notes">
          {current.notes.map((n, i) => (
            <li key={i} className="mono">
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * (2) The §37 comparison: what is priced now, against this ticker's own
 * history of realized moves.
 *
 * The two columns are absolute on both sides. Comparing an unsigned implied
 * move against a signed realized return would rank a −9% drop below a +6%
 * expectation, which is the exact misreading this block exists to prevent.
 */
function ComparisonBlock({ data }: { data: EventOptionsPayload }) {
  const t = useT();
  const comparison = data.comparison ?? null;
  const actualStats = data.stats?.actual ?? null;
  const impliedStats = data.stats?.implied ?? null;
  const actualLine = statsLine(actualStats, t);
  const impliedLine = statsLine(impliedStats, t);

  return (
    <div className="panel">
      <h2>
        {t("Priced now vs realized before", "当前定价 vs 历史实际波动")}{" "}
        <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
      </h2>

      <div className="statbar">
        <OptionTile
          testId="cmp-implied"
          label={t("Implied now", "当前隐含")}
          termKey="expected_move"
          value={fmtBand(comparison?.implied_pct)}
          reason={data.coverage?.reason ?? null}
        />
        <OptionTile
          testId="cmp-median"
          label={t("Historical median |move|", "历史波动绝对值中位数")}
          termKey="event_history_stats"
          value={fmtRatioPct(comparison?.hist_median_abs, 1)}
          reason={data.coverage?.reason ?? null}
        />
        <OptionTile
          testId="cmp-p90"
          label={t("Historical p90 |move|", "历史波动绝对值 90 分位")}
          termKey="event_history_stats"
          value={fmtRatioPct(comparison?.hist_p90_abs, 1)}
          reason={data.coverage?.reason ?? null}
        />
        <OptionTile
          testId="cmp-max"
          label={t("Historical max |move|", "历史最大波动绝对值")}
          termKey="event_history_stats"
          value={fmtRatioPct(comparison?.hist_max_abs, 1)}
          reason={data.coverage?.reason ?? null}
        />
      </div>

      <p className="ot-note" data-testid="options-stats-actual">
        {t("Actual moves: ", "实际波动：")}
        <span className="mono">
          {actualLine ?? t("no history on file", "尚无历史记录")}
        </span>
      </p>
      <p className="ot-note" data-testid="options-stats-implied">
        {t("Implied moves: ", "隐含波动：")}
        <span className="mono">
          {impliedLine ?? t("no history on file", "尚无历史记录")}
        </span>
      </p>
      <p className="ot-note">
        {t(
          "Both columns are ABSOLUTE. A straddle prices magnitude and has no sign, so the realized returns are folded to |x| before being summarised — otherwise a large fall would rank below a small rise. The sample size travels with each statistic: a p90 over three events is not the same object as a p90 over twelve.",
          "两列数据均为「绝对值」。跨式期权只对波动幅度定价、不含方向,因此实际收益率在统计前已取绝对值 — 否则一次大幅下跌会排在小幅上涨之后。每项统计量都附带样本量:基于 3 次事件的 90 分位数,与基于 12 次事件的 90 分位数并非同一回事。",
        )}
      </p>
    </div>
  );
}

/**
 * (3) The per-event table and its chart.
 *
 * The table comes FIRST and the chart second, deliberately: the table is the
 * WCAG-clean twin of the chart, so every value the columns encode is also
 * readable as text without hovering anything.
 */
function HistoryBlock({
  history,
  onBackfillHistory,
  backfilling,
}: {
  history: EventOptionHistoryRow[];
  onBackfillHistory: () => void;
  backfilling: boolean;
}) {
  const t = useT();
  const rows = chartRows(history);

  return (
    <div className="panel">
      <h2>
        {t("Implied vs actual, per prior event", "历次事件的隐含 vs 实际波动")}{" "}
        <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
      </h2>

      {history.length === 0 ? (
        <p className="empty" data-testid="options-history-empty">
          {t(
            "No prior event has option metrics on file. Opening this tab never fetches option bars — press the button below to backfill the previous events' straddles.",
            "尚无历史事件存有期权指标。打开本页绝不会抓取期权 K 线数据 — 请点击下方按钮回填历史事件的跨式期权数据。",
          )}
        </p>
      ) : (
        <>
          <div className="table-scroll">
            <table data-testid="options-history-table">
              <thead>
                <tr>
                  <th>{t("Event date", "事件日期")}</th>
                  <th>{t("Basis", "计算依据")}</th>
                  <th>{t("Implied", "隐含")}</th>
                  <th>{t("Actual |move|", "实际波动绝对值")}</th>
                  <th>{t("Actual ÷ implied", "实际 ÷ 隐含")}</th>
                  <th>{t("Verdict", "判定")}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, i) => {
                  const implied = metricValue(row, row.implied_move_pct);
                  const actual = metricValue(row, row.actual_move_pct);
                  const ratio = metricValue(row, row.implied_realized_ratio);
                  const reason = firstNote(row);
                  const key = row.event_key ?? String(row.event_id ?? i);
                  return (
                    <tr key={key} data-testid={`options-history-row-${key}`}>
                      <td>{isoDate(row.event_date) ?? key}</td>
                      <td>
                        <BasisBadge
                          basis={row.basis}
                          testId={`options-history-basis-${key}`}
                        />
                      </td>
                      <td>
                        {implied == null ? (
                          <span className="ot-unavailable">
                            {unavailableText(reason, t)}
                          </span>
                        ) : (
                          fmtBand(implied)
                        )}
                      </td>
                      <td>
                        {actual == null ? (
                          <span className="ot-unavailable">
                            {unavailableText(reason, t)}
                          </span>
                        ) : (
                          fmtRatioPct(Math.abs(actual), 1)
                        )}
                      </td>
                      <td>{ratio == null ? "—" : fmtRatio(ratio)}</td>
                      {/* Neutral text, never a colour: over-priced is not bad
                          news and under-priced is not an opportunity. */}
                      <td>{classificationText(row.classification, t) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ImpliedVsActualChart rows={rows} />
        </>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <span className="k">{t("Previous events", "历史事件")}</span>
        <button
          type="button"
          onClick={onBackfillHistory}
          disabled={backfilling}
          data-testid="backfill-options-history"
        >
          {backfilling
            ? t("Backfilling…", "回填中…")
            : t("Backfill previous events' options", "回填历史事件的期权数据")}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- tab */

/**
 * The tab body, split from the fetching wrapper so the render contract can be
 * tested against a payload directly, with no query client in the way.
 */
export function OptionsTabContent({
  data,
  onBackfill,
  onBackfillHistory,
  backfilling = false,
  backfillingHistory = false,
}: {
  data: EventOptionsPayload;
  onBackfill: () => void;
  onBackfillHistory: () => void;
  backfilling?: boolean;
  backfillingHistory?: boolean;
}) {
  const t = useT();
  const history = data.history ?? [];
  const coverageReason =
    typeof data.coverage?.reason === "string" && data.coverage.reason !== ""
      ? data.coverage.reason
      : null;

  return (
    <>
      {/* §37, before any figure and never conditionally. */}
      <DisclaimerBanner text={data.disclaimer} />

      <CurrentBlock current={data.current} coverageReason={coverageReason} />

      <div className="panel">
        <h2>{t("This event's option data", "本次事件的期权数据")}</h2>
        <p className="ot-note" data-testid="options-as-of">
          {t("As of ", "计算时点 ")}
          <span className="mono">{data.as_of ?? "—"}</span>
          {data.ticker != null && (
            <>
              {" · "}
              <span className="mono">{data.ticker}</span>
            </>
          )}
        </p>
        {coverageReason != null && (
          <p className="ot-note" data-testid="options-coverage">
            {/* Verbatim server coverage reason (§26/§36). */}
            <span className="mono">{coverageReason}</span>
          </p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <span className="k">{t("Option bars", "期权 K 线")}</span>
          <button
            type="button"
            onClick={onBackfill}
            disabled={backfilling}
            data-testid="backfill-options"
          >
            {backfilling
              ? t("Backfilling…", "回填中…")
              : t("Backfill this event's options", "回填本次事件的期权数据")}
          </button>
        </div>
        <p className="ot-note">
          {t(
            "Opening this tab never calls the option provider — it reads bars already stored. Backfilling is an explicit action because option history is fetched per contract leg, and a page load that fetched it would spend provider calls on every event you scroll past.",
            "打开本页绝不会调用期权数据源 — 它只读取已存储的 K 线数据。回填是一项显式操作,因为期权历史数据需按每条期权腿逐一抓取;若页面加载即自动抓取,则每滚动浏览一个事件都会消耗数据源调用额度。",
          )}
        </p>
      </div>

      <ComparisonBlock data={data} />

      <HistoryBlock
        history={history}
        onBackfillHistory={onBackfillHistory}
        backfilling={backfillingHistory}
      />

      <div className="panel">
        <h2>{t("How to read this tab", "如何理解本页")}</h2>
        <p className="ot-note" data-testid="options-limits">
          {t(
            "The historical straddles are rebuilt from the two legs' DAILY CLOSES, not from the intraday quotes a trader would have seen — a close is not a mid, and on a thin strike it can be hours stale. Implied volatility is solved with a flat 4% risk-free rate and no dividend, so it is an approximation of the market's own surface. The over/under-priced verdict compares one straddle against one realized move; it asserts no direction and has never been tested as a trading rule.",
            "历史跨式期权价格由两条期权腿的「每日收盘价」重建,而非交易者当时看到的盘中报价 — 收盘价不等于中间价,在流动性稀薄的行权价上甚至可能滞后数小时。隐含波动率采用 4% 的固定无风险利率、且不考虑分红求解,因此只是对市场真实波动率曲面的近似。「定价偏高/偏低」的判定仅是将单次跨式期权价格与单次实际波动作比较;它不表示任何方向判断,也从未作为交易规则被检验过。",
          )}
        </p>
      </div>
    </>
  );
}

/**
 * The fetching wrapper mounted by the event detail page.
 *
 * `asOf` is threaded into the query key: two as-of instants are two different
 * answers (the chain moves, and a later as-of admits an event that was in the
 * future at the earlier one), so they must never share a cache entry.
 */
export default function OptionsTab({
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
    queryKey: ["event-options", eventId, asOf ?? null],
    queryFn: () => api.events.optionsContext(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event-options", eventId] });
    qc.invalidateQueries({ queryKey: ["audit"] });
    setNonce((n) => n + 1);
  };

  /**
   * Report a backfill by what the SERVER said, never by the fact the request
   * returned 200. A backfill that stored no bars is a RESULT with a reason
   * (no contracts existed at that expiry, the provider has no option
   * history), and calling it a success would imply prices that do not exist.
   */
  const reportBackfill = (result: EventOptionsBackfillResult, scope: string) => {
    const stored = result.stored_bars;
    const status = result.status ?? null;
    if (stored == null || !Number.isFinite(stored) || stored <= 0) {
      toast(
        "INFO",
        t(
          `No option bars were stored for ${scope}: ${result.reason ?? status ?? "the server gave no reason"}`,
          `未为${scope}存储任何期权 K 线数据：${result.reason ?? status ?? "服务端未提供原因"}`,
        ),
      );
      return;
    }
    toast(
      "SUCCESS",
      t(
        `Stored ${stored} option bar${stored === 1 ? "" : "s"} for ${scope}${status == null ? "" : ` — status ${status}`}.`,
        `已为${scope}存储 ${stored} 条期权 K 线数据${status == null ? "" : `（状态 ${status}）`}。`,
      ),
    );
  };

  const backfill = useMutation({
    mutationFn: () => api.events.backfillOptions(eventId),
    onSuccess: (result: EventOptionsBackfillResult) => {
      reportBackfill(result, t("this event", "本次事件"));
      invalidate();
    },
    onError: (e: Error) =>
      toast(
        "WARNING",
        t(`Options backfill failed: ${e.message}`, `期权数据回填失败：${e.message}`),
      ),
  });

  const backfillHistory = useMutation({
    mutationFn: () => api.events.backfillOptionsHistory(eventId),
    onSuccess: (result: EventOptionsBackfillResult) => {
      reportBackfill(result, t("the previous events", "历史事件"));
      invalidate();
    },
    onError: (e: Error) =>
      toast(
        "WARNING",
        t(
          `Options history backfill failed: ${e.message}`,
          `期权历史数据回填失败：${e.message}`,
        ),
      ),
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("Options", "期权")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null || query.data == null) {
    return (
      <div className="panel">
        <h2>{t("Options", "期权")}</h2>
        <p className="error" data-testid="options-error">
          {t(
            `Could not load the options context: ${query.error?.message ?? "no response"}`,
            `无法加载期权数据：${query.error?.message ?? "无响应"}`,
          )}
        </p>
      </div>
    );
  }

  return (
    <OptionsTabContent
      data={query.data}
      onBackfill={() => backfill.mutate()}
      onBackfillHistory={() => backfillHistory.mutate()}
      backfilling={backfill.isPending}
      backfillingHistory={backfillHistory.isPending}
    />
  );
}
