"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import NotConfigured, { NotConfiguredNote } from "@/components/shared/NotConfigured";
import TradingStatusBanner from "@/components/shared/TradingStatusBanner";
import { useToast } from "@/components/shared/Toast";
import { api, isMarketDataNotConfigured, notConfiguredMessage, retryUnlessTerminal } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useEnumLabel } from "@/lib/i18n-labels";
import {
  ALERT_SEVERITY_BADGE,
  HEAT_BADGE,
  INSTRUMENT_BADGE,
  INSTRUMENT_SHORT,
  OPPORTUNITY_BADGE,
  fmtPct,
  fmtUsd,
} from "@/lib/risk-format";
import type { WatchlistOverviewItem } from "@/lib/types";
import FlowNav from "@/components/shared/FlowNav";
import EdgeBars from "@/components/dashboard/EdgeBars";
import UpcomingEvents from "@/components/dashboard/UpcomingEvents";
import { topOpportunities } from "@/lib/opportunity";

function edgeColor(v: number): string {
  if (v > 0) return "var(--green)";
  if (v < 0) return "var(--red)";
  return "var(--text-dim)";
}

export default function Dashboard() {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  const el = useEnumLabel();
  const [error, setError] = useState("");

  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list });
  const pool = useQuery({ queryKey: ["trading-pool"], queryFn: api.tradingPool.list });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit.list() });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => api.alerts.list(50) });
  const status = useQuery({ queryKey: ["trading-status"], queryFn: api.trading.status });
  const overview = useQuery({
    queryKey: ["market-overview"],
    queryFn: api.market.overview,
    retry: retryUnlessTerminal,
  });
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: api.portfolio.risk });
  const positions = useQuery({
    queryKey: ["positions", "OPEN"],
    queryFn: () => api.positions.list("OPEN"),
  });
  const wlOverview = useQuery({
    queryKey: ["watchlist-overview"],
    queryFn: api.watchlist.overview,
  });

  const invalidateStatus = () => {
    qc.invalidateQueries({ queryKey: ["trading-status"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const pause = useMutation({
    mutationFn: (reason: string) => api.trading.pause(reason),
    onSuccess: () => {
      setError("");
      setPausing(false);
      toast(
        "CRITICAL",
        t(
          "ALL TRADING PAUSED — the global kill switch is engaged",
          "已暂停全部交易 — 全局紧急停止开关已启用",
        ),
      );
      invalidateStatus();
    },
    onError: (e: Error) => setError(e.message),
  });

  const resume = useMutation({
    mutationFn: () => api.trading.resume(),
    onSuccess: () => {
      setError("");
      setResuming(false);
      toast(
        "WARNING",
        t(
          "Trading resumed — enabled Trading Pool symbols may generate orders",
          "交易已恢复 — 已启用的交易池标的可能生成订单",
        ),
      );
      invalidateStatus();
    },
    onError: (e: Error) => setError(e.message),
  });

  // the configured market-data provider is the only price source: a 503 from the market endpoint means the
  // provider is unset, and every market-derived figure on this page becomes an
  // explicit not-configured state rather than a number.
  const marketUnconfigured = isMarketDataNotConfigured(overview.error);
  const marketMessage = notConfiguredMessage(overview.error);
  // The risk endpoint is not a 503 — it reports the same state inline.
  const riskMarketData = risk.data?.market_data;

  // Safety: only an explicit backend "enabled" renders green. Loading, error, or
  // unknown status is always presented as PAUSED — never ambiguous.
  const statusKnown = status.data !== undefined;
  const tradingEnabled = status.data?.trading_enabled === true;
  const enabledCount = pool.data?.filter((p) => p.trading_enabled).length ?? 0;

  // §27/§28: application-styled dialogs, never browser-native popups.
  const [pausing, setPausing] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [resuming, setResuming] = useState(false);

  const onPauseAll = () => {
    setPauseReason("");
    setPausing(true);
  };

  const onResume = () => setResuming(true);

  return (
    <>
      {pausing && (
        <ConfirmDialog
          title={t("Pause all trading", "暂停全部交易")}
          confirmLabel={t("Pause All Trading", "暂停全部交易")}
          destructive
          loading={pause.isPending}
          disabled={!pauseReason.trim()}
          onCancel={() => setPausing(false)}
          onConfirm={() => pause.mutate(pauseReason.trim())}
        >
          <p>
            {t(
              "Engages the global kill switch (§18): no new orders will be placed for any symbol until trading is explicitly resumed. Closing positions stays allowed — closing reduces risk.",
              "启用全局紧急停止开关（§18）：在明确恢复交易之前，任何标的都不会下达新订单。平仓操作仍被允许 — 平仓可降低风险。",
            )}
          </p>
          <label style={{ display: "block", marginTop: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              {t("Reason (required, recorded in the audit trail)", "原因（必填，将记录到审计日志）")}
            </span>
            <input
              autoFocus
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
              aria-label={t("Pause reason (required)", "暂停原因（必填）")}
            />
          </label>
        </ConfirmDialog>
      )}
      {resuming && (
        <ConfirmDialog
          title={t("Resume trading", "恢复交易")}
          confirmLabel={t("Resume Trading", "恢复交易")}
          loading={resume.isPending}
          onCancel={() => setResuming(false)}
          onConfirm={() => resume.mutate()}
        >
          <p>
            {t(
              "Mechanical signals may then generate orders for enabled Trading Pool symbols — every order still passes the full execution gate chain and risk approval first.",
              "恢复后，机械信号可为交易池中已启用的标的生成订单 — 每笔订单仍须先通过完整的执行闸门链与风控审批。",
            )}
          </p>
        </ConfirmDialog>
      )}
      <h1>{t("Dashboard", "总览")}</h1>
      <p className="subtitle">
        {t(
          "Market regime, portfolio state, and active risk at a glance",
          "市场状态、组合概况与当前风险一览",
        )}
      </p>
      <FlowNav />

      <TradingStatusBanner
        statusKnown={statusKnown}
        globalEnabled={tradingEnabled}
        pausedReason={status.data?.reason}
        poolKnown={pool.data !== undefined}
        enabledCount={enabledCount}
        poolSize={pool.data?.length ?? 0}
        action={
          tradingEnabled ? (
            <button className="danger" onClick={onPauseAll} disabled={pause.isPending}>
              {t("PAUSE ALL TRADING", "暂停全部交易")}
            </button>
          ) : statusKnown ? (
            <button onClick={onResume} disabled={resume.isPending}>
              {t("Resume", "恢复")}
            </button>
          ) : null
        }
      />

      {!tradingEnabled && statusKnown && status.data!.updated_by ? (
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
          {status.data!.updated_at
            ? t(
                `Paused by ${status.data!.updated_by} at ${new Date(
                  status.data!.updated_at,
                ).toLocaleString()}.`,
                `由 ${status.data!.updated_by} 于 ${new Date(
                  status.data!.updated_at,
                ).toLocaleString()} 暂停。`,
              )
            : t(
                `Paused by ${status.data!.updated_by}.`,
                `由 ${status.data!.updated_by} 暂停。`,
              )}
        </p>
      ) : null}

      {error && (
        <div className="panel">
          <p className="error">{error}</p>
        </div>
      )}

      {/* Market data is unconfigured: say so once, prominently, above every
          market-derived surface on the page rather than per tile. */}
      {marketUnconfigured && <NotConfigured message={marketMessage} />}

      <UpcomingEvents />

      <div className="statbar">
        <div className="stat">
          <div className="label">{t("Market Regime", "市场状态")}</div>
          {/* The regime is classified FROM market data — never guessed. */}
          <div className="value">
            {marketUnconfigured
              ? "—"
              : overview.data?.market_regime != null
                ? el(overview.data.market_regime)
                : overview.isError
                  ? "—"
                  : "…"}
          </div>
          {marketUnconfigured && (
            <div className="sub">{t("market data not configured", "行情数据未配置")}</div>
          )}
        </div>
        <div className="stat">
          <div className="label">{t("Portfolio NAV", "组合净值")}</div>
          <div className="value">
            {risk.data?.nav != null ? fmtUsd(risk.data.nav) : "—"}
          </div>
          {risk.data != null && risk.data.nav == null && (
            <div className="sub">{t("broker not connected", "券商未连接")}</div>
          )}
        </div>
        <div className="stat">
          <div className="label">{t("Cash", "现金")}</div>
          <div className="value">
            {risk.data?.cash != null ? fmtUsd(risk.data.cash) : "—"}
          </div>
          {risk.data?.cash_pct != null && (
            <div className="sub">
              {t(`${fmtPct(risk.data.cash_pct)} of NAV`, `占净值 ${fmtPct(risk.data.cash_pct)}`)}
            </div>
          )}
          {risk.data != null && risk.data.cash == null && (
            <div className="sub">{t("broker not connected", "券商未连接")}</div>
          )}
        </div>
        <div className="stat">
          <div className="label">{t("Portfolio Heat", "组合热度")}</div>
          <div className="value">
            {risk.data?.portfolio_heat_pct != null
              ? fmtPct(risk.data.portfolio_heat_pct)
              : "—"}{" "}
            {risk.data?.heat_state != null && (
              <span className={`badge ${HEAT_BADGE[risk.data.heat_state]}`}>
                {el(risk.data.heat_state)}
              </span>
            )}
          </div>
          {risk.data != null && risk.data.portfolio_heat_pct == null && (
            <div className="sub">{t("broker not connected", "券商未连接")}</div>
          )}
        </div>
        <div className="stat">
          <div className="label">{t("Watchlist", "自选列表")}</div>
          <div className="value">{watchlist.data?.length ?? "…"}</div>
        </div>
        <div className="stat">
          <div className="label">{t("Trading Pool", "交易池")}</div>
          <div className="value">{pool.data?.length ?? "…"}</div>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{t("Indices", "指数")}</h2>
          {overview.data && (
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
              {overview.data.stale && (
                <span className="badge stale">{t("STALE", "滞后")}</span>
              )}{" "}
              {t(
                `source: ${overview.data.provider} · as of ${new Date(
                  overview.data.as_of,
                ).toLocaleTimeString()}`,
                `来源：${overview.data.provider} · 截至 ${new Date(
                  overview.data.as_of,
                ).toLocaleTimeString()}`,
              )}
            </span>
          )}
        </div>
        {marketUnconfigured ? (
          <NotConfigured message={marketMessage} />
        ) : overview.data ? (
          overview.data.indices.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Symbol", "代码")}</th>
                    <th>{t("Price", "价格")}</th>
                    <th>{t("Change", "涨跌幅")}</th>
                    <th>{t("As of", "更新时间")}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.data.indices.map((q) => (
                    <tr key={q.symbol}>
                      <td className="ticker">{q.symbol}</td>
                      <td>{q.price.toFixed(2)}</td>
                      <td style={{ color: q.change_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                        {q.change_pct >= 0 ? "+" : ""}
                        {q.change_pct.toFixed(2)}%
                      </td>
                      <td>{new Date(q.ts).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">{t("No index quotes returned.", "未返回指数行情。")}</p>
          )
        ) : (
          <p className="empty">
            {overview.isError
              ? t("Market overview unavailable.", "市场概览不可用。")
              : t("Loading market overview…", "正在加载市场概览…")}
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{t("Active Positions", "当前持仓")}</h2>
          <Link href="/trading?tab=positions" style={{ color: "var(--accent)", fontSize: 12 }}>
            {t("All positions →", "全部持仓 →")}
          </Link>
        </div>
        {positions.data ? (
          positions.data.length > 0 ? (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Ticker", "代码")}</th>
                      <th className="num">{t("Qty", "数量")}</th>
                      <th className="num">{t("Unrealized P&L", "未实现盈亏")}</th>
                      <th>{t("Exit status", "离场状态")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.data.map((p) => (
                      <tr key={p.id}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <Link href="/trading?tab=positions" className="ticker">
                            {p.ticker}
                          </Link>{" "}
                          {/* Compact instrument badge; older backends may omit the field. */}
                          <span
                            className={`badge ${INSTRUMENT_BADGE[p.instrument ?? "LONG_STOCK"] ?? "dim"}`}
                          >
                            {INSTRUMENT_SHORT[p.instrument ?? "LONG_STOCK"] ?? p.instrument}
                          </span>
                        </td>
                        <td className="num">{p.quantity.toLocaleString()}</td>
                        <td className="num">
                          {p.unrealized_pnl == null ? (
                            <span style={{ color: "var(--text-dim)" }}>—</span>
                          ) : (
                            <span
                              style={{
                                color: p.unrealized_pnl >= 0 ? "var(--green)" : "var(--red)",
                              }}
                            >
                              {p.unrealized_pnl >= 0 ? "+" : ""}
                              {fmtUsd(p.unrealized_pnl, 2)}
                              {p.unrealized_pnl_pct != null && (
                                <span style={{ fontSize: 11 }}>
                                  {" "}
                                  ({p.unrealized_pnl >= 0 ? "+" : ""}
                                  {fmtPct(p.unrealized_pnl_pct)})
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td>
                          {p.exit_status == null ? (
                            <span style={{ color: "var(--text-dim)" }}>—</span>
                          ) : (
                            <span
                              className={`badge ${p.exit_status === "EXIT_SIGNALED" ? "red" : "dim"}`}
                            >
                              {p.exit_status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(marketUnconfigured || riskMarketData?.configured === false) && (
                <NotConfiguredNote
                  message={riskMarketData?.message ?? marketMessage}
                />
              )}
            </>
          ) : (
            <p className="empty">{t("No open positions.", "暂无持仓。")}</p>
          )
        ) : positions.isError && isMarketDataNotConfigured(positions.error) ? (
          // Defensive: GET /api/positions is specified NOT to 503 (positions are
          // real DB rows). If a backend ever does, still never show numbers.
          <NotConfigured message={notConfiguredMessage(positions.error)} />
        ) : (
          <p className="empty">
            {positions.isError
              ? t("Positions unavailable.", "持仓数据不可用。")
              : t("Loading positions…", "正在加载持仓…")}
          </p>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{t("Top Watchlist Opportunities", "自选重点机会")}</h2>
          <Link href="/research?tab=watchlist" style={{ color: "var(--accent)", fontSize: 12 }}>
            {t("Full watchlist →", "完整自选列表 →")}
          </Link>
        </div>
        {wlOverview.data && wlOverview.data.length > 0 && (
          <EdgeBars rows={wlOverview.data} />
        )}
        {wlOverview.data ? (
          wlOverview.data.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("Ticker", "代码")}</th>
                    <th className="num">{t("Price", "价格")}</th>
                    <th>{t("Regime", "市场状态")}</th>
                    <th className="num">{t("Edge", "优势")}</th>
                    <th>{t("Bias", "倾向")}</th>
                    <th>{t("Opportunity", "机会")}</th>
                  </tr>
                </thead>
                <tbody>
                  {topOpportunities(wlOverview.data, 6).map((o) => (
                    <tr key={o.ticker}>
                      <td>
                        <Link
                          href={`/watchlist/${encodeURIComponent(o.ticker)}`}
                          className="ticker"
                        >
                          {o.ticker}
                        </Link>
                      </td>
                      <td className="num">
                        {o.price != null ? (
                          `$${o.price.toFixed(2)}`
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {o.regime != null ? (
                          el(o.regime)
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td className="num">
                        {o.directional_edge != null ? (
                          <span style={{ color: edgeColor(o.directional_edge) }}>
                            {o.directional_edge > 0 ? "+" : ""}
                            {o.directional_edge.toFixed(1)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {o.bias ? (
                          <span className={`badge ${o.bias.toLowerCase()}`}>{el(o.bias)}</span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {o.opportunity_status ? (
                          <span
                            className={`badge ${OPPORTUNITY_BADGE[o.opportunity_status] ?? "dim"}`}
                          >
                            {el(o.opportunity_status)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {marketUnconfigured && (
                <NotConfiguredNote message={marketMessage} />
              )}
            </div>
          ) : (
            <p className="empty">
              {t("Watchlist is empty —", "自选列表为空 —")}{" "}
              <Link href="/research?tab=watchlist" style={{ color: "var(--accent)" }}>
                {t("add symbols on the Watchlist page", "前往自选页面添加标的")}
              </Link>{" "}
              {t("to begin the data lifecycle.", "即可启动数据生命周期。")}
            </p>
          )
        ) : (
          <p className="empty">
            {wlOverview.isError
              ? t("Watchlist overview unavailable.", "自选概览不可用。")
              : t("Loading watchlist opportunities…", "正在加载自选机会…")}
          </p>
        )}
      </div>

      {/* §29 — alerts are visually obvious, never buried: the panel always
          renders, even (especially) when it is empty or the feed is down. */}
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{t("Alerts", "警报")}</h2>
          <Link href="/oversight?tab=activity" style={{ color: "var(--accent)", fontSize: 12 }}>
            {t("View all activity →", "查看全部活动 →")}
          </Link>
        </div>
        {alerts.data ? (
          alerts.data.length > 0 ? (
            <div className="table-scroll">
              <table>
                <tbody>
                  {alerts.data.slice(0, 8).map((a) => (
                    <tr key={a.id}>
                      <td
                        style={{
                          whiteSpace: "nowrap",
                          // Subtle left accent so CRITICAL rows read at a glance.
                          borderLeft:
                            a.severity === "CRITICAL" ? "3px solid var(--red)" : undefined,
                        }}
                      >
                        <span className={`badge ${ALERT_SEVERITY_BADGE[a.severity]}`}>
                          {a.severity}
                        </span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {new Date(a.ts).toLocaleString()}
                      </td>
                      <td>{a.title}</td>
                      <td>
                        {a.ticker !== "" && (
                          <Link
                            href={`/watchlist/${encodeURIComponent(a.ticker)}`}
                            className="ticker"
                          >
                            {a.ticker}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">{t("No alerts.", "暂无警报。")}</p>
          )
        ) : (
          <p className="empty">
            {alerts.isError
              ? t("Alerts unavailable.", "警报数据不可用。")
              : t("Loading alerts…", "正在加载警报…")}
          </p>
        )}
      </div>

      <div className="panel">
        <h2>{t("Recent Activity", "近期活动")}</h2>
        {audit.data && audit.data.length > 0 ? (
          <div className="table-scroll">
            <table>
              <tbody>
                {audit.data.slice(0, 8).map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleTimeString()}</td>
                    <td>
                      <span className={`badge ${e.actor_type.toLowerCase()}`}>{e.actor_type}</span>
                    </td>
                    <td>{e.action}</td>
                    <td className="ticker">{e.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">{t("No activity yet.", "暂无活动记录。")}</p>
        )}
      </div>
    </>
  );
}
