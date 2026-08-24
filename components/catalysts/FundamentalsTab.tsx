"use client";

/**
 * Phase E2 — the Fundamentals tab of the event detail page (§28, §29, §30,
 * §33, §58).
 *
 * It answers three questions and refuses a fourth:
 *  1. What did the company REPORT, and how does it compare with what it
 *     reported at the last event? (§58 previous | current | change table)
 *  2. What is the market paying for that, versus what it used to pay for the
 *     same company? (§30 valuation tiles, own-history only)
 *  3. When did we learn this? (freshness line — filed and accepted)
 *
 * The refused question is "did they beat?". Consensus estimates are not in
 * this platform's data subscription, so the beat/miss framing that drives an
 * earnings reaction cannot be computed. §33 requires that absence to be a
 * BANNER, not a blank: a preview that quietly omits consensus reads as though
 * consensus were irrelevant, which is the opposite of true.
 *
 * The honesty rules, hardest-to-break first:
 *
 *  1. NO FABRICATED NUMBERS. Every null metric renders "Unavailable —
 *     <server reason>". A provider that does not report capex produces an
 *     explicitly unavailable free-cash-flow row, never a free cash flow
 *     silently equal to operating cash flow.
 *  2. AS-OF IS ON ACCEPTANCE, AND IT IS VISIBLE. The freshness line prints
 *     period end, filing date and acceptance instant, because "Q2 numbers"
 *     dated by period end would include a quarter nobody could trade on yet.
 *  3. A PERCENTILE TRAVELS WITH ITS SAMPLE SIZE (§64). "88th percentile" over
 *     five quarters is a different claim from the same words over forty.
 *  4. DIRECTION IS THE SERVER'S. The ↑/↓/→ arrow comes from the payload's own
 *     `direction` token, so the UI can never disagree with the arithmetic
 *     that produced the delta.
 *  5. `available: false` IS A RESULT, NOT AN ERROR — a macro event has no
 *     ticker, and a provider without a financials entitlement is a state.
 *  6. Server strings render verbatim (§26/§36).
 */
import { useQuery } from "@tanstack/react-query";
import Term from "@/components/shared/Term";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type {
  EventFundamentalsContext,
  FundamentalConsensus,
  FundamentalFreshness,
  FundamentalMetricChange,
  FundamentalMomentum,
  FundamentalMultiple,
  FundamentalSnapshotPayload,
  FundamentalValuation,
} from "@/lib/types";
import type { TFn } from "./event-format";
import {
  BPS_METRICS,
  METRIC_GROUP_LABEL,
  METRIC_GROUP_ORDER,
  METRIC_SPECS,
  MOMENTUM_LABEL,
  TREND_LABEL,
  VALUATION_TILES,
  VALUATION_UNAVAILABLE_TILES,
  changeColor,
  directionArrow,
  fmtDelta,
  fmtMetric,
  fmtMultiple,
  isoDate,
  ownHistorySentence,
  reasonFor,
  specFor,
  unavailableText,
  type MetricGroup,
} from "./fundamentals-format";

/* ------------------------------------------------------------- consensus */

/**
 * §33's banner. Rendered whenever consensus is unavailable — which in Phase
 * E2 is always — carrying the server's own reason verbatim, because that
 * reason names the actual subscription gap (a 403 on Benzinga estimates) and
 * a paraphrase would lose the fact that it is fixable by buying the feed.
 */
function ConsensusBanner({ consensus }: { consensus: FundamentalConsensus | null }) {
  const t = useT();
  if (consensus?.available === true) return null;
  return (
    <div className="capability-banner" role="status" data-testid="consensus-banner">
      <p className="cb-line">
        <span className="badge amber">
          {t("CONSENSUS DATA UNAVAILABLE", "无一致预期数据")}
        </span>{" "}
        <Term k="fund_consensus">
          <span>{t("Analyst consensus", "分析师一致预期")}</span>
        </Term>
        {" — "}
        {/* Verbatim server reason (§26/§36). */}
        <span className="mono">
          {consensus?.reason ??
            t(
              "the server sent no reason for the missing consensus block.",
              "服务端未说明一致预期数据缺失的原因。",
            )}
        </span>
      </p>
      <p className="cb-line">
        {t(
          "Everything on this tab is the REPORTED figure. Without estimates the platform cannot say whether a print beat or missed, and an earnings reaction is driven by that surprise rather than by the absolute number — a record quarter below consensus still sells off. No beat/miss claim is made anywhere on this page.",
          "本页所有数据均为公司实际公布值。缺少预期数据时,平台无法判断财报是超预期还是不及预期;而财报后的股价反应正是由这一「意外」驱动,而非绝对数值 — 创纪录的季度若低于一致预期,股价照样下跌。因此本页任何位置都不作「超预期/不及预期」的判断。",
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- freshness */

/**
 * "Fundamentals: period ending 2026-06-27, filed 2026-07-31, accepted
 * 2026-07-31T20:07:12Z".
 *
 * Three dates rather than one, because they answer three different
 * questions: which quarter this IS, when the company said it, and the
 * instant it became public — the last being the only one the as-of gate may
 * legally use (§7/§85).
 */
function FreshnessLine({
  data,
  freshness,
}: {
  data: EventFundamentalsContext;
  freshness: FundamentalFreshness | null;
}) {
  const t = useT();
  const ref = data.current?.quarterly ?? null;
  const periodEnd = freshness?.period_end ?? ref?.end_date ?? null;
  const filed = freshness?.latest_filing_date ?? ref?.filing_date ?? null;
  const accepted = freshness?.acceptance_datetime ?? ref?.acceptance_datetime ?? null;
  const label = ref?.label ?? null;

  return (
    <p className="ft-freshness" data-testid="fundamentals-freshness">
      <Term k="fund_as_of_acceptance">
        <span>{t("Fundamentals", "基本面")}</span>
      </Term>
      {": "}
      {label != null && label !== "" && (
        <>
          <span className="mono">{label}</span>
          {" · "}
        </>
      )}
      {t("period ending", "报告期截至")}{" "}
      <span className="mono">{isoDate(periodEnd) ?? t("unknown", "未知")}</span>
      {" · "}
      {t("filed", "申报于")}{" "}
      <span className="mono">{isoDate(filed) ?? t("unknown", "未知")}</span>
      {" · "}
      {t("accepted", "接收于")}{" "}
      <span className="mono">{accepted ?? t("unknown", "未知")}</span>
      {" · "}
      {t("as of", "计算时点")} <span className="mono">{data.as_of ?? "—"}</span>
      {freshness?.fetched_at != null && (
        <>
          {" · "}
          {t("fetched", "抓取于")} <span className="mono">{freshness.fetched_at}</span>
        </>
      )}
    </p>
  );
}

/* ----------------------------------------------------------- change table */

/** The PREVIOUS/CURRENT value cell. A null value is never a blank or a zero:
 *  it becomes the server's reason, dim and un-coloured. */
function ValueCell({
  value,
  kind,
  reason,
  testid,
}: {
  value: number | null | undefined;
  kind: ReturnType<typeof specFor>["kind"];
  reason: string | null;
  testid?: string;
}) {
  const t = useT();
  const text = fmtMetric(value, kind);
  if (text == null) {
    return (
      <td className="num ft-na" data-testid={testid}>
        <span className="ft-unavailable">{unavailableText(reason, t)}</span>
      </td>
    );
  }
  return (
    <td className="num mono" data-testid={testid}>
      {text}
    </td>
  );
}

/**
 * One §58 row: metric | previous | current | change.
 *
 * The change cell shows the arrow the SERVER computed plus the delta, in bps
 * for ratio metrics. When either side is missing there is no delta to show,
 * and the cell carries the row's reason instead — a "—" alone would read as
 * "no change", which is the single most damaging wrong answer available here.
 */
function ChangeRow({ change }: { change: FundamentalMetricChange }) {
  const t = useT();
  const spec = specFor(change.metric);
  // The server renders its own glyph; using it means the arrow can never
  // disagree with the delta beside it. `direction` is the fallback.
  const arrow =
    change.arrow != null && change.arrow !== ""
      ? change.arrow
      : directionArrow(change.direction);
  const deltaText = fmtDelta(change, spec.kind);
  const trend = change.trend != null ? TREND_LABEL[change.trend] : undefined;

  return (
    <tr data-testid="fund-row" data-metric={change.metric}>
      <td>
        <Term k={spec.term}>
          <span>{t(spec.en, spec.zh)}</span>
        </Term>
        {change.note != null && change.note !== "" && (
          <>
            {" "}
            {/* Caveat that travels WITH a real number, e.g. debt being
                long-term only. Verbatim (§26/§36). */}
            <span className="ft-note-inline" data-testid="fund-note">
              ({change.note})
            </span>
          </>
        )}
      </td>
      <ValueCell
        value={change.previous}
        kind={spec.kind}
        reason={change.reason ?? null}
        testid="fund-previous"
      />
      <ValueCell
        value={change.current}
        kind={spec.kind}
        reason={change.reason ?? null}
        testid="fund-current"
      />
      <td className="num" data-testid="fund-change">
        {deltaText == null ? (
          <span className="ft-unavailable">
            {unavailableText(change.reason, t)}
          </span>
        ) : (
          <span className="mono" style={{ color: changeColor(change) }}>
            {arrow != null && <span data-testid="fund-arrow">{arrow} </span>}
            {deltaText}
          </span>
        )}
      </td>
      <td className="ft-trend" data-testid="fund-trend">
        {change.trend == null ? (
          <span className="ft-unavailable">
            {t(
              "not enough quarters",
              "季度数量不足",
            )}
          </span>
        ) : (
          <>
            {trend == null ? change.trend : t(trend.en, trend.zh)}{" "}
            {/* §64 — the sample the trend was classified over. */}
            <span className="ft-sample">
              {t(
                `(${change.trend_points ?? 0} quarters)`,
                `(${change.trend_points ?? 0} 个季度)`,
              )}
            </span>
          </>
        )}
      </td>
    </tr>
  );
}

/**
 * The §58 comparison table, grouped by the kind of question each metric
 * answers. Rows arrive in the server's METRIC_ORDER and are bucketed here;
 * a metric the table does not know still renders, under Valuation, with its
 * raw key as the label.
 */
function ChangeTable({
  changes,
  previousLabel,
  currentLabel,
}: {
  changes: FundamentalMetricChange[];
  previousLabel: string;
  currentLabel: string;
}) {
  const t = useT();
  if (changes.length === 0) {
    return (
      <p className="empty" data-testid="fund-no-changes">
        {t(
          "No metrics were computed for this event — no filed statement was accepted before the as-of instant.",
          "本次事件未计算出任何指标 — 在计算时点之前没有已被接收的申报文件。",
        )}
      </p>
    );
  }

  const known = new Set(METRIC_SPECS.map((s) => s.key));
  const grouped = new Map<MetricGroup, FundamentalMetricChange[]>();
  for (const change of changes) {
    const group = known.has(change.metric) ? specFor(change.metric).group : "valuation";
    const bucket = grouped.get(group);
    if (bucket == null) grouped.set(group, [change]);
    else bucket.push(change);
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>{t("Metric", "指标")}</th>
            <th className="num">{previousLabel}</th>
            <th className="num">{currentLabel}</th>
            <th className="num">{t("Change", "变化")}</th>
            <th>
              <Term k="fund_momentum">
                <span>{t("Trend", "趋势")}</span>
              </Term>
            </th>
          </tr>
        </thead>
        <tbody>
          {METRIC_GROUP_ORDER.filter((g) => (grouped.get(g)?.length ?? 0) > 0).map(
            (group) => (
              <FragmentGroup
                key={group}
                group={group}
                rows={grouped.get(group) ?? []}
              />
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function FragmentGroup({
  group,
  rows,
}: {
  group: MetricGroup;
  rows: FundamentalMetricChange[];
}) {
  const t = useT();
  const label = METRIC_GROUP_LABEL[group];
  return (
    <>
      <tr className="ft-group-head" data-testid={`fund-group-${group}`}>
        <td colSpan={5}>{t(label.en, label.zh)}</td>
      </tr>
      {rows.map((change) => (
        <ChangeRow key={change.metric} change={change} />
      ))}
    </>
  );
}

/* -------------------------------------------------------------- valuation */

/**
 * One §30 valuation tile: the multiple, and where it sits in its OWN history.
 *
 * A multiple with no history keeps its value and says the history is absent
 * — "we have a P/E but nothing to compare it against" is a materially
 * different (and more useful) statement than "unavailable", and collapsing
 * the two would hide a real number behind a missing one.
 */
function ValuationTile({
  metricKey,
  block,
}: {
  metricKey: string;
  block: FundamentalMultiple | null | undefined;
}) {
  const t = useT();
  const spec = specFor(metricKey);
  const value = fmtMultiple(block?.current);
  const history = ownHistorySentence(block, t);

  return (
    <div className="stat ft-tile" data-testid={`valuation-${metricKey}`}>
      <div className="label">
        <Term k={spec.term}>
          <span>{t(spec.en, spec.zh)}</span>
        </Term>
      </div>
      {value == null ? (
        <div className="ft-unavailable">
          {unavailableText(block?.reason, t)}
        </div>
      ) : (
        <>
          <div className="value mono">{value}</div>
          <div className="sub">
            {history != null ? (
              <Term k="fund_own_history_percentile">
                <span>{history}</span>
              </Term>
            ) : (
              <span className="ft-unavailable">
                {unavailableText(
                  block?.history_reason ??
                    t(
                      "no own-history sample yet",
                      "尚无自身历史样本",
                    ),
                  t,
                )}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ValuationBlock({ valuation }: { valuation: FundamentalValuation | null }) {
  const t = useT();
  const multiples = valuation?.multiples ?? {};
  return (
    <>
      <div className="statbar">
        {VALUATION_TILES.map((key) => (
          <ValuationTile key={key} metricKey={key} block={multiples[key]} />
        ))}
        {VALUATION_UNAVAILABLE_TILES.map((key) => (
          <ValuationTile key={key} metricKey={key} block={multiples[key]} />
        ))}
      </div>
      <p className="ft-note" data-testid="valuation-peer-note">
        {t("Sector: ", "行业对比：")}
        <span className="mono">
          {valuation?.sector?.reason ?? t("no reason supplied", "未提供原因")}
        </span>
        {" · "}
        {t("Peers: ", "同业对比：")}
        <span className="mono">
          {valuation?.peers?.reason ?? t("no reason supplied", "未提供原因")}
        </span>
      </p>
      <p className="ft-note">
        {t(
          "Percentiles are against THIS stock's own past multiples, not a sector and not the market — 'expensive versus its own history' is a different claim from 'expensive versus peers', and the peer comparison is not built yet rather than merely empty.",
          "此处分位数对照的是该股自身的历史估值区间,既非行业也非全市场 — 「相对自身历史贵」与「相对同行贵」是两个不同的判断,而同业对比目前尚未构建,并非计算后为空。",
        )}
      </p>
    </>
  );
}

/* --------------------------------------------------------------- momentum */

/**
 * §35's deterministic half: a label with its arithmetic attached. The counts
 * are printed beside the label precisely so it can be argued with — a
 * direction word with no numbers under it is an opinion wearing a metric's
 * clothes.
 */
function MomentumLine({ momentum }: { momentum: FundamentalMomentum | null }) {
  const t = useT();
  if (momentum == null) return null;
  const label = momentum.label != null ? MOMENTUM_LABEL[momentum.label] : undefined;
  const compared = momentum.compared ?? 0;

  return (
    <p className="ft-momentum" data-testid="fund-momentum">
      <Term k="fund_momentum">
        <span>
          {label == null
            ? (momentum.label ?? t("Fundamental momentum", "基本面动能"))
            : t(label.en, label.zh)}
        </span>
      </Term>{" "}
      {compared === 0 ? (
        <span className="ft-unavailable">{unavailableText(momentum.reason, t)}</span>
      ) : (
        <span className="ft-sample">
          {t(
            `— ${momentum.improved ?? 0} improved, ${momentum.weakened ?? 0} weakened, ${momentum.unchanged ?? 0} unchanged, out of ${compared} comparable metrics (${momentum.unavailable ?? 0} not comparable)`,
            `— ${compared} 项可比指标中 ${momentum.improved ?? 0} 项改善、${momentum.weakened ?? 0} 项恶化、${momentum.unchanged ?? 0} 项持平(另有 ${momentum.unavailable ?? 0} 项不可比)`,
          )}
        </span>
      )}
    </p>
  );
}

/* -------------------------------------------------------------- provenance */

/** The two provenance chips, driven by the payload's own provenance block —
 *  the tab cannot claim a provenance the server did not assert. */
function ProvenanceChips({ data, t }: { data: EventFundamentalsContext; t: TFn }) {
  const statements = data.provenance?.statements ?? "DATA";
  const metrics = data.provenance?.metrics ?? "QUANT";
  return (
    <>
      <span className="provenance data-driven">
        {t(
          `STATEMENTS ${statements}`,
          `报表 ${statements === "DATA" ? "数据" : statements}`,
        )}
      </span>{" "}
      <span className="provenance quant-derived">
        {t(`METRICS ${metrics}`, `指标 ${metrics === "QUANT" ? "量化" : metrics}`)}
      </span>
    </>
  );
}

/** A statement reference rendered as a column heading ("Q2 FY2026"). */
function refLabel(
  snapshot: FundamentalSnapshotPayload | null | undefined,
  fallback: string,
): string {
  const ref = snapshot?.quarterly;
  if (ref == null) return fallback;
  if (ref.label != null && ref.label !== "") return ref.label;
  if (ref.fiscal_period != null && ref.fiscal_year != null) {
    return `${ref.fiscal_period} FY${ref.fiscal_year}`;
  }
  return fallback;
}

/* -------------------------------------------------------------------- tab */

/**
 * The tab body. Split from the fetching wrapper so the render contract can be
 * tested against a payload directly, with no query client in the way.
 */
export function FundamentalsTabContent({ data }: { data: EventFundamentalsContext }) {
  const t = useT();

  // available:false is a RESULT (no ticker on a macro event, provider
  // without a financials entitlement), not an error.
  if (data.available === false) {
    return (
      <div className="panel">
        <h2>{t("Fundamentals", "基本面")}</h2>
        <p className="empty" data-testid="fundamentals-unavailable">
          {unavailableText(data.reason, t)}
        </p>
      </div>
    );
  }

  const changes = data.changes ?? [];
  const unavailable = data.unavailable ?? [];
  const notBacktestable = data.not_backtestable ?? [];
  const previousLabel = refLabel(
    data.previous_event?.snapshot ?? null,
    t("Previous", "上期"),
  );
  const currentLabel = refLabel(data.current, t("Current", "本期"));
  // Two different absences, and they are NOT the same fact: "no statements
  // stored at all" (provider serves none) versus "statements stored, but none
  // ACCEPTED before as_of" (the look-ahead gate did its job). The server
  // distinguishes them, so the UI shows whichever one applies rather than
  // collapsing both into one vague message.
  const currentReason =
    data.current?.available === false
      ? (data.statements?.available === false
          ? (data.statements.reason ?? null)
          : null) ??
        data.current.reason ??
        reasonFor(data.current.reasons, "snapshot", "current")
      : null;

  return (
    <>
      <ConsensusBanner consensus={data.consensus ?? null} />

      <div className="panel">
        <h2>
          {t("Reported fundamentals", "已公布基本面")}{" "}
          <ProvenanceChips data={data} t={t} />
        </h2>
        <FreshnessLine data={data} freshness={data.freshness ?? null} />
        {currentReason != null ? (
          <p className="empty" data-testid="current-snapshot-unavailable">
            {unavailableText(currentReason, t)}
          </p>
        ) : (
          <>
            <p className="cg-meaning">
              {t(
                "Columns are the two filings themselves — the one accepted before this event's as-of instant, and the one accepted before the previous comparable event's. A quarter that had ENDED but not yet been filed is deliberately excluded: nobody could have traded on it.",
                "两列分别对应两期申报文件 — 一期为本次事件计算时点前已被接收的文件,另一期为上一次可比事件计算时点前已被接收的文件。会计期虽已结束但尚未申报的季度会被刻意排除:当时无人可据其交易。",
              )}
            </p>
            {data.previous_event?.comparison_reason != null && (
              <p className="cg-meaning" data-testid="fund-comparison-reason">
                {t("Compared because: ", "比较依据：")}
                {/* Verbatim server reason. */}
                <span className="mono">{data.previous_event.comparison_reason}</span>
              </p>
            )}
            <ChangeTable
              changes={changes}
              previousLabel={previousLabel}
              currentLabel={currentLabel}
            />
            <MomentumLine momentum={data.fundamental_momentum ?? null} />
          </>
        )}
      </div>

      <div className="panel">
        <h2>
          {t("Valuation vs own history", "估值与自身历史对比")}{" "}
          <span className="provenance quant-derived">{t("QUANT", "量化")}</span>
        </h2>
        <ValuationBlock valuation={data.valuation ?? null} />
      </div>

      {(unavailable.length > 0 || notBacktestable.length > 0) && (
        <div className="panel">
          <h2>{t("What this block could not compute", "本区块未能计算的项目")}</h2>
          {unavailable.length > 0 && (
            <ul className="ft-unavailable-list" data-testid="fund-unavailable-list">
              {unavailable.map((u) => (
                <li key={u.field}>
                  <span className="mono">{u.field}</span> —{" "}
                  {/* Verbatim server reason (§26/§36). */}
                  <span className="ft-unavailable">{u.reason}</span>
                </li>
              ))}
            </ul>
          )}
          {notBacktestable.length > 0 && (
            <p className="ft-note" data-testid="fund-not-backtestable">
              {t("Not backtested: ", "未经回测：")}
              <span className="mono">{notBacktestable.join(", ")}</span>
              {". "}
              {t(
                "These are measurements of what the company reported, not validated signals — nothing here has been tested as a trading rule.",
                "以上均为对公司已公布数据的度量,而非经过验证的信号 — 其中没有任何一项作为交易规则被检验过。",
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
 * `asOf` is threaded through the query key: two as-of instants are two
 * different answers (a filing accepted between them changes every number on
 * the page), so they must never share a cache entry.
 */
export default function FundamentalsTab({
  eventId,
  asOf,
}: {
  eventId: number;
  asOf?: string;
}) {
  const t = useT();
  const query = useQuery({
    queryKey: ["event-fundamentals", eventId, asOf ?? null],
    queryFn: () => api.events.fundamentals(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("Fundamentals", "基本面")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null || query.data == null) {
    return (
      <div className="panel">
        <h2>{t("Fundamentals", "基本面")}</h2>
        <p className="error" data-testid="fundamentals-error">
          {t(
            `Could not load fundamentals: ${query.error?.message ?? "no response"}`,
            `无法加载基本面数据：${query.error?.message ?? "无响应"}`,
          )}
        </p>
      </div>
    );
  }

  return <FundamentalsTabContent data={query.data} />;
}
