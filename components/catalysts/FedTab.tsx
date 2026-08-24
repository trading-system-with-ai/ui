"use client";

/**
 * Phase H §9/§42–§45 — the "Fed" tab.
 *
 * The question this tab answers is the one a rates trader asks before an FOMC
 * meeting: "what exactly did they say last time, what changed from the time
 * before, how divided were they, what moved when it landed, and what have they
 * said since?" The sections run in that order because that is the order the
 * question is asked in.
 *
 * Five rules are specific to this tab, and each exists because the obvious
 * alternative is a Fed screen that reads well and misleads:
 *
 *  A. THERE IS NO HAWKISH/DOVISH SCORE, AND THE TAB SAYS SO OUT LOUD (§43).
 *     Every Fed dashboard a trader has used puts a needle on a hawk–dove dial,
 *     and its absence here would read as an omission rather than a decision.
 *     So the dimensions table carries an explicit note: the language moved on
 *     THESE dimensions, and the platform does not collapse that into one
 *     number. It cannot, honestly — POLICY_RATE unchanged beside a materially
 *     changed FORWARD_GUIDANCE is the most common and most important FOMC
 *     configuration there is, and any scalar destroys exactly that pair.
 *  B. THE TWO REACTION WINDOWS SIT SIDE BY SIDE AND ARE NEVER ADDED (§45).
 *     The statement at 14:00 and the press conference at 14:30 routinely move
 *     markets in OPPOSITE directions; a single "FOMC day return" reports that
 *     afternoon as if nothing happened. They are two columns, with their ET
 *     clock times in the headers, and no cell anywhere combines them.
 *  C. A DAILY BASIS CANNOT SEPARATE THE WINDOWS, AND SAYS SO. When no minute
 *     bars were backfilled the server falls back to daily, and a daily number
 *     under a "14:00–14:30 ET" heading would be a lie of layout. The basis
 *     badge is always visible and the daily case draws an explicit warning.
 *  D. MARKET PRICING IS UNAVAILABLE, IN THE SLOT WHERE IT WOULD LIVE (§42).
 *     This platform subscribes to no fed funds futures feed. The implied
 *     probability of a cut is the most expected number on any Fed screen, and
 *     an empty space where it belongs would be read as "the market prices
 *     nothing". The 2-year yield change is offered beside it under an explicit
 *     PROXY label — a different measurement wearing its own name.
 *  E. THE SOURCE DOCUMENT IS AUTHORITATIVE (§44). Every statement sentence,
 *     the vote wording and the target-range text render verbatim, each
 *     statement and speech links to the Fed's own page, and the full previous
 *     statement is reachable in a disclosure. Nothing on this tab paraphrases
 *     the Fed.
 *
 * And the standing rule from every other read-only tab: THE GET NEVER FETCHES.
 * Opening this tab reads stored documents and stored bars. Spending a request
 * against federalreserve.gov is the explicit Backfill button.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/components/shared/Toast";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type {
  EventFedBackfillResult,
  EventFedPayload,
  FedDimensionReport,
  FedPreviousReaction,
} from "@/lib/types-fed";
import { TierChip } from "./EvidenceSections";
import StatementDiff from "./StatementDiff";
import {
  DATA_SLOTS,
  REACTION_WINDOWS,
  allReactionSymbols,
  backfillCounts,
  basisText,
  coverageNotes,
  dailyBasis,
  dataSlotText,
  disclaimers,
  dimensionLabel,
  dimensionStatusClass,
  dimensionStatusText,
  dissenters,
  fmtChangeBp,
  fmtPrice,
  fmtReturnPct,
  hasPacket,
  isUnanimous,
  marketPricingText,
  minutesParagraphs,
  orderedDimensions,
  proxyEntries,
  rateDirectionText,
  reactionWindow,
  signColor,
  speeches,
  stampDay,
  stampMinute,
  statementParagraphs,
  targetRangeBounds,
  targetRangeText,
  voteTally,
  windowReturn,
} from "./fed-format";

/* --------------------------------------------------------------- sections */

/**
 * §44 — the statement itself: where it came from, what the range is, how the
 * committee voted, and the full text one click away.
 */
function PreviousStatement({ data }: { data: EventFedPayload }) {
  const t = useT();
  const statement = data.packet?.previous_statement ?? null;
  const paragraphs = statementParagraphs(data.packet);
  const vote = statement?.vote ?? null;
  const range = statement?.target_range ?? null;
  const change = data.packet?.policy_rate_change ?? null;

  if (statement == null) {
    return (
      <div className="mt-section" data-testid="fed-statement">
        <h3>
          {t("Previous statement", "上次政策声明")} <TierChip tier="DATA" />
        </h3>
        <p className="empty" data-testid="fed-statement-none">
          {t(
            "No FOMC statement is stored for the previous meeting. This tab reads documents the platform has already downloaded from federalreserve.gov — press Backfill to fetch them.",
            "尚未存储上次会议的 FOMC 声明。本标签页读取平台此前已从 federalreserve.gov 下载的文件 — 点击「回填」以获取。",
          )}
        </p>
      </div>
    );
  }

  const tally = voteTally(vote);
  const dissenterNames = dissenters(vote);
  const unanimous = isUnanimous(vote);
  const rangeText = targetRangeText(range);
  const bounds = targetRangeBounds(range);
  const direction = rateDirectionText(change?.direction, t);
  const changeBp = fmtChangeBp(change?.change_bp);

  return (
    <div className="mt-section" data-testid="fed-statement">
      <h3>
        {t("Previous statement", "上次政策声明")} <TierChip tier="DATA" />
      </h3>

      <div className="kv">
        <div>
          <div className="k">{t("Released", "发布时间")}</div>
          <div className="v mono" data-testid="fed-statement-released">
            {stampMinute(statement.released_at) == null
              ? "—"
              : `${stampMinute(statement.released_at)} UTC`}
          </div>
        </div>
        <div>
          <div className="k">{t("Target range", "目标利率区间")}</div>
          <div className="v" data-testid="fed-target-range">
            {/* Rule E — the Fed's own wording first, the parse beside it. A
                clean decimal alone would launder a mis-parse. */}
            <span className="fed-range">{rangeText ?? "—"}</span>
            {bounds != null && rangeText !== bounds && (
              <span className="mono mt-dim" data-testid="fed-target-range-parsed">
                {" "}
                ({bounds})
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="k">{t("Rate decision", "利率决定")}</div>
          <div className="v" data-testid="fed-rate-change">
            {direction == null && changeBp == null ? (
              "—"
            ) : (
              <>
                {direction != null && (
                  <span className="badge dim" data-testid="fed-rate-direction">
                    {direction}
                  </span>
                )}{" "}
                <span className="mono" data-testid="fed-rate-change-bp">
                  {changeBp ?? "—"}
                </span>
              </>
            )}
          </div>
        </div>
        <div>
          <div className="k">{t("Source", "来源")}</div>
          <div className="v">
            {statement.url == null || statement.url === "" ? (
              <span className="mt-dim">—</span>
            ) : (
              /* Rule E — the document is authoritative, so it is always one
                 click away and never only summarised here. */
              <a
                href={statement.url}
                target="_blank"
                rel="noopener noreferrer"
                className="src-link"
                data-testid="fed-statement-link"
              >
                {t("Open the statement →", "打开原文声明 →")}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* The vote, on its own line: dispersion is a §43 dimension in its own
          right, and the names are the finding — "2 against" loses which way
          they dissented, and a dissent for a cut and one for a hold are
          opposite facts. */}
      <div className="fed-vote" data-testid="fed-vote">
        <span className="k">{t("Vote", "投票结果")}</span>{" "}
        {tally == null ? (
          <span className="mt-dim" data-testid="fed-vote-unparsed">
            {t(
              "not parsed from the statement",
              "未能从声明中解析",
            )}
          </span>
        ) : (
          <>
            <span className="mono fed-tally" data-testid="fed-vote-tally">
              {tally}
            </span>{" "}
            {unanimous === true && (
              <span className="badge dim" data-testid="fed-vote-unanimous">
                {t("UNANIMOUS", "全票通过")}
              </span>
            )}
          </>
        )}
        {dissenterNames.length > 0 && (
          <div className="fed-dissent" data-testid="fed-dissenters">
            <span className="k">{t("Dissenting", "反对票")}</span>{" "}
            {dissenterNames.map((name, i) => (
              <span key={`${name}-${i}`} className="chip" data-testid="fed-dissenter">
                {name}
              </span>
            ))}
          </div>
        )}
        {/* Verbatim vote sentence (rule E). */}
        {typeof vote?.text === "string" && vote.text !== "" && (
          <p className="fed-vote-text" data-testid="fed-vote-text">
            {vote.text}
          </p>
        )}
      </div>

      {/* Rule E — the whole document, reachable. Collapsed because the diff
          above it is what the reader came for; present because the platform
          must never be the only place the statement exists. */}
      {paragraphs.length > 0 && (
        <details className="fd-unchanged" data-testid="fed-statement-full">
          <summary>
            {t(
              `Full statement text (${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"})`,
              `声明全文（${paragraphs.length} 段）`,
            )}
          </summary>
          <div className="fed-paragraphs">
            {paragraphs.map((para, i) => (
              <p key={i} data-testid="fed-statement-paragraph">
                {para}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** §44 — what changed between the last two statements. */
function DiffSection({ data }: { data: EventFedPayload }) {
  const t = useT();
  const released = stampDay(data.packet?.previous_statement?.released_at);
  return (
    <div className="mt-section" data-testid="fed-diff-section">
      <h3>
        {t("Statement diff", "声明逐句对比")} <TierChip tier="DATA" />{" "}
        <TierChip tier="QUANT" />
      </h3>
      <p className="an-note">
        {t(
          "The previous statement against the one before it, sentence by sentence. The comparison is computed from the stored documents with a deterministic text diff — the same two statements always produce the same result, and nothing here is a model's reading of them.",
          "将上次声明与其前一次声明逐句对比。该对比依据已存储文件通过确定性文本差分算法计算 — 相同的两份声明始终得出相同结果,其中不包含任何模型解读。",
        )}
      </p>
      <StatementDiff
        diff={data.packet?.statement_diff}
        previousLabel={t("the statement before it", "前一次声明")}
        currentLabel={
          released == null
            ? t("the previous statement", "上次声明")
            : t(`the statement of ${released}`, `${released} 的声明`)
        }
      />
    </div>
  );
}

/**
 * §43 — the dimensions, reported SEPARATELY.
 *
 * Rule A lives here. The table has a status column and two text columns and no
 * score column, and the note above it says why in plain language rather than
 * leaving the absence to be read as a gap.
 */
function Dimensions({ data }: { data: EventFedPayload }) {
  const t = useT();
  const dimensions = data.packet?.dimensions ?? null;
  const keys = orderedDimensions(dimensions);

  return (
    <div className="mt-section" data-testid="fed-dimensions">
      <h3>
        {t("Policy dimensions", "政策维度")} <TierChip tier="DATA" />{" "}
        <TierChip tier="QUANT" />
      </h3>

      {/* Rule A, stated where the dial would be. */}
      <div className="capability-banner" role="status" data-testid="fed-no-score">
        <p className="cb-line">
          <span className="badge amber">
            {t("NO SINGLE HAWKISH/DOVISH SCORE", "不提供单一鹰派/鸽派评分")}
          </span>{" "}
          {t(
            "By design. Each dimension is reported on its own, because the configuration that matters most is the one a single number destroys: a target range left unchanged beside forward guidance that moved materially. The platform locates and pairs the language; what it means for policy is the reader's judgement, and the Analysis tab's model is required to explain it per dimension rather than collapse it into one label.",
            "此为刻意设计。各维度独立呈现,因为最关键的情形恰恰会被单一数字抹去：目标利率区间维持不变,而前瞻指引已发生实质变化。本平台负责定位并配对相关表述;其政策含义由读者自行判断,「分析」标签页的模型也被要求逐维度解释,而非归结为单一标签。",
          )}
        </p>
      </div>

      {keys.length === 0 ? (
        <p className="empty" data-testid="fed-dimensions-none">
          {t(
            "No dimension report is stored. It is computed from two consecutive statements — both must be on file.",
            "尚未存储维度分析结果。该分析需依据连续两次声明计算 — 两份文件均须已存档。",
          )}
        </p>
      ) : (
        <table className="mt-table" data-testid="fed-dimensions-table">
          <thead>
            <tr>
              <th>{t("Dimension", "维度")}</th>
              <th>{t("Status", "状态")}</th>
              <th>{t("Previous statement", "前一次声明")}</th>
              <th>{t("Later statement", "后一次声明")}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const report: FedDimensionReport = dimensions?.[key] ?? {};
              const previous = Array.isArray(report.previous) ? report.previous : [];
              const current = Array.isArray(report.current) ? report.current : [];
              const status = typeof report.status === "string" ? report.status : null;
              return (
                <tr key={key} data-testid={`fed-dimension-${key}`}>
                  <td className="fed-dim-name">{dimensionLabel(key, t)}</td>
                  <td>
                    {/* accent/dim only — a weight, never a direction (rule A). */}
                    <span
                      className={`badge ${dimensionStatusClass(status)}`}
                      data-testid={`fed-dimension-status-${key}`}
                    >
                      {dimensionStatusText(status, t)}
                    </span>
                  </td>
                  <td data-testid={`fed-dimension-previous-${key}`}>
                    {previous.length === 0 ? (
                      <span className="mt-dim">—</span>
                    ) : (
                      /* Verbatim sentences (rule E) — the reader who disagrees
                         with the tag can check it against the source words. */
                      <ul className="fed-sentences">
                        {previous.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-testid={`fed-dimension-current-${key}`}>
                    {current.length === 0 ? (
                      <span className="mt-dim">—</span>
                    ) : (
                      <ul className="fed-sentences">
                        {current.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Server notes, verbatim, under the rows they qualify. */}
      {keys.some((k) => typeof dimensions?.[k]?.notes === "string" && dimensions[k].notes !== "") && (
        <ul className="ot-notes" data-testid="fed-dimension-notes">
          {keys.map((k) => {
            const note = dimensions?.[k]?.notes;
            if (typeof note !== "string" || note === "") return null;
            return (
              <li key={k}>
                <span className="mono">{dimensionLabel(k, t)}</span> — {note}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * §45 — the two windows, side by side.
 *
 * Rules B and C live here. One row per symbol, one column per window, and a
 * basis badge that governs whether the columns are honest at all: on a daily
 * basis there IS no 14:00–14:30 measurement, and the warning says so rather
 * than letting the column heading imply one.
 */
function PreviousReaction({ reaction }: { reaction: FedPreviousReaction | null }) {
  const t = useT();
  const symbols = allReactionSymbols(reaction);
  const basis = reaction?.basis ?? null;
  const isDaily = dailyBasis(basis);

  return (
    <div className="mt-section" data-testid="fed-reaction">
      <h3>
        {t("Previous market reaction", "上次市场反应")} <TierChip tier="QUANT" />
      </h3>

      {reaction == null || symbols.length === 0 ? (
        <p className="empty" data-testid="fed-reaction-none">
          {t(
            "No reaction is stored for the previous decision. It is measured from stored bars around the last meeting — backfilling the Fed data fills it.",
            "上次利率决议暂无已存储的市场反应数据。该数据依据上次会议前后的已存储 K 线计算 — 回填美联储数据后即可显示。",
          )}
        </p>
      ) : (
        <>
          <p className="an-note">
            {t(
              "An FOMC afternoon holds two separate events. The statement lands at 14:00 ET and the chair takes questions from 14:30, and the two routinely move markets in opposite directions — a statement read as dovish that the press conference walks back inside the hour. They are measured and shown apart, and this platform never adds them into one FOMC-day number.",
              "FOMC 当天下午包含两个独立事件：政策声明于美东时间 14:00 发布,主席自 14:30 起答记者问,二者常常令市场朝相反方向波动 — 例如声明被解读为鸽派,而新闻发布会在一小时内即扭转该解读。因此两者分别计算、分别展示,本平台绝不将其合并为单一的「FOMC 当日涨跌」。",
            )}
          </p>

          <div className="kv">
            <div>
              <div className="k">{t("Measured around", "计算基准时点")}</div>
              <div className="v mono" data-testid="fed-reaction-at">
                {stampMinute(reaction?.decision_at) ?? "—"}
              </div>
            </div>
            <div>
              <div className="k">{t("Basis", "计算口径")}</div>
              <div className="v">
                {/* Rule C — always visible, because it decides whether the two
                    columns beside it are two measurements or one. */}
                <span
                  className={`badge ${isDaily ? "amber" : "dim"}`}
                  data-testid="fed-reaction-basis"
                >
                  {basisText(basis, t)}
                </span>
              </div>
            </div>
          </div>

          {isDaily && (
            <div className="capability-banner" role="status" data-testid="fed-daily-warning">
              <p className="cb-line">
                <span className="badge amber">{t("NOT SEPARATED", "未区分窗口")}</span>{" "}
                {t(
                  "No minute bars are stored for the previous decision, so these figures come from daily closes. A daily bar cannot tell the statement window apart from the press-conference window — what is shown is the whole session, and the two columns below are not two measurements. Backfill the Fed data to store the minute window and split them.",
                  "上次利率决议未存储分钟级 K 线,因此以下数据依据日收盘价计算。日 K 线无法区分政策声明窗口与新闻发布会窗口 — 所示为全天行情,下方两列并非两项独立测算。回填美联储数据以存储分钟级窗口后方可区分。",
                )}
              </p>
            </div>
          )}

          <table className="mt-table" data-testid="fed-reaction-table">
            <thead>
              <tr>
                <th>{t("Asset", "资产")}</th>
                {/* Rule B — the ET clock time is IN the header. A column headed
                    only "Statement" invites reading it as the whole afternoon. */}
                {REACTION_WINDOWS.map((w) => (
                  <th key={w.key} className="num">
                    {t(w.en, w.zh)}
                    <span className="fed-window-time mono">
                      {t(w.windowEn, w.windowZh)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {symbols.map((symbol) => (
                <tr key={symbol} data-testid={`fed-reaction-${symbol}`}>
                  <td className="mono">{symbol}</td>
                  {REACTION_WINDOWS.map((w) => {
                    const window = reactionWindow(reaction, w.key);
                    const v = windowReturn(window, symbol);
                    const entry = window?.[symbol] ?? null;
                    const pre = fmtPrice(entry?.pre_close);
                    const post = fmtPrice(entry?.post_close);
                    return (
                      <td
                        key={w.key}
                        className="num mono"
                        style={{ color: signColor(v) }}
                        data-testid={`fed-return-${w.key}-${symbol}`}
                      >
                        {fmtReturnPct(v) ?? "—"}
                        {pre != null && post != null && (
                          <span
                            className="fed-closes mt-dim"
                            data-testid={`fed-closes-${w.key}-${symbol}`}
                          >
                            {pre} → {post}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/** §42 — the number this platform does not have, in the slot where it lives. */
function MarketPricing({ data }: { data: EventFedPayload }) {
  const t = useT();
  const pricing = data.packet?.market_pricing ?? null;
  const proxies = proxyEntries(pricing, t);

  return (
    <div className="mt-section" data-testid="fed-pricing">
      <h3>
        {t("Market pricing", "市场定价")} <TierChip tier="DATA" />
      </h3>

      {/* Rule D — loud, in the slot the implied probability would occupy. */}
      <div className="capability-banner" role="status" data-testid="fed-pricing-unavailable">
        <p className="cb-line">
          <span className="badge amber" data-testid="fed-pricing-status">
            {t("MARKET PRICING ", "市场定价 ")}
            {marketPricingText(pricing, t)}
          </span>{" "}
          {typeof pricing?.reason === "string" && pricing.reason !== ""
            ? /* Verbatim server reason when it sends one. */
              pricing.reason
            : t(
                "This platform subscribes to no fed funds futures feed, so no implied probability of a cut or a hike is shown for this meeting — not an approximate one, and not one inferred from anything else. That figure is the most expected number on a Fed screen, which is exactly why an empty cell here would be filled in from memory.",
                "本平台未订阅联邦基金利率期货数据,因此不展示本次会议降息或加息的隐含概率 — 既不展示近似值,也不由其他数据推断。该数值是美联储相关页面上最受期待的数字,正因如此,此处留空极易被读者凭印象自行脑补。",
              )}
        </p>
      </div>

      {proxies.length > 0 && (
        <>
          <div className="mt-yields" data-testid="fed-proxies">
            {proxies.map((proxy) => (
              <div key={proxy.key} className="mt-yield" data-testid={`fed-proxy-${proxy.key}`}>
                <div className="k">
                  {proxy.label}{" "}
                  {/* The proxy wears its own name and a badge; it never borrows
                      the name of the number above it. */}
                  <span className="badge dim">{t("PROXY", "代理指标")}</span>
                </div>
                <div
                  className="mt-yield-v mono"
                  style={{ color: signColor(proxy.value) }}
                >
                  {proxy.text ?? "—"}
                </div>
              </div>
            ))}
          </div>
          <p className="an-note" data-testid="fed-proxy-note">
            {t(
              "A yield move is not a probability. The 2-year note is the tenor most sensitive to the expected path of policy, so its change across the decision is the closest observable this platform has — but it responds to the whole statement and the press conference together, and it is reported as what it is: a yield change, in basis points.",
              "收益率变动并非概率。2 年期美债对政策路径预期最为敏感,其在决议前后的变动是本平台可获得的最接近的可观测指标 — 但它同时反映了政策声明与新闻发布会的综合影响,因此仅按其本来含义呈现：以基点计的收益率变动。",
            )}
          </p>
        </>
      )}
    </div>
  );
}

/** §42 — the minutes of the previous meeting, and what they emphasised. */
function Minutes({ data }: { data: EventFedPayload }) {
  const t = useT();
  const minutes = data.packet?.previous_minutes ?? null;
  const paragraphs = minutesParagraphs(data.packet);

  return (
    <div className="mt-section" data-testid="fed-minutes">
      <h3>
        {t("Previous minutes", "上次会议纪要")} <TierChip tier="DATA" />
      </h3>
      {minutes == null ? (
        <p className="empty" data-testid="fed-minutes-none">
          {t(
            "No minutes are stored for the previous meeting. Minutes are published three weeks after the decision — for a recent meeting, they may not exist yet.",
            "尚未存储上次会议纪要。会议纪要于决议后三周发布 — 若会议刚结束不久,纪要可能尚未公布。",
          )}
        </p>
      ) : (
        <>
          <div className="kv">
            <div>
              <div className="k">{t("Released", "发布时间")}</div>
              <div className="v mono" data-testid="fed-minutes-released">
                {stampDay(minutes.released_at) ?? "—"}
              </div>
            </div>
            <div>
              <div className="k">{t("Source", "来源")}</div>
              <div className="v">
                {minutes.url == null || minutes.url === "" ? (
                  <span className="mt-dim">—</span>
                ) : (
                  <a
                    href={minutes.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="src-link"
                    data-testid="fed-minutes-link"
                  >
                    {t("Open the minutes →", "打开会议纪要 →")}
                  </a>
                )}
              </div>
            </div>
          </div>
          {paragraphs.length > 0 && (
            <ul className="fed-key-paragraphs" data-testid="fed-minutes-paragraphs">
              {paragraphs.map((para, i) => (
                /* Verbatim (rule E) — these are the sentences the server
                   tagged, not a summary of them. */
                <li key={i} data-testid="fed-minutes-paragraph">
                  {para}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** §42 — what committee members have said since the last decision. */
function Speeches({ data }: { data: EventFedPayload }) {
  const t = useT();
  const list = speeches(data.packet);

  return (
    <div className="mt-section" data-testid="fed-speeches">
      <h3>
        {t("Speeches since the last decision", "上次决议以来的官员讲话")}{" "}
        <TierChip tier="DATA" />
      </h3>
      {list.length === 0 ? (
        <p className="empty" data-testid="fed-speeches-none">
          {t(
            "No Fed speech is stored between the previous decision and the as-of instant. That is a state, not a gap — the committee observes a blackout period before each meeting.",
            "在上次决议与计算时点之间,没有已存储的美联储官员讲话。这是一种状态,而非数据缺口 — 委员会在每次会议前设有噤声期。",
          )}
        </p>
      ) : (
        <ul className="mt-related-list" data-testid="fed-speeches-list">
          {list.map((speech, i) => (
            <li key={`${speech.url ?? i}`} data-testid="fed-speech">
              <span className="mono mt-dim">{stampDay(speech.at) ?? "—"}</span>{" "}
              <span className="chip" data-testid="fed-speech-speaker">
                {speech.speaker ?? t("Unattributed", "未署名")}
              </span>{" "}
              {speech.url == null || speech.url === "" ? (
                <span>{speech.title ?? "—"}</span>
              ) : (
                <a
                  href={speech.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="src-link"
                >
                  {speech.title ?? speech.url}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** §42 — the prints the committee is deciding against. Pass-through. */
function DataPanel({ data }: { data: EventFedPayload }) {
  const t = useT();
  const panel = data.packet?.data ?? null;
  const rows = DATA_SLOTS.map((slot) => ({
    slot,
    text: dataSlotText(panel?.[slot.key]),
  })).filter((row) => row.text != null);

  if (rows.length === 0) {
    return (
      <div className="mt-section" data-testid="fed-data">
        <h3>
          {t("Data the committee is watching", "委员会关注的数据")}{" "}
          <TierChip tier="DATA" />
        </h3>
        <p className="empty" data-testid="fed-data-none">
          {t(
            "No macro prints are stored alongside this packet. They come from the macro store — backfilling a CPI or employment event fills them.",
            "本数据包未附带已存储的宏观数据。相关数据来自宏观数据库 — 回填 CPI 或就业事件后即可显示。",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-section" data-testid="fed-data">
      <h3>
        {t("Data the committee is watching", "委员会关注的数据")}{" "}
        <TierChip tier="DATA" />
      </h3>
      <div className="kv">
        {rows.map(({ slot, text }) => (
          <div key={slot.key} data-testid={`fed-data-${slot.key}`}>
            <div className="k">{t(slot.en, slot.zh)}</div>
            <div className="v mono">{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- content */

/**
 * The render half, split from the query half so tests mount it with a fixed
 * payload and no network — the same split MacroTab, TimelineTab and
 * AnalysisTab use.
 */
export function FedTabContent({
  data,
  onBackfill,
  backfilling = false,
}: {
  data: EventFedPayload | null | undefined;
  onBackfill?: () => void;
  backfilling?: boolean;
}) {
  const t = useT();
  const notes = coverageNotes(data?.packet?.coverage ?? data?.coverage);
  const lines = disclaimers(data);

  return (
    <div className="panel" data-testid="fed-panel">
      <h2>
        {t("Fed policy", "美联储政策")} <TierChip tier="DATA" />{" "}
        <TierChip tier="QUANT" />
      </h2>
      <p className="an-note">
        {t(
          "What the committee last said, what changed from the statement before it, how the vote split, what markets did across each of the two windows that afternoon, and what officials have said since. Every word of policy language here is the Federal Reserve's own, stored as published; everything measured is computed from stored bars. Opening this tab fetches nothing.",
          "本页展示：委员会上次的政策表述、与其前一次声明相比的变化、投票分歧情况、当天下午两个窗口内的市场表现,以及此后官员的公开讲话。页面中所有政策措辞均为美联储原文,按发布原样存储;所有测算数据均依据已存储 K 线计算。打开本标签页不会触发任何数据抓取。",
        )}
      </p>

      {/* Server disclaimer lines, verbatim, above the first number. */}
      {lines.length > 0 && (
        <div className="capability-banner" role="status" data-testid="fed-disclaimers">
          {lines.map((line, i) => (
            <p className="cb-line" key={i} data-testid="fed-disclaimer">
              {line}
            </p>
          ))}
        </div>
      )}

      {!hasPacket(data) && (
        <p className="empty" data-testid="fed-empty">
          {t(
            "No Fed packet is stored for this event yet. This tab reads statements, minutes and speeches the platform has already downloaded from federalreserve.gov — press Backfill to fetch them.",
            "该事件尚无已存储的美联储数据包。本标签页读取平台此前已从 federalreserve.gov 下载的声明、纪要与讲话 — 点击「回填」以获取。",
          )}
        </p>
      )}

      <PreviousStatement data={data ?? {}} />
      <DiffSection data={data ?? {}} />
      <Dimensions data={data ?? {}} />
      <PreviousReaction reaction={data?.packet?.previous_reaction ?? null} />
      <MarketPricing data={data ?? {}} />
      <Minutes data={data ?? {}} />
      <Speeches data={data ?? {}} />
      <DataPanel data={data ?? {}} />

      {notes.length > 0 && (
        <ul className="ot-notes" data-testid="fed-coverage">
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
            data-testid="fed-backfill"
          >
            {backfilling
              ? t("Backfilling…", "回填中…")
              : t("Backfill Fed documents", "回填美联储文件")}
          </button>
        </div>
      )}
      <p className="action-note">
        {t(
          "Backfill is the only control here that spends anything: it downloads the last two FOMC statements, the previous meeting's minutes and any speeches since from federalreserve.gov, and stores the minute bars around the previous decision so the two reaction windows can be told apart. Reading this tab never does.",
          "「回填」是本页唯一会消耗外部调用的操作：它会从 federalreserve.gov 下载最近两次 FOMC 声明、上次会议纪要及此后的官员讲话,并存储上次决议前后的分钟级 K 线,以便区分两个市场反应窗口。仅浏览本页则不会。",
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- tab */

export default function FedTab({
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
    queryKey: ["event-fed", eventId, asOf ?? null],
    queryFn: () => api.events.fed(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["event-fed", eventId] });
    qc.invalidateQueries({ queryKey: ["audit"] });
    setNonce((n) => n + 1);
  };

  /**
   * Report a backfill by what the SERVER stored, never by the fact the request
   * returned 200. A backfill that stored nothing is a RESULT with a reason
   * (the statement page 404s because the meeting has not happened, the RSS
   * feed carries no minutes yet), and calling it a success would imply
   * documents that are not there.
   */
  const backfill = useMutation({
    mutationFn: () => api.events.backfillFed(eventId),
    onSuccess: (result: EventFedBackfillResult) => {
      const counts = backfillCounts(result);
      if (counts == null) {
        toast(
          "WARNING",
          t(
            "The server did not report what it stored; reload before trusting this tab.",
            "服务端未报告存储结果，请刷新后再查看本页数据。",
          ),
        );
      } else if (counts.total <= 0) {
        toast(
          "INFO",
          t(
            `Nothing was stored: ${result.reason ?? result.status ?? "the server gave no reason"}`,
            `未存储任何数据：${result.reason ?? result.status ?? "服务端未提供原因"}`,
          ),
        );
      } else {
        const docs = counts.documents;
        const bars = counts.bars;
        toast(
          "SUCCESS",
          t(
            `Stored ${docs} document${docs === 1 ? "" : "s"} and ${bars} bar${bars === 1 ? "" : "s"}.`,
            `已存储 ${docs} 份文件与 ${bars} 条 K 线数据。`,
          ),
        );
      }
      invalidate();
    },
    onError: (e: Error) =>
      toast(
        "WARNING",
        t(`Fed backfill failed: ${e.message}`, `美联储数据回填失败：${e.message}`),
      ),
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("Fed policy", "美联储政策")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null) {
    return (
      <div className="panel">
        <h2>{t("Fed policy", "美联储政策")}</h2>
        {/* Verbatim server message — a paraphrased error is an error that
            cannot be matched against the logs that produced it. */}
        <p className="error" data-testid="fed-error">
          {t(
            `Could not load the Fed packet: ${query.error.message}`,
            `无法加载美联储数据包：${query.error.message}`,
          )}
        </p>
      </div>
    );
  }

  return (
    <FedTabContent
      data={query.data}
      onBackfill={() => backfill.mutate()}
      backfilling={backfill.isPending}
    />
  );
}
