"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, useState } from "react";
import NotConfigured from "@/components/shared/NotConfigured";
import Term from "@/components/shared/Term";
import {
  api,
  ApiError,
  isMarketDataNotConfigured,
  notConfiguredMessage,
  retryUnlessTerminal,
} from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import { fmtPct, fmtUsd } from "@/lib/risk-format";
import { useCapabilities } from "@/lib/use-capabilities";
import type {
  OptionChainResponse,
  OptionContractRow,
  OptionDirection,
} from "@/lib/types";

/* ---------------------------------------------------------------- formatting
 * §34 conventions: prices 2dp, greeks 3dp, IV as %, spread as %. All the
 * API's vol/spread fields arrive as FRACTIONS (0.32 = 32%) — fmtPct scales
 * by 100.
 */

/** EOD fallback (plans without the live chain snapshot): contracts reference +
 *  previous-session bars. Labeled END OF DAY (§25/§37) — never styled as a
 *  live chain; what the plan cannot serve is named, never approximated. */
function OptionsEodView({ ticker }: { ticker: string }) {
  const t = useT();
  const eod = useQuery({
    queryKey: ["options-eod", ticker],
    queryFn: () => api.watchlist.optionsEod(ticker),
    retry: retryUnlessTerminal,
    // Server caches per (ticker, day); EOD data is static intraday.
    refetchInterval: false,
    staleTime: 60 * 60 * 1000,
  });
  if (eod.isPending) {
    return (
      <p className="empty" style={{ marginTop: 12 }}>
        {t("Loading end-of-day options reference…", "正在加载日终期权参考数据…")}
      </p>
    );
  }
  if (eod.isError) {
    return (
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 12 }}>
        {t(
          `End-of-day options reference also unavailable: ${eod.error.message}`,
          `日终期权参考数据同样不可用：${eod.error.message}`,
        )}
      </p>
    );
  }
  const data = eod.data;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="badge amber">{t("END OF DAY", "日终数据")}</span>
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          {t("Options reference", "期权参考数据")} — {data.ticker}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {t("spot reference", "现货参考价")} ${data.spot_reference.toFixed(2)} ({data.spot_reference_note})
        </span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "6px 0 12px" }}>
        {data.note} {t("Not part of this EOD view:", "此日终视图不包含：")}{" "}
        {data.not_in_this_view.join(", ")}.
      </p>

      <h3 style={{ fontSize: 12, margin: "0 0 6px" }}>{t("Expirations", "到期日")}</h3>
      <table style={{ marginBottom: 14 }}>
        <thead>
          <tr>
            <th>{t("Expiry", "到期日")}</th>
            <th style={{ textAlign: "right" }}><Term k="dte">DTE</Term></th>
            <th style={{ textAlign: "right" }}>{t("Strikes", "行权价数")}</th>
            <th style={{ textAlign: "right" }}>{t("Calls", "看涨")}</th>
            <th style={{ textAlign: "right" }}>{t("Puts", "看跌")}</th>
          </tr>
        </thead>
        <tbody>
          {data.expirations.map((e) => (
            <tr
              key={e.date}
              style={
                e.date === data.target_expiry ? { background: "var(--bg-hover)" } : undefined
              }
            >
              <td>
                {e.date}
                {e.date === data.target_expiry && (
                  <span className="chip" style={{ marginLeft: 6 }}>{t("front focus", "近月焦点")}</span>
                )}
              </td>
              <td style={{ textAlign: "right" }}>{e.dte}</td>
              <td style={{ textAlign: "right" }}>{e.strikes}</td>
              <td style={{ textAlign: "right" }}>{e.calls}</td>
              <td style={{ textAlign: "right" }}>{e.puts}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.atm_contracts.length > 0 && (
        <>
          <h3 style={{ fontSize: 12, margin: "0 0 6px" }}>
            {t(
              "Nearest-to-ATM contracts · previous session (EOD)",
              "最接近 ATM 的合约 · 上一交易日（日终）",
            )}
          </h3>
          <table>
            <thead>
              <tr>
                <th>{t("Contract", "合约")}</th>
                <th>{t("Type", "类型")}</th>
                <th style={{ textAlign: "right" }}>{t("Strike", "行权价")}</th>
                <th style={{ textAlign: "right" }}>{t("Close", "收盘")}</th>
                <th style={{ textAlign: "right" }}>{t("Open", "开盘")}</th>
                <th style={{ textAlign: "right" }}>{t("High", "最高")}</th>
                <th style={{ textAlign: "right" }}>{t("Low", "最低")}</th>
                <th style={{ textAlign: "right" }}>{t("Volume", "成交量")}</th>
                <th style={{ textAlign: "right" }}>VWAP</th>
                <th>{t("Session", "交易日")}</th>
              </tr>
            </thead>
            <tbody>
              {data.atm_contracts.map((c) => (
                <tr key={c.ticker}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{c.ticker}</td>
                  <td>
                    <span className={`badge ${c.contract_type === "call" ? "bull" : "bear"}`}>
                      {c.contract_type.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>{c.strike.toFixed(2)}</td>
                  {c.prev_day != null ? (
                    <>
                      <td style={{ textAlign: "right" }}>{c.prev_day.close.toFixed(2)}</td>
                      <td style={{ textAlign: "right" }}>{c.prev_day.open?.toFixed(2) ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{c.prev_day.high?.toFixed(2) ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{c.prev_day.low?.toFixed(2) ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{c.prev_day.volume.toLocaleString()}</td>
                      <td style={{ textAlign: "right" }}>{c.prev_day.vwap?.toFixed(2) ?? "—"}</td>
                      <td style={{ fontSize: 12 }}>{c.prev_day.date ?? "—"}</td>
                    </>
                  ) : (
                    <td colSpan={7} style={{ color: "var(--text-dim)", fontSize: 12 }}>
                      {t("no previous-session bar", "无上一交易日K线")}
                      {c.prev_day_error != null
                        ? ` (${c.prev_day_error})`
                        : t(" — did not trade", " — 未发生成交")}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function price2(v: number | null | undefined): string {
  // Plans without the trades/quotes feeds serve honest nulls — render a
  // dash, never a fabricated 0.00.
  return v == null ? "—" : v.toFixed(2);
}

function pctOrDash(v: number | null, digits = 1): string {
  return v == null ? "—" : fmtPct(v, digits);
}

function signedPctOrDash(v: number | null, digits = 1): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${fmtPct(v, digits)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-18" → "Sep 18" (parsed by hand — Date("YYYY-MM-DD") is UTC and can shift a day). */
function fmtExpiryShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[((m ?? 1) - 1 + 12) % 12]} ${d ?? "?"}`;
}

function fmtComponentValue(
  v: number | string | boolean,
  t: (en: string, zh: string) => string,
): string {
  if (typeof v === "boolean") return v ? t("yes", "是") : t("no", "否");
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return v;
}

function contractKey(r: OptionContractRow): string {
  return `${r.expiry}|${r.strike}|${r.right}`;
}

/* ---------------------------------------------------------------- controls */

const DIRECTIONS: OptionDirection[] = ["AUTO", "BULL", "BEAR"];

type ChainView = "all" | "eligible" | "candidates";

const VIEWS: { id: ChainView; en: string; zh: string }[] = [
  { id: "all", en: "All", zh: "全部" },
  { id: "eligible", en: "Eligible", zh: "合格" },
  { id: "candidates", en: "Recommended Candidate", zh: "推荐候选" },
];

/** Sentinel for the "every expiry" chip. */
const ALL_EXPIRIES = "ALL";

// Rank/expand column + the 15 §34-required columns.
const COLS = 16;

// T-chain sub-header cells as [label, glossary key] — the glossary key feeds
// the <Term> beginner explainer card (lib/glossary.ts, bilingual).
const TCHAIN_CALL_COLS: [string, string][] = [
  ["OI", "open_interest"],
  ["Vol", "volume"],
  ["IV", "iv"],
  ["Δ", "delta"],
  ["Bid", "bid"],
  ["Mid", "mid"],
  ["Ask", "ask"],
];
const TCHAIN_PUT_COLS: [string, string][] = [...TCHAIN_CALL_COLS].reverse();

/* ---------------------------------------------------------------- summary strip */

function SummaryStrip({ data }: { data: OptionChainResponse }) {
  const t = useT();
  const el = useEnumLabel();
  const s = data.summary;
  const move = s.expected_move_pct;
  return (
    <div className="statbar">
      <div className="stat">
        <div className="label"><Term k="spot">{t("Spot", "现货价")}</Term></div>
        <div className="value">{fmtUsd(data.spot, 2)}</div>
      </div>
      <div className="stat">
        <div className="label"><Term k="iv">ATM IV</Term></div>
        <div className="value">{pctOrDash(s.atm_iv)}</div>
        <div className="sub">{t("nearest 30d+ expiry", "最近的 30 天以上到期")}</div>
      </div>
      <div className="stat">
        <div className="label"><Term k="expected_move">{t("Expected move", "预期波动")}</Term></div>
        <div className="value">{move == null ? "—" : `±${fmtPct(move)}`}</div>
        <div className="sub">
          {move == null
            ? t("ATM straddle, nearest 30d+ expiry", "ATM 跨式组合，最近的 30 天以上到期")
            : t(
                `±${fmtUsd(move * data.spot, 2)} · ATM straddle, nearest 30d+ expiry`,
                `±${fmtUsd(move * data.spot, 2)} · ATM 跨式组合，最近的 30 天以上到期`,
              )}
        </div>
      </div>
      <div className="stat">
        <div className="label"><Term k="rv20">RV20</Term></div>
        <div className="value">{pctOrDash(s.rv20)}</div>
        <div className="sub">{t("annualized, stored bars", "年化，基于已存储K线")}</div>
      </div>
      <div className="stat">
        <div className="label"><Term k="iv_rv_spread">{t("IV − RV spread", "IV − RV 差值")}</Term></div>
        <div className="value">{signedPctOrDash(s.iv_rv_spread)}</div>
        <div className="sub">
          {t("positive = options rich vs realized", "正值 = 期权隐含波动高于已实现波动")}
        </div>
      </div>
      <div className="stat" title={s.iv_rank_note}>
        <div className="label"><Term k="iv_rank">{t("IV rank", "IV 分位")}</Term></div>
        <div className="value">{s.iv_rank == null ? "—" : fmtPct(s.iv_rank)}</div>
        <div className="sub">{s.iv_rank_note}</div>
      </div>
      <div className="stat">
        <div className="label">
          <Term k="selector_direction">{t("Selector direction", "选择器方向")}</Term>
        </div>
        <div className="value">
          {data.direction_used == null ? (
            <span className="badge neutral">{el("NO_SIGNAL")}</span>
          ) : (
            <span className={`badge ${data.direction_used === "BULL" ? "bull" : "bear"}`}>
              {el(data.direction_used)}
            </span>
          )}
        </div>
        <div className="sub">
          {data.direction_used == null
            ? t("AUTO resolved to NEUTRAL — no candidate side", "AUTO 解析为中性 — 无候选方向")
            : t(
                "platform signal — drives candidate side, not market data",
                "平台信号 — 决定候选方向，不影响行情数据",
              )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- detail row */

function ContractDetail({ r }: { r: OptionContractRow }) {
  const t = useT();
  const components = r.score_components == null ? [] : Object.entries(r.score_components);
  return (
    <div style={{ padding: "4px 2px", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--text-dim)",
          marginBottom: 6,
        }}
      >
        {fmtExpiryShort(r.expiry)} {price2(r.strike)}
        {r.right} — {t("selection detail", "选择详情")}
      </div>

      {r.candidate_rank != null && (
        <p style={{ fontSize: 13, marginBottom: 6 }}>
          <span className="rank-badge">#{r.candidate_rank}</span>{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {t("recommended candidate", "推荐候选")}
            {r.score != null && <> · {t("score", "评分")} {r.score.toFixed(3)}</>}
          </span>
        </p>
      )}
      {r.candidate_rank == null && r.score != null && (
        <p style={{ fontSize: 13, marginBottom: 6, fontFamily: "var(--font-mono)" }}>
          {t(
            `score ${r.score.toFixed(3)} (not selected as a candidate)`,
            `评分 ${r.score.toFixed(3)}（未入选候选）`,
          )}
        </p>
      )}

      {components.length > 0 && (
        <div className="kv" style={{ marginBottom: r.fail_reasons.length > 0 ? 8 : 0 }}>
          {components.map(([k, v]) => (
            <div key={k}>
              <div className="k">{k}</div>
              <div className="v">{fmtComponentValue(v, t)}</div>
            </div>
          ))}
        </div>
      )}

      {!r.eligible && (
        <>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "var(--red)",
              margin: "4px 0 4px",
            }}
          >
            {t("Ineligible — fail reasons", "不合格 — 失败原因")}
          </div>
          {r.fail_reasons.length > 0 ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {r.fail_reasons.map((reason, i) => (
                <li key={i} style={{ color: "var(--red)", fontSize: 12, marginBottom: 2 }}>
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: 12, fontStyle: "italic" }}>
              {t("no reasons reported", "未报告失败原因")}
            </p>
          )}
        </>
      )}
      {r.eligible && r.candidate_rank == null && components.length === 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
          {t(
            "Passes all eligibility checks; not among the top-ranked candidates.",
            "通过全部合格性检查；但未进入排名靠前的候选。",
          )}
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- tab */

/** Standard T-chain layout (calls | strike | puts) — the professional
 *  convention (OMON/TWS-style): the CHAIN is neutral market data with no
 *  direction concept; the platform's selector opinion lives in its own
 *  labeled strip above. Used whenever a single expiry is selected. */
function TChainTable({
  rows,
  spot,
  candidateRight,
  expanded,
  toggleExpanded,
  rowTitle,
}: {
  rows: OptionContractRow[];
  spot: number;
  candidateRight: "C" | "P" | null;
  expanded: Set<string>;
  toggleExpanded: (key: string) => void;
  rowTitle: (r: OptionContractRow) => string;
}) {
  const t = useT();
  const byStrike = new Map<number, { C?: OptionContractRow; P?: OptionContractRow }>();
  for (const r of rows) {
    const entry = byStrike.get(r.strike) ?? {};
    entry[r.right] = r;
    byStrike.set(r.strike, entry);
  }
  const strikes = [...byStrike.keys()].sort((a, b) => a - b);

  const num = (v: number | null | undefined, digits = 2) =>
    v == null ? "—" : v.toFixed(digits);

  const sideCells = (r: OptionContractRow | undefined, side: "C" | "P") => {
    // Professional convention: the ITM half of each side is shaded — calls
    // ITM below spot, puts ITM above — so moneyness reads at a glance.
    const itm = side === "C" ? (r?.strike ?? 0) < spot : (r?.strike ?? 0) > spot;
    const stateClass =
      r == null
        ? ""
        : r.candidate_rank != null
          ? " tchain-candidate"
          : r.eligible
            ? " tchain-eligible"
            : "";
    const cells: { v: string; cls?: string }[] =
      side === "C"
        ? [
            { v: r?.open_interest?.toLocaleString() ?? "—" },
            { v: r?.volume?.toLocaleString() ?? "—" },
            { v: r?.iv == null ? "—" : fmtPct(r.iv) },
            { v: num(r?.delta ?? null, 3) },
            { v: price2(r?.bid), cls: "tchain-bid" },
            { v: price2(r?.mid) },
            { v: price2(r?.ask), cls: "tchain-ask" },
          ]
        : [
            { v: price2(r?.bid), cls: "tchain-bid" },
            { v: price2(r?.mid) },
            { v: price2(r?.ask), cls: "tchain-ask" },
            { v: num(r?.delta ?? null, 3) },
            { v: r?.iv == null ? "—" : fmtPct(r.iv) },
            { v: r?.volume?.toLocaleString() ?? "—" },
            { v: r?.open_interest?.toLocaleString() ?? "—" },
          ];
    return cells.map((c, i) => (
      <td
        key={`${side}${i}`}
        className={`num${itm && r != null ? " tchain-itm" : ""}${stateClass} ${c.cls ?? ""}`}
        style={{ whiteSpace: "nowrap", cursor: r ? "pointer" : undefined }}
        onClick={r ? () => toggleExpanded(contractKey(r)) : undefined}
        title={r ? rowTitle(r) : undefined}
      >
        {i === 0 && side === "C" && r?.candidate_rank != null && (
          <span className="rank-badge" style={{ marginRight: 4 }}>#{r.candidate_rank}</span>
        )}
        {c.v}
        {i === 6 && side === "P" && r?.candidate_rank != null && (
          <span className="rank-badge" style={{ marginLeft: 4 }}>#{r.candidate_rank}</span>
        )}
      </td>
    ));
  };

  const COLS_T = 15;
  // The spot divider sits between the last strike below and the first at/
  // above spot — the standard visual anchor of a professional chain.
  const spotDividerBefore = strikes.find((s) => s >= spot);
  return (
    <div className="table-scroll tchain">
      <table>
        <thead className="tchain-sticky">
          <tr>
            <th colSpan={7} className="tchain-sidehead" style={{ borderRight: "1px solid var(--border)" }}>
              {t("CALLS", "看涨")}
              {candidateRight === "C" ? t(" · selector side", " · 选择器侧") : ""}
            </th>
            <th className="tchain-sidehead"><Term k="strike">{t("STRIKE", "行权价")}</Term></th>
            <th colSpan={7} className="tchain-sidehead" style={{ borderLeft: "1px solid var(--border)" }}>
              {t("PUTS", "看跌")}
              {candidateRight === "P" ? t(" · selector side", " · 选择器侧") : ""}
            </th>
          </tr>
          <tr>
            {TCHAIN_CALL_COLS.map(([h, gk]) => (
              <th key={`c${h}`} className="num"><Term k={gk}>{h}</Term></th>
            ))}
            <th className="num" style={{ textAlign: "center" }}>·</th>
            {TCHAIN_PUT_COLS.map(([h, gk]) => (
              <th key={`p${h}`} className="num"><Term k={gk}>{h}</Term></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {strikes.map((strike) => {
            const pair = byStrike.get(strike)!;
            const detailRows = (["C", "P"] as const)
              .map((s) => pair[s])
              .filter(
                (r): r is OptionContractRow => r != null && expanded.has(contractKey(r)),
              );
            return (
              <Fragment key={strike}>
                {strike === spotDividerBefore && (
                  <tr className="tchain-spot-row" aria-label={`spot ${spot.toFixed(2)}`}>
                    <td colSpan={COLS_T}>
                      <span>SPOT ${spot.toFixed(2)}</span>
                    </td>
                  </tr>
                )}
                <tr className="tchain-row">
                  {sideCells(pair.C, "C")}
                  <td className="num tchain-strike">{strike.toFixed(2)}</td>
                  {sideCells(pair.P, "P")}
                </tr>
                {detailRows.map((r) => (
                  <tr key={`d-${contractKey(r)}`}>
                    <td colSpan={COLS_T} style={{ background: "var(--bg)" }}>
                      <ContractDetail r={r} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Strike-depth filter: moneyness window around spot ("all" = every strike,
 *  including deep ITM/OTM wings the §9 selector never shops). */
type StrikeDepth = "atm10" | "atm25" | "all";
const STRIKE_DEPTHS: { id: StrikeDepth; en: string; zh: string; pct: number | null }[] = [
  { id: "atm10", en: "±10%", zh: "±10%", pct: 0.10 },
  { id: "atm25", en: "±25%", zh: "±25%", pct: 0.25 },
  { id: "all", en: "All strikes", zh: "全部行权价", pct: null },
];

export default function OptionChainTable({ ticker }: { ticker: string }) {
  const t = useT();
  const el = useEnumLabel();
  const [direction, setDirection] = useState<OptionDirection>("AUTO");
  // null = no explicit choice yet → default to the nearest expiry.
  const [expiry, setExpiry] = useState<string | null>(null);
  const [view, setView] = useState<ChainView>("all");
  const [depth, setDepth] = useState<StrikeDepth>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const chain = useQuery({
    queryKey: ["options", ticker, direction],
    queryFn: () => api.watchlist.options(ticker, direction),
    enabled: ticker.length > 0,
    // Keep the previous chain on screen while a direction toggle refetches.
    placeholderData: keepPreviousData,
    retry: retryUnlessTerminal,
    // A full chain rebuild is the heaviest read in the app (provider
    // snapshot pages + OI merge). 60s beats the global 15s default: quotes
    // stream server-side, and the server also holds a short chain cache —
    // more frequent polling here only re-reads the same build.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  // §16 additive context for the error state below: when the probed
  // capabilities say the market-data subscription lacks option chains, a chain failure
  // gets that named as the likely cause — the backend's own error keeps
  // rendering verbatim and is never replaced by this note.
  const capabilities = useCapabilities();
  const optionChainNotInPlan = capabilities.data?.capabilities?.option_chain === false;

  if (chain.isPending) {
    return (
      <div className="panel">
        <p className="empty">
          {t(`Loading option chain for ${ticker}…`, `正在加载 ${ticker} 的期权链…`)}
        </p>
      </div>
    );
  }
  if (chain.isError) {
    // Every column here — quotes, greeks, IV — comes from the provider. With
    // none configured there is no chain, not an empty-looking one.
    if (isMarketDataNotConfigured(chain.error)) {
      return <NotConfigured message={notConfiguredMessage(chain.error)} />;
    }
    const notOnWatchlist = chain.error instanceof ApiError && chain.error.status === 404;
    return (
      <div className="panel">
        {notOnWatchlist ? (
          <>
            <p className="error">
              {chain.error.message ||
                t(`${ticker} is not on the Watchlist.`, `${ticker} 不在自选列表中。`)}
            </p>
            <p style={{ marginTop: 8, color: "var(--text-dim)" }}>
              {t(
                `Option chains exist only for Watchlist symbols. Add ${ticker} on the`,
                "期权链仅对自选列表内的标的可用。请在",
              )}{" "}
              <Link href="/research?tab=watchlist" style={{ color: "var(--accent)" }}>
                {t("Watchlist page", "自选列表页")}
              </Link>{" "}
              {t("to start research.", `添加 ${ticker} 以开始研究。`)}
            </p>
          </>
        ) : (
          <>
            <p className="error">
              {t(
                `Option chain unavailable: ${chain.error.message}`,
                `期权链不可用：${chain.error.message}`,
              )}
            </p>
            {optionChainNotInPlan && (
              <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8 }}>
                {t(
                  "The LIVE chain snapshot (quotes, greeks, IV, open interest) is not in the current market-data subscription (§16 capability probe). The end-of-day reference data the plan DOES include is shown below.",
                  "实时期权链快照（报价、希腊字母、IV、未平仓量）不在当前行情数据订阅范围内（§16 能力探测）。下方展示的是当前订阅确实包含的日终参考数据。",
                )}
              </p>
            )}
          </>
        )}
        {!notOnWatchlist && <OptionsEodView ticker={ticker} />}
      </div>
    );
  }

  const data = chain.data;

  // The stored expiry choice survives direction refetches; fall back to the
  // nearest expiry if it disappears from the response.
  const effectiveExpiry =
    expiry === ALL_EXPIRIES
      ? ALL_EXPIRIES
      : expiry != null && data.expiries.some((e) => e.expiry === expiry)
        ? expiry
        : (data.expiries[0]?.expiry ?? ALL_EXPIRIES);

  const depthPct = STRIKE_DEPTHS.find((d) => d.id === depth)?.pct ?? null;
  const inExpiry = data.chain.filter(
    (r) =>
      (effectiveExpiry === ALL_EXPIRIES || r.expiry === effectiveExpiry) &&
      (depthPct == null || Math.abs(r.strike - data.spot) <= data.spot * depthPct),
  );
  const counts = {
    all: inExpiry.length,
    eligible: inExpiry.filter((r) => r.eligible).length,
    candidates: inExpiry.filter((r) => r.candidate_rank != null).length,
  };
  // The direction's candidate side (§9): BULL shops calls, BEAR shops puts,
  // AUTO defers to the server-resolved signal (direction_used).
  const candidateRight =
    data.direction_used === "BULL" ? "C" : data.direction_used === "BEAR" ? "P" : null;
  // Why nothing qualifies: the two most common blockers among the shopped
  // side's rows in view (surfaced in the selector strip so an all-INELIG
  // chain explains itself).
  const blockerCounts = new Map<string, number>();
  for (const r of inExpiry) {
    if (candidateRight != null && r.right !== candidateRight) continue;
    for (const reason of r.fail_reasons) {
      if (reason.startsWith("wrong side")) continue;
      const label = reason.split(" outside")[0].split(" < ")[0].split(" > ")[0];
      blockerCounts.set(label, (blockerCounts.get(label) ?? 0) + 1);
    }
  }
  const topBlockers = [...blockerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label, n]) => `${label} (${n})`);
  const rows = inExpiry
    .filter((r) =>
      view === "eligible" ? r.eligible : view === "candidates" ? r.candidate_rank != null : true,
    )
    .sort(
      (a, b) =>
        a.expiry.localeCompare(b.expiry) || a.strike - b.strike || a.right.localeCompare(b.right),
    );

  const candidatesElsewhere =
    view === "candidates" &&
    rows.length === 0 &&
    data.chain.some((r) => r.candidate_rank != null);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rowTitle = (r: OptionContractRow): string => {
    if (r.candidate_rank != null) {
      return t(
        `Recommended candidate #${r.candidate_rank}${
          r.score != null ? ` · score ${r.score.toFixed(3)}` : ""
        } — click for score components`,
        `推荐候选 #${r.candidate_rank}${
          r.score != null ? ` · 评分 ${r.score.toFixed(3)}` : ""
        } — 点击查看评分构成`,
      );
    }
    if (!r.eligible && r.fail_reasons.length > 0) {
      return t(
        `Ineligible: ${r.fail_reasons.join("; ")} — click for detail`,
        `不合格：${r.fail_reasons.join("; ")} — 点击查看详情`,
      );
    }
    return t("Click for selection detail", "点击查看选择详情");
  };

  return (
    <>
      <SummaryStrip data={data} />

      {/* ---- SELECTOR (platform layer, §9/§25): the ONLY place direction
              exists. The chain below is neutral market data — professional
              T-layout, no direction concept. ---- */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <span className="provenance data-driven">{t("PLATFORM", "平台")}</span>{" "}
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              {t("CONTRACT SELECTOR — what-if side", "合约选择器 — 假设方向")}
            </span>
          </div>
          <span className="row" role="group" aria-label={t("Selector side", "选择器方向")}>
            {DIRECTIONS.map((d) => (
              <button
                key={d}
                className={direction === d ? "primary" : ""}
                aria-pressed={direction === d}
                onClick={() => setDirection(d)}
              >
                {d === "AUTO" && data.direction_used != null && direction === "AUTO"
                  ? `${el("AUTO")} · ${el(data.direction_used)}`
                  : el(d)}
              </button>
            ))}
            {chain.isFetching && (
              <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
                {t("refreshing…", "刷新中…")}
              </span>
            )}
          </span>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12, margin: "8px 0 0" }}>
          {candidateRight != null ? (
            <>
              {t("The §9 selector shops", "§9 选择器当前筛选")}{" "}
              <strong style={{ color: "var(--text)" }}>
                {candidateRight === "C" ? t("CALLS", "看涨期权") : t("PUTS", "看跌期权")}
              </strong>{" "}
              {t(
                `for the ${data.direction_used} view`,
                `（对应${el(data.direction_used)}信号）`,
              )}
              {direction === "AUTO" &&
                t(
                  " (AUTO = the platform's own signal — picking BULL here changes nothing when the signal already reads BULL; try BEAR to see the put side shopped)",
                  "（AUTO = 平台自身信号 — 当信号已读作多头时，此处再选多头不会有变化；可试试空头以查看看跌一侧的筛选）",
                )}
              {t(". Result:", "。结果：")}{" "}
              <strong style={{ color: "var(--text)" }}>
                {t(
                  `${counts.candidates} recommended / ${counts.eligible} eligible`,
                  `${counts.candidates} 个推荐 / ${counts.eligible} 个合格`,
                )}
              </strong>{" "}
              {t(
                `of ${counts.all} contracts in view`,
                `（当前视图共 ${counts.all} 个合约）`,
              )}
              {counts.eligible === 0 && topBlockers.length > 0 && (
                <>
                  {t(" — blocked mainly by: ", " — 主要受阻于：")}
                  {topBlockers.join("; ")}
                </>
              )}
              {t(".", "。")}
            </>
          ) : (
            <>
              {t(
                "AUTO resolved to NEUTRAL — no directional signal, so the selector shops neither side (NO TRADE is a valid output). The chain below is unaffected.",
                "AUTO 解析为中性 — 无方向信号，选择器两侧均不筛选（不交易也是有效输出）。下方期权链不受影响。",
              )}
            </>
          )}
        </p>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{t("Option chain", "期权链")}</h2>
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
            {t("neutral market data · calls | strike | puts", "中性行情数据 · 看涨 | 行权价 | 看跌")}
          </span>
        </div>

        <div
          className="row"
          style={{ flexWrap: "wrap", marginBottom: 8 }}
          role="group"
          aria-label={t("Expiry", "到期日")}
        >
          {data.expiries.map((e) => (
            <button
              key={e.expiry}
              className={effectiveExpiry === e.expiry ? "primary" : ""}
              aria-pressed={effectiveExpiry === e.expiry}
              onClick={() => setExpiry(e.expiry)}
            >
              {fmtExpiryShort(e.expiry)} · {e.dte}d
            </button>
          ))}
          <button
            className={effectiveExpiry === ALL_EXPIRIES ? "primary" : ""}
            aria-pressed={effectiveExpiry === ALL_EXPIRIES}
            onClick={() => setExpiry(ALL_EXPIRIES)}
          >
            {t("All expiries", "全部到期日")}
          </button>
        </div>

        <div
          className="row"
          style={{ flexWrap: "wrap", marginBottom: 8 }}
          role="group"
          aria-label={t("View", "视图")}
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={view === v.id ? "primary" : ""}
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {t(v.en, v.zh)} ({counts[v.id]})
            </button>
          ))}
        </div>

        <div
          className="row"
          style={{ flexWrap: "wrap", marginBottom: 12 }}
          role="group"
          aria-label={t("Strike depth", "行权价范围")}
        >
          <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("Strikes", "行权价")}</span>
          {STRIKE_DEPTHS.map((d) => (
            <button
              key={d.id}
              className={depth === d.id ? "primary" : ""}
              aria-pressed={depth === d.id}
              onClick={() => setDepth(d.id)}
              title={
                d.pct != null
                  ? t(
                      `Strikes within ±${d.pct * 100}% of spot ($${(data.spot * (1 - d.pct)).toFixed(2)}–$${(data.spot * (1 + d.pct)).toFixed(2)})`,
                      `行权价位于现货价 ±${d.pct * 100}% 范围内（$${(data.spot * (1 - d.pct)).toFixed(2)}–$${(data.spot * (1 + d.pct)).toFixed(2)}）`,
                    )
                  : t(
                      "Every strike the provider serves, including deep ITM/OTM wings",
                      "数据源提供的全部行权价，包括深度 ITM/OTM 两翼",
                    )
              }
            >
              {t(d.en, d.zh)}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="empty">
            {view === "candidates"
              ? candidatesElsewhere
                ? t(
                    "No recommended candidates in this expiry — try “All expiries”.",
                    "此到期日无推荐候选 — 试试“全部到期日”。",
                  )
                : data.direction_used == null
                  ? t(
                      "No recommended candidates — AUTO resolved to NEUTRAL (no candidate side). Force BULL or BEAR to see a candidate list.",
                      "无推荐候选 — AUTO 解析为中性（无候选方向）。强制选择多头或空头可查看候选列表。",
                    )
                  : t("No recommended candidates in this chain.", "此期权链中无推荐候选。")
              : view === "eligible"
                ? t(
                    "No contracts pass the eligibility checks in this expiry.",
                    "此到期日没有合约通过合格性检查。",
                  )
                : t("No contracts in this expiry.", "此到期日无合约。")}
          </p>
        ) : effectiveExpiry !== ALL_EXPIRIES && view === "all" ? (
          // Professional T-layout for one expiry: calls | strike | puts.
          // (Eligible/Candidate views keep the flat list — they are selector
          // outputs, usually a handful of single-side rows.)
          <TChainTable
            rows={rows}
            spot={data.spot}
            candidateRight={candidateRight}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            rowTitle={rowTitle}
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th aria-label={t("Candidate rank", "候选排名")}></th>
                  <th>{t("Expiration", "到期日")}</th>
                  <th className="num"><Term k="strike">{t("Strike", "行权价")}</Term></th>
                  <th>C/P</th>
                  <th className="num"><Term k="bid">Bid</Term></th>
                  <th className="num"><Term k="ask">Ask</Term></th>
                  <th className="num"><Term k="mid">Mid</Term></th>
                  <th className="num"><Term k="spread_pct">{t("Spread %", "点差 %")}</Term></th>
                  <th className="num"><Term k="last">{t("Last", "最新价")}</Term></th>
                  <th className="num"><Term k="volume">{t("Volume", "成交量")}</Term></th>
                  <th className="num"><Term k="open_interest">OI</Term></th>
                  <th className="num"><Term k="iv">IV</Term></th>
                  <th className="num"><Term k="delta">Delta</Term></th>
                  <th className="num"><Term k="gamma">Gamma</Term></th>
                  <th className="num"><Term k="theta">Theta</Term></th>
                  <th className="num"><Term k="vega">Vega</Term></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = contractKey(r);
                  const isCandidate = r.candidate_rank != null;
                  // The direction's visible effect: wrong-side rows dim —
                  // they stay listed (research data) but can never be
                  // eligible for the current direction.
                  const wrongSide =
                    candidateRight != null && r.right !== candidateRight;
                  return (
                    <Fragment key={key}>
                      <tr
                        className={`click-row${
                          isCandidate ? " opt-candidate" : r.eligible ? " opt-eligible" : ""
                        }`}
                        style={wrongSide ? { opacity: 0.5 } : undefined}
                        onClick={() => toggleExpanded(key)}
                        title={rowTitle(r)}
                      >
                        <td>
                          {isCandidate ? (
                            <span className="rank-badge">#{r.candidate_rank}</span>
                          ) : !r.eligible ? (
                            <span
                              className="badge dim"
                              title={r.fail_reasons.join("; ") || undefined}
                            >
                              {t("INELIG", "不合格")}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {r.expiry} <span style={{ color: "var(--text-dim)" }}>({r.dte}d)</span>
                        </td>
                        <td className="num">{price2(r.strike)}</td>
                        <td>
                          <span className={`badge ${r.right === "C" ? "bull" : "bear"}`}>
                            {r.right}
                          </span>
                        </td>
                        <td className="num">{price2(r.bid)}</td>
                        <td className="num">{price2(r.ask)}</td>
                        <td
                          className="num"
                          title={
                            r.price_basis === "day_close"
                              ? t(
                                  "Previous-session close (real traded price) — NBBO bid/ask are not in the current plan",
                                  "上一交易日收盘价（真实成交价）— 当前订阅不含 NBBO 买卖报价",
                                )
                              : undefined
                          }
                        >
                          {price2(r.mid)}
                          {r.price_basis === "day_close" && (
                            <span style={{ color: "var(--amber)", fontSize: 10 }}> EOD</span>
                          )}
                        </td>
                        <td className="num">
                          {r.spread_pct == null ? "—" : fmtPct(r.spread_pct)}
                        </td>
                        <td className="num">{price2(r.last)}</td>
                        <td className="num">{r.volume?.toLocaleString() ?? "—"}</td>
                        <td className="num">{r.open_interest?.toLocaleString() ?? "—"}</td>
                        <td
                          className="num"
                          title={
                            r.iv_unreliable
                              ? t(
                                  "Deep ITM/OTM: premium ≈ intrinsic value, so IV inversion is mathematically unreliable here (vendor value shown verbatim)",
                                  "深度 ITM/OTM：权利金 ≈ 内在价值，此处反推 IV 在数学上不可靠（供应商数值原样显示）",
                                )
                              : undefined
                          }
                          style={r.iv_unreliable ? { color: "var(--text-dim)" } : undefined}
                        >
                          {r.iv == null ? "—" : fmtPct(r.iv)}
                          {r.iv_unreliable && (
                            <span style={{ color: "var(--amber)" }}> ⚠</span>
                          )}
                        </td>
                        <td className="num">{r.delta?.toFixed(3) ?? "—"}</td>
                        <td className="num">{r.gamma?.toFixed(3) ?? "—"}</td>
                        <td className="num">{r.theta?.toFixed(3) ?? "—"}</td>
                        <td className="num">{r.vega?.toFixed(3) ?? "—"}</td>
                      </tr>
                      {expanded.has(key) && (
                        <tr>
                          <td colSpan={COLS} style={{ background: "var(--bg)" }}>
                            <ContractDetail r={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="datasource" style={{ marginTop: 12, marginBottom: 4 }}>
          {t(
            `source: ${data.source} · snapshot date ${data.as_of} (US trading day)`,
            `数据源：${data.source} · 快照日期 ${data.as_of}（美国交易日）`,
          )}
        </p>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 0 }}>
          {t(
            "Research only — this tab has no order or trade actions; contract execution arrives with the options strategy phase.",
            "仅供研究 — 本页无下单或交易操作；合约执行功能将随期权策略阶段推出。",
          )}
        </p>
      </div>
    </>
  );
}
