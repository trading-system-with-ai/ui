"use client";

/**
 * Phase K — the "Risk" tab: how big this event has been, how big the option
 * market says this one will be, and what that means for a position held
 * through it (§62-§67).
 *
 * This tab reports a MAGNITUDE and never a direction, and four rules govern
 * how it may do so:
 *
 *  A. SHADOW IS ON SCREEN, NOT IN A COMMENT (§65). The badge and the sentence
 *     render UNCONDITIONALLY at the top, before any figure — a reader must
 *     never be able to see a state chip without also seeing that it blocks
 *     nothing. This layer computes caps for a hypothetical verdict only; it
 *     resizes no order and rejects none, and the tab says exactly that.
 *  B. NO STAT WITHOUT ITS SAMPLE SIZE (§64). Every historical figure on this
 *     tab is rendered by a component that takes `n` as a required prop, and
 *     the "based on N events" line sits INSIDE the same panel as the numbers
 *     rather than in a footnote. With no sample the panel shows the absence
 *     and its remedy — never four dashes, which read as a measurement that
 *     came back empty.
 *  C. UNKNOWN IS NOT LOW. When the classifier could assign no state, the chip
 *     is dim, says UNKNOWN, and is followed by the server's own reason plus
 *     the sentence that this is an absence of evidence rather than a
 *     low-risk finding. Folding UNKNOWN into LOW is the single most damaging
 *     thing this surface could do, so it is the thing the tests pin hardest.
 *  D. NOTHING IS RE-DERIVED HERE (§63). The state, the sensitivity, the
 *     drivers and the caveats all arrive computed from a deterministic
 *     classifier with no language model anywhere in it. This file formats
 *     them; it never recomputes one, and it never sorts a driver list into an
 *     order the server did not choose.
 *
 * Like every other event GET, opening this tab spends no provider call — it
 * reads what is stored.
 */
import { useQuery } from "@tanstack/react-query";
import Term from "@/components/shared/Term";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type {
  EventRiskGreeks,
  EventRiskHistorical,
  EventRiskMarketWide,
  EventRiskOptions,
  EventRiskPayload,
  EventRiskSnapshot,
  PlanEventRisk,
} from "@/lib/types-event-risk";
import {
  basisLabel,
  basisNote,
  crushExplainer,
  crushStatus,
  enforcementNote,
  eventTypeLabel,
  fmtCountdown,
  fmtGreek,
  fmtPctNumber,
  fmtUsd0,
  greekRows,
  hasSample,
  historyRows,
  impliedVsHistorical,
  isUnknown,
  planDays,
  sampleLine,
  sampleN,
  sensitivityBadge,
  sensitivityLabel,
  shadowTitle,
  snapshotOf,
  stateBadge,
  stateLabel,
  stateMeaning,
  stringList,
} from "./risk-format";

/* ------------------------------------------------------------------ pieces */

/**
 * The state chip with its SHADOW badge.
 *
 * The two are ONE element on purpose: a chip that could render without the
 * badge beside it is a chip that will eventually be screenshotted without it,
 * and "EXTREME" read as an enforcement verdict is the misreading §65 exists
 * to prevent.
 */
export function EventRiskChip({
  state,
  enforcement,
}: {
  state: string | null | undefined;
  enforcement?: string | null;
}) {
  const t = useT();
  return (
    <span className="er-chip" data-testid="event-risk-chip">
      <span className={`badge ${stateBadge(state)}`} data-testid="event-risk-state">
        {stateLabel(state, t)}
      </span>{" "}
      <Term k="shadow_mode">
        <span
          className="badge amber"
          data-testid="event-risk-shadow-badge"
          title={shadowTitle(t)}
        >
          {enforcement == null || enforcement === "" ? "SHADOW" : enforcement}
        </span>
      </Term>
    </span>
  );
}

/**
 * The §64 sample line. Takes `n` as a REQUIRED prop rather than reading it off
 * a snapshot, so a caller cannot render historical numbers in a panel that
 * forgot to mount this.
 */
function SampleLine({ n, testId }: { n: number | null; testId?: string }) {
  const t = useT();
  return (
    <p className="er-sample" data-testid={testId ?? "event-risk-sample"}>
      {sampleLine(n, t)}
    </p>
  );
}

/** One figure with its label; `value` null routes to the reason, never a 0. */
function RiskStat({
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
  reason?: string | null;
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
    <div className="stat" data-testid={testId}>
      <div className="label">{heading}</div>
      {value == null ? (
        <div className="er-unavailable">
          {reason == null || reason === ""
            ? t("Not reported", "未提供")
            : t(`Unavailable — ${reason}`, `无法计算 — ${reason}`)}
        </div>
      ) : (
        <div className="value">{value}</div>
      )}
      {/* The sub-line survives an ABSENT value on purpose. It is where the §64
          sample size lives, and "no previous comparable events on file" is the
          most important thing a tile can say precisely when it has no number —
          a tile that dropped its n whenever the stat was null would satisfy
          §64 on every payload except the ones that need it. */}
      {sub != null && sub !== "" && <div className="sub">{sub}</div>}
    </div>
  );
}

/**
 * The unconditional §65 banner. Rendered before any number on both surfaces
 * this file serves.
 */
export function ShadowBanner({
  enforcement,
  note,
}: {
  enforcement?: string | null;
  /** The server's own SHADOW sentence; it wins where present (§26/§36). */
  note?: string | null;
}) {
  const t = useT();
  return (
    <div className="capability-banner" role="note" data-testid="event-risk-shadow-note">
      <p className="cb-line">
        <Term k="shadow_mode">
          <span className="badge amber">
            {enforcement == null || enforcement === "" ? "SHADOW" : enforcement}
          </span>
        </Term>{" "}
        {note != null && note !== "" ? note : enforcementNote(enforcement, t)}
      </p>
    </div>
  );
}

/** Drivers / caveats: the server's own strings, in the server's own order. */
function ReasonList({
  title,
  items,
  emptyText,
  testId,
}: {
  title: string;
  items: string[];
  emptyText: string;
  testId: string;
}) {
  return (
    <div className="panel" style={{ marginBottom: 0 }}>
      <h2>{title}</h2>
      {items.length > 0 ? (
        <ul className="why-list" data-testid={testId}>
          {items.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="none" data-testid={`${testId}-empty`}>
          {emptyText}
        </p>
      )}
    </div>
  );
}

/**
 * The historical table.
 *
 * With NO sample it renders the absence and what would fix it — never four
 * dashes. `n` rides in the caption AND in the sample line, because a table
 * whose sample size lives only in a sibling paragraph is a table that will be
 * screenshotted without it.
 */
function HistoricalPanel({ historical }: { historical: EventRiskHistorical | null | undefined }) {
  const t = useT();
  const n = sampleN(historical);
  const rows = historyRows(historical);
  return (
    <div className="panel">
      <h2>
        {t("What previous events delivered", "历史事件的实际波动幅度")}{" "}
        <span className="provenance data-driven">{t("DATA", "数据")}</span>
      </h2>
      <SampleLine n={n} testId="event-risk-history-sample" />
      {rows.length === 0 ? (
        <p className="empty" data-testid="event-risk-history-empty">
          {t(
            "No previous comparable event is on file for this ticker and event type, so there is no distribution to show. This is a gap in the record, not a finding about the size of this event — backfill the event history to fill it.",
            "档案中没有该股票与该事件类型的历史同类事件，因此无法展示波动幅度分布。这是记录的缺口，而非对本次事件波动幅度的结论 — 可回填事件历史数据以补全。",
          )}
        </p>
      ) : (
        <div className="table-scroll">
          <table data-testid="event-risk-history-table">
            <caption className="er-caption">
              {t(
                `Absolute move across the event, n=${n ?? 0}`,
                `事件期间的绝对波动幅度，样本量 n=${n ?? 0}`,
              )}
            </caption>
            <thead>
              <tr>
                <th>{t("Statistic", "统计量")}</th>
                <th>{t("Absolute move", "绝对波动幅度")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} data-testid={`event-risk-history-${row.key}`}>
                  <td>{t(row.label.en, row.label.zh)}</td>
                  <td className="mono">
                    {fmtPctNumber(row.value) ?? (
                      <span className="er-unavailable">
                        {t("not computed at this sample size", "该样本量下无法计算")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="er-note">
        {t(
          "These are ABSOLUTE moves — the underlying's moves are signed, the statistics are not. A 9% median says nothing about which way the next print goes.",
          "此处均为「绝对」波动幅度 — 标的价格的变动有正负方向，但这些统计量没有。9% 的中位数并不表示下一次财报的涨跌方向。",
        )}
      </p>
    </div>
  );
}

/**
 * Implied vs historical, on ONE shared scale.
 *
 * Two bars each normalised to their own maximum would always render the same
 * length and silently erase the comparison, which here is the whole finding.
 * A bar is drawn only where the value exists — a zero-width bar for a missing
 * implied move reads as "the market priced no move".
 */
function ComparisonPanel({ snapshot }: { snapshot: EventRiskSnapshot | null }) {
  const t = useT();
  const bars = impliedVsHistorical(snapshot);
  const n = sampleN(snapshot?.historical);
  const both = bars.implied != null && bars.historical != null;
  return (
    <div className="panel">
      <h2>
        {t("Priced vs delivered", "市场定价 vs 实际波动")}{" "}
        <span className="provenance data-driven">{t("DATA", "数据")}</span>
      </h2>
      {bars.implied == null && bars.historical == null ? (
        <p className="empty" data-testid="event-risk-comparison-empty">
          {t(
            "Neither an implied move nor a historical median is available, so there is nothing to compare.",
            "既无隐含波动幅度，也无历史中位数，因此无从比较。",
          )}
        </p>
      ) : (
        <div className="er-bars" data-testid="event-risk-bars">
          <div className="er-bar-row">
            <span className="er-bar-key">{t("Implied", "隐含")}</span>
            <span className="er-bar-track">
              {bars.impliedWidth != null && (
                <span
                  className="er-bar-fill implied"
                  data-testid="event-risk-bar-implied"
                  style={{ width: `${bars.impliedWidth}%` }}
                />
              )}
            </span>
            <span className="er-bar-value mono">
              {fmtPctNumber(bars.implied) ?? t("not priced", "无定价")}
            </span>
          </div>
          <div className="er-bar-row">
            <span className="er-bar-key">{t("Historical median", "历史中位数")}</span>
            <span className="er-bar-track">
              {bars.historicalWidth != null && (
                <span
                  className="er-bar-fill historical"
                  data-testid="event-risk-bar-historical"
                  style={{ width: `${bars.historicalWidth}%` }}
                />
              )}
            </span>
            <span className="er-bar-value mono">
              {fmtPctNumber(bars.historical) ?? t("no sample", "无样本")}
            </span>
          </div>
        </div>
      )}
      {/* §64 travels with the bar: the historical bar IS a sample statistic. */}
      <SampleLine n={n} testId="event-risk-comparison-sample" />
      {both && (
        <p className="er-note" data-testid="event-risk-comparison-note">
          {t(
            "Both bars are drawn on the SAME scale so their lengths can be compared. The implied move is a PRICE the option market transacted at; the median is a COUNT of what already happened. Neither is a forecast of this event.",
            "两条柱状图采用「相同」标尺绘制，因此其长度可直接比较。隐含波动幅度是期权市场的「成交价格」；中位数则是对「已发生情况」的统计。二者均非对本次事件的预测。",
          )}
        </p>
      )}
    </div>
  );
}

/**
 * §66 options panel: position greeks, the event's IV, what IV did across
 * previous events, and the long-call sentence.
 *
 * `expected_crush` is rendered as a STATUS, never as a number — the platform
 * forecasts no crush, and a blank cell here would be read as "no crush
 * expected", a forecast nobody made.
 */
function OptionsPanel({
  greeks,
  options,
  sensitivity,
}: {
  greeks: EventRiskGreeks | null | undefined;
  options: EventRiskOptions | null | undefined;
  sensitivity: string | null | undefined;
}) {
  const t = useT();
  const rows = greekRows(greeks);
  // The realized crushes of previous prints arrive as a `historical_event_risk`
  // block, so the median comes with its own n (§64) rather than as a bare
  // number a caller would have to qualify from elsewhere.
  const crush = options?.historical_iv_crush ?? null;
  const crushN = sampleN(crush);
  const crushMedian = hasSample(crush) ? (crush?.median_abs ?? null) : null;
  return (
    <div className="panel">
      <h2>
        {t("Options exposure to this event", "本次事件的期权敞口")}{" "}
        <span className="provenance data-driven">{t("DATA", "数据")}</span>
      </h2>

      {/* §66 — sensitivity is an OPTIONS axis and never moves the state. */}
      <p className="er-note" data-testid="event-risk-sensitivity">
        {t("Position sensitivity", "持仓敏感度")}:{" "}
        <span className={`badge ${sensitivityBadge(sensitivity)}`}>
          {sensitivityLabel(sensitivity, t)}
        </span>{" "}
        {t(
          "— an options axis reported beside the event state, never folded into it. The same print carries the same event risk for shares and for calls, and completely different sensitivity to it.",
          "— 这是与事件风险状态并列报告的「期权维度」指标，绝不会并入事件风险状态。同一次财报对持有正股与持有看涨期权而言，事件风险相同，但敏感度截然不同。",
        )}
      </p>

      {rows.length === 0 ? (
        <p className="none" data-testid="event-risk-greeks-absent">
          {t(
            "No option position greeks were supplied for this event. That is an absence of data, not a position with zero gamma, vega and theta.",
            "本次事件未提供期权持仓的希腊字母数据。这是「数据缺失」，而非表示该持仓的 Gamma、Vega、Theta 均为零。",
          )}
        </p>
      ) : (
        <div className="statbar" data-testid="event-risk-greeks">
          {rows.map((row) => (
            <RiskStat
              key={row.key}
              label={row.label}
              termKey={row.termKey}
              value={fmtGreek(row.value)}
              reason={t("not supplied", "未提供")}
              testId={`event-risk-greek-${row.key}`}
            />
          ))}
        </div>
      )}

      <div className="statbar">
        <RiskStat
          label={t("Event IV", "事件隐含波动率")}
          termKey="iv"
          value={fmtPctNumber(options?.event_iv)}
          reason={t("no event-dated IV stored", "未存储事件期隐含波动率")}
          testId="event-risk-event-iv"
        />
        <RiskStat
          label={t("Historical IV crush (median abs)", "历史波动率崩塌（绝对值中位数）")}
          termKey="iv_crush"
          value={fmtPctNumber(crushMedian)}
          reason={t("no post-event IV stored", "未存储事件后隐含波动率")}
          sub={sampleLine(crushN, t)}
          testId="event-risk-iv-crush"
        />
        <RiskStat
          label={t("Expected crush", "预期波动率崩塌")}
          // Deliberately never a number: no forward volatility surface is
          // subscribed, so the crush this print will produce is not forecast.
          // The server's own note is preferred over this file's wording.
          value={null}
          reason={
            options?.expected_iv_crush_note != null &&
            options.expected_iv_crush_note !== ""
              ? `${crushStatus(options?.expected_iv_crush)} — ${options.expected_iv_crush_note}`
              : t(
                  `${crushStatus(options?.expected_iv_crush)} — this platform does not forecast IV crush; only what previous events did is measured`,
                  `${crushStatus(options?.expected_iv_crush)} — 本平台不预测隐含波动率崩塌，仅度量历史事件的实际情况`,
                )
          }
          testId="event-risk-expected-crush"
        />
      </div>

      <p className="er-note" data-testid="event-risk-crush-explainer">
        {crushExplainer(options?.explainer, t)}
      </p>
    </div>
  );
}

/**
 * §62 — the MARKET-WIDE FOMC line.
 *
 * Rendered BESIDE the ticker's own state and never folded into it. A decision
 * that moves every position in the book at once would both overstate this
 * ticker's idiosyncratic risk and understate the book's if it were expressed
 * as a bump to one event's state, so it gets its own row and its own wording.
 * Null when no meeting is close — an honest absence, not a cleared flag.
 */
function MarketWidePanel({ flag }: { flag: EventRiskMarketWide | null | undefined }) {
  const t = useT();
  if (flag == null) return null;
  return (
    <div className="capability-banner" role="note" data-testid="event-risk-market-wide">
      <p className="cb-line">
        <span className="badge amber">{t("MARKET-WIDE", "全市场")}</span>{" "}
        {flag.title ?? t("FOMC decision", "美联储议息决议")}{" "}
        <span className="mono">
          {fmtCountdown(flag.days_away, t) ?? t("date not reported", "未提供日期")}
        </span>
        {flag.is_estimated === true && (
          <>
            {" "}
            <span className="badge amber">{t("ESTIMATED", "估算")}</span>
          </>
        )}
      </p>
      {flag.note != null && flag.note !== "" && <p className="cb-line">{flag.note}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------- body */

/**
 * The tab body, split from the fetching wrapper so the render contract can be
 * tested against a payload directly, with no query client in the way.
 */
export function RiskTabContent({ data }: { data: EventRiskPayload }) {
  const t = useT();
  const snapshot = snapshotOf(data) ?? {};
  const state = snapshot.event_risk_state ?? null;
  const unknown = isUnknown(state);
  const drivers = stringList(snapshot.drivers);
  const caveats = stringList(snapshot.caveats);
  // Coverage rides INSIDE the snapshot (it describes that snapshot's sample),
  // and names the backfill that would fill the gap.
  const coverageReason =
    typeof snapshot.coverage?.reason === "string" && snapshot.coverage.reason !== ""
      ? snapshot.coverage.reason
      : null;
  const n = sampleN(snapshot.historical);

  /**
   * An event with no issuer (a CPI print, an FOMC decision) has no position
   * and no straddle, so there is no single-name event risk to state. The
   * server says so with `available: false` and a reason, and the tab renders
   * that as a STATE — never as an UNKNOWN chip, which would imply a
   * measurement was attempted on this ticker and came back empty. The
   * market-wide flag still renders, because it is the part that DOES apply.
   */
  if (data.available === false) {
    return (
      <>
        <ShadowBanner enforcement={data.enforcement} note={data.note} />
        <MarketWidePanel flag={data.market_wide} />
        <div className="panel">
          <h2>{t("Event risk", "事件风险")}</h2>
          <p className="empty" data-testid="event-risk-unavailable">
            {data.reason ??
              t(
                "This event has no ticker, so there is no single-name position whose risk this would measure.",
                "本事件无对应股票代码，因此不存在可供衡量其风险的单一标的持仓。",
              )}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* §65, before any figure and never conditionally. */}
      <ShadowBanner enforcement={data.enforcement} note={data.note} />

      {/* §62 — beside the ticker's own state, never folded into it. */}
      <MarketWidePanel flag={data.market_wide} />

      <div className="panel">
        <h2>
          {eventTypeLabel(snapshot.event_type, t)} {t("event risk", "事件风险")}{" "}
          <span className="provenance quant-derived">{t("DETERMINISTIC", "确定性计算")}</span>
        </h2>

        <p className="er-headline" data-testid="event-risk-headline">
          <EventRiskChip state={state} enforcement={data.enforcement} />{" "}
          <span className="er-countdown">
            {fmtCountdown(snapshot.time_to_event_days, t) ??
              t("timing not reported", "未提供时间信息")}
          </span>
        </p>

        <p className="er-note" data-testid="event-risk-meaning">
          {stateMeaning(state, t)}
        </p>

        {/* UNKNOWN carries the server's own reason. Absence of evidence is a
            state with a cause, never an empty chip. */}
        {unknown && snapshot.reason != null && snapshot.reason !== "" && (
          <p className="er-note mono" data-testid="event-risk-unknown-reason">
            {snapshot.reason}
          </p>
        )}

        <div className="statbar" style={{ marginTop: 12 }}>
          <RiskStat
            label={t("Expected move", "预期波动幅度")}
            termKey="expected_move"
            value={fmtPctNumber(snapshot.expected_move_pct)}
            reason={t(
              "no implied move and no historical sample",
              "既无隐含波动幅度，也无历史样本",
            )}
            sub={basisLabel(snapshot.expected_move_basis, t)}
            testId="event-risk-expected-move"
          />
          <RiskStat
            label={t("Implied move", "隐含波动幅度")}
            termKey="expected_move"
            value={fmtPctNumber(snapshot.implied?.pct)}
            reason={t("no straddle priced for this event", "本次事件无跨式期权定价")}
            sub={snapshot.implied?.basis ?? null}
            testId="event-risk-implied-move"
          />
          <RiskStat
            label={t("Historical median", "历史中位数")}
            value={fmtPctNumber(snapshot.historical?.median_abs)}
            reason={t("no previous comparable event", "无历史同类事件")}
            // §64: the median NEVER renders without its n, in the same tile.
            sub={sampleLine(n, t)}
            testId="event-risk-historical-median"
          />
          <RiskStat
            label={t("Position exposure", "持仓敞口")}
            value={fmtUsd0(snapshot.position_exposure_usd)}
            reason={t("no position in this ticker", "该股票无持仓")}
            sub={
              snapshot.exposure_share == null ||
              !Number.isFinite(snapshot.exposure_share)
                ? t("share of NAV not reported", "未提供占净值比例")
                : t(
                    `${fmtPctNumber(snapshot.exposure_share)} of NAV`,
                    `占净值 ${fmtPctNumber(snapshot.exposure_share)}`,
                  )
            }
            testId="event-risk-exposure"
          />
        </div>

        {basisNote(snapshot.expected_move_basis, t) != null && (
          <p className="er-note" data-testid="event-risk-basis-note">
            {basisNote(snapshot.expected_move_basis, t)}
          </p>
        )}

        <p className="datasource" style={{ marginTop: 12, marginBottom: 0 }}>
          {data.ticker != null && <>{data.ticker} · </>}
          {t("as of", "截至")} {data.as_of ?? "—"}
          {snapshot.model_version != null && <> · {snapshot.model_version}</>}
        </p>
        {coverageReason != null && (
          <p className="er-note mono" data-testid="event-risk-coverage">
            {coverageReason}
          </p>
        )}
      </div>

      <div className="er-two-col">
        <ReasonList
          title={t("Why this state", "该状态的判定依据")}
          items={drivers}
          emptyText={t(
            "The classifier recorded no driver for this state.",
            "分类器未记录该状态的判定依据。",
          )}
          testId="event-risk-drivers"
        />
        <ReasonList
          title={t("What this does not know", "本判定的局限")}
          items={caveats}
          emptyText={t("No caveat was recorded.", "未记录任何注意事项。")}
          testId="event-risk-caveats"
        />
      </div>

      <ComparisonPanel snapshot={snapshot} />

      <HistoricalPanel historical={snapshot.historical} />

      <OptionsPanel
        greeks={snapshot.option_greeks}
        options={data.options}
        sensitivity={snapshot.sensitivity}
      />

      <div className="panel">
        <h2>{t("How to read this tab", "如何理解本页")}</h2>
        <p className="er-note" data-testid="event-risk-limits">
          {t(
            "The state is assigned by a deterministic table over the expected move, the time to the event and the position's share of NAV — no language model is involved in it, and the same inputs always produce the same state. It describes SIZE, never direction. Every historical figure carries the number of events it was computed from, and a small sample is stated as such rather than smoothed into a confident-looking number. Nothing on this tab has ever altered an order.",
            "风险状态由一张确定性规则表判定，输入为预期波动幅度、距事件的时间、以及持仓占净值的比例 — 判定过程不涉及任何语言模型，相同输入始终产生相同状态。它描述的是波动「幅度」，绝非方向。每一项历史统计量都附带其计算所依据的事件数量；样本量小的情况会如实说明，而不会被平滑处理成看似可信的数字。本页的任何内容都从未改变过任何订单。",
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
 * answers (the implied move moves, and a later as-of admits an event that was
 * still ahead at the earlier one), so they must never share a cache entry.
 */
export default function RiskTab({
  eventId,
  asOf,
}: {
  eventId: number;
  asOf?: string;
}) {
  const t = useT();
  const query = useQuery({
    queryKey: ["event-risk", eventId, asOf ?? null],
    queryFn: () => api.events.risk(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("Event risk", "事件风险")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null || query.data == null) {
    return (
      <div className="panel">
        <h2>{t("Event risk", "事件风险")}</h2>
        <p className="error" data-testid="event-risk-error">
          {t(
            `Could not load the event risk: ${query.error?.message ?? "no response"}`,
            `无法加载事件风险数据：${query.error?.message ?? "无响应"}`,
          )}
        </p>
      </div>
    );
  }

  return <RiskTabContent data={query.data} />;
}

/* -------------------------------------------------------- trade-plan panel */

/**
 * The §65 EVENT RISK panel on a trade plan.
 *
 * A trade plan is where event risk actually costs money — the plan is about a
 * position someone is deciding to open, and the print is the thing that will
 * move it. So the panel is deliberately COMPACT and answers the §65 list in
 * order: when the event is, what previous ones delivered (with n), what the
 * option market is charging now, how sensitive this position is, the state
 * chip, and the SHADOW badge.
 *
 * It renders NOTHING when `eventRisk` is null — a plan with no upcoming event
 * gets no panel rather than an empty one, because an "EVENT RISK: —" heading
 * above a trade reads as a cleared check that never ran.
 */
export function EventRiskPlanPanel({
  eventRisk,
  enforcement,
}: {
  eventRisk: PlanEventRisk | EventRiskSnapshot | null | undefined;
  enforcement?: string | null;
}) {
  const t = useT();
  const snapshot = snapshotOf(eventRisk);
  if (eventRisk == null || snapshot == null) return null;

  const state = snapshot.event_risk_state ?? null;
  const n = sampleN(snapshot.historical);
  const days = planDays(snapshot);
  const caveats = stringList(snapshot.caveats);
  // The wrapper carries the mode; on a bare snapshot the caller's prop or the
  // SHADOW default stands in. Never absent — see EventRiskChip.
  const mode =
    (eventRisk as PlanEventRisk).enforcement ?? enforcement ?? null;
  const note = (eventRisk as PlanEventRisk).note ?? null;

  return (
    <div className="panel" data-testid="plan-event-risk">
      <h2>
        {t("Event risk", "事件风险")}{" "}
        <span className="provenance quant-derived">{t("DETERMINISTIC", "确定性计算")}</span>
      </h2>

      {/* §65 layout, in order. The countdown line first: the reason this panel
          is on a trade plan at all is that a print is coming before the exit. */}
      <p className="er-headline" data-testid="plan-event-risk-headline">
        <EventRiskChip state={state} enforcement={mode} />{" "}
        <span className="er-countdown">
          {eventTypeLabel(snapshot.event_type, t)}{" "}
          {fmtCountdown(days, t) ?? t("timing not reported", "未提供时间信息")}
        </span>
        {snapshot.event_key != null && snapshot.event_key !== "" && (
          <>
            {" "}
            <span className="mono er-key">{snapshot.event_key}</span>
          </>
        )}
      </p>

      <div className="kv" style={{ marginTop: 10 }}>
        <div>
          <div className="k">{t("Historical median move", "历史中位波动幅度")}</div>
          <div className="v" data-testid="plan-event-risk-historical">
            {/* §64 — the figure and its n are ONE string here; the panel is
                compact enough that a sibling caption would be missed. */}
            {fmtPctNumber(snapshot.historical?.median_abs) ??
              t("no sample", "无样本")}{" "}
            <span className="er-inline-sample">({sampleLine(n, t)})</span>
          </div>
        </div>
        <div>
          <div className="k">{t("Current implied move", "当前隐含波动幅度")}</div>
          <div className="v" data-testid="plan-event-risk-implied">
            {fmtPctNumber(snapshot.implied?.pct) ??
              t("not priced", "无定价")}
          </div>
        </div>
        <div>
          <div className="k">{t("Position sensitivity", "持仓敏感度")}</div>
          <div className="v" data-testid="plan-event-risk-sensitivity">
            <span className={`badge ${sensitivityBadge(snapshot.sensitivity)}`}>
              {sensitivityLabel(snapshot.sensitivity, t)}
            </span>
          </div>
        </div>
        <div>
          <div className="k">{t("Expected move", "预期波动幅度")}</div>
          <div className="v" data-testid="plan-event-risk-expected">
            {fmtPctNumber(snapshot.expected_move_pct) ?? t("none", "无")}{" "}
            <span className="er-inline-sample">
              ({basisLabel(snapshot.expected_move_basis, t)})
            </span>
          </div>
        </div>
      </div>

      {/* UNKNOWN on a trade plan is the case most likely to be read as "fine".
          It gets the sentence that says otherwise, right under the numbers. */}
      {isUnknown(state) && (
        <p className="er-note" data-testid="plan-event-risk-unknown">
          {stateMeaning(state, t)}
        </p>
      )}

      {caveats.length > 0 && (
        <ul className="why-list er-plan-caveats" data-testid="plan-event-risk-caveats">
          {caveats.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}

      <p className="er-note" data-testid="plan-event-risk-shadow">
        {note != null && note !== "" ? note : enforcementNote(mode, t)}
      </p>
    </div>
  );
}
