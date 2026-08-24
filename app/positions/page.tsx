"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import NotConfigured, { NotConfiguredNote } from "@/components/shared/NotConfigured";
import Term from "@/components/shared/Term";
import { useToast } from "@/components/shared/Toast";
import {
  api,
  isBrokerNotConfigured,
  isMarketDataNotConfigured,
  notConfiguredMessage,
  retryUnlessTerminal,
} from "@/lib/api";
import { useT } from "@/lib/i18n";
import {
  INSTRUMENT_BADGE,
  fmtPct,
  fmtStrike,
  fmtUsd,
  occOptionSymbol,
} from "@/lib/risk-format";
import type {
  BrokerReconcile,
  BrokerStatus,
  CheckExitsResult,
  PaperOrder,
  PositionRow,
} from "@/lib/types";
import FlowNav from "@/components/shared/FlowNav";

/* ---------------------------------------------------------------- formatting */

/**
 * The single stand-in for a value the system does not have. Every
 * market-derived cell on this page uses it — nothing here ever falls back to
 * the entry price, zero, or any other placeholder number.
 */
const DASH = <span style={{ color: "var(--text-dim)" }}>—</span>;

/** True when a row carries no market-derived figures at all. */
function hasNoMarketData(p: PositionRow): boolean {
  return p.current_price == null && p.market_value == null && p.unrealized_pnl == null;
}

function usd(v: number | null, digits = 2): ReactNode {
  return v == null ? DASH : fmtUsd(v, digits);
}

function signedUsd(v: number, digits = 2): string {
  return `${v > 0 ? "+" : ""}${fmtUsd(v, digits)}`;
}

function PnlCell({ pnl, pct }: { pnl: number | null; pct: number | null }) {
  if (pnl == null) return DASH;
  const color = pnl >= 0 ? "var(--green)" : "var(--red)";
  return (
    <span style={{ color, whiteSpace: "nowrap" }}>
      {signedUsd(pnl)}
      {/* *_pct fields arrive as fractions (0.04 = 4%), same convention as the
          portfolio-risk API — fmtPct scales by 100. */}
      {pct != null && <span style={{ fontSize: 11 }}> ({pnl >= 0 ? "+" : ""}{fmtPct(pct)})</span>}
    </span>
  );
}

function InstrumentBadge({ p }: { p: PositionRow }) {
  // Older backend responses may omit `instrument` — fall back to LONG_STOCK
  // (the only instrument that existed before the §8 matrix shipped).
  const instrument = p.instrument ?? "LONG_STOCK";
  return (
    <span className={`badge ${INSTRUMENT_BADGE[instrument] ?? "dim"}`}>{instrument}</span>
  );
}

/**
 * For option rows: the contract line shown under the ticker
 * (right / expiry / strike / remaining DTE) plus the premium P&L chip
 * (current_mid / entry_premium − 1). Renders nothing for stock rows.
 */
function ContractLine({ p }: { p: PositionRow }) {
  const t = useT();
  const c = p.contract;
  if (c == null) return null;
  const pct = c.premium_pnl_pct;
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text-dim)",
        marginTop: 2,
        whiteSpace: "nowrap",
      }}
    >
      {c.right} {c.expiry} {fmtStrike(c.strike)}
      {c.dte != null && <> · {c.dte} DTE</>}
      {pct != null && (
        <span
          className="chip"
          title={t(
            "premium P&L: current_mid / entry_premium − 1",
            "权利金 P&L：current_mid / entry_premium − 1",
          )}
          style={{ marginLeft: 6, color: pct >= 0 ? "var(--green)" : "var(--red)" }}
        >
          {pct >= 0 ? "+" : ""}
          {fmtPct(pct)}
        </span>
      )}
    </div>
  );
}

/**
 * Phase D (spec §52 "stock vs option risk display") — the risk facts that
 * belong to an OPTION and have no meaning for a share: premium at risk,
 * DTE, the baseline IV the stress reprice anchored on, and this position's
 * own P&L in the worst catalogue scenario.
 *
 * Renders NOTHING on a stock row and nothing on a backend that predates
 * Phase D (all four fields absent) — §52's rule is that the two instruments
 * are not presented as identical, which cuts both ways: a share must not
 * grow four empty option cells either.
 *
 * Honest nulls: a missing value is an em dash with the gap NAMED, never a 0.
 * A premium at risk of 0 and "no chain quote" are different facts.
 */
function OptionRiskFacts({ p }: { p: PositionRow }) {
  const t = useT();
  const isOption = (p.instrument ?? "LONG_STOCK") !== "LONG_STOCK" || p.contract != null;
  const hasAny =
    p.premium_at_risk != null ||
    p.dte != null ||
    p.iv0 != null ||
    p.worst_scenario_pnl != null;
  if (!isOption || !hasAny) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--text-dim)",
          marginBottom: 6,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {t("Option risk (§52)", "期权风险（§52）")}
      </div>
      <div className="kv">
        <div>
          {/* No glossary entry for this one — Term would render the label
              unchanged anyway, and pointing at a missing key hides the gap. */}
          <div className="k">{t("Premium at risk", "在险权利金")}</div>
          <div className="v" style={{ color: "var(--red)" }}>
            {p.premium_at_risk == null ? (
              DASH
            ) : (
              fmtUsd(p.premium_at_risk)
            )}
          </div>
        </div>
        <div>
          <div className="k">{t("DTE", "剩余天数")}</div>
          <div className="v">{p.dte == null ? DASH : p.dte}</div>
        </div>
        <div>
          <div className="k">
            <Term k="iv">{t("IV (baseline)", "IV（基准）")}</Term>
          </div>
          <div className="v">
            {p.iv0 == null ? DASH : fmtPct(p.iv0)}
            {/* Provenance rule (data_source §12): this is the market data
                provider's IV, passed through unchanged — it is NOT solved
                internally, and the label says which it is rather than
                leaving the user to assume. */}
            {p.iv0 != null && (
              <span style={{ color: "var(--text-dim)", fontSize: 11, marginLeft: 6 }}>
                {t("provider", "行情商")}
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="k">
            <Term k="stress_test">{t("Worst scenario P&L", "最差情景盈亏")}</Term>
          </div>
          <div
            className="v"
            style={{
              color:
                p.worst_scenario_pnl == null || p.worst_scenario_pnl === 0
                  ? undefined
                  : p.worst_scenario_pnl < 0
                    ? "var(--red)"
                    : "var(--green)",
            }}
          >
            {/* Server sign: a LOSS is NEGATIVE (it is a P&L, not a
                VaR-style positive loss) — never negated here. */}
            {p.worst_scenario_pnl == null ? DASH : signedUsd(p.worst_scenario_pnl)}
            {/* Scenario name, verbatim — without it the number is anonymous. */}
            {p.worst_scenario_pnl != null && p.worst_scenario_name && (
              <div style={{ color: "var(--text-dim)", fontSize: 11 }}>
                {p.worst_scenario_name}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* A null here is a real gap, not a zero: say so once, below the grid. */}
      {p.worst_scenario_pnl == null && (
        <p style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 6, marginBottom: 0 }}>
          {t(
            "No worst-scenario P&L — no stress snapshot has been built yet, or this position had no priceable stress leg. It is not zero; it is not measured.",
            "无最差情景盈亏 — 尚未构建压力快照，或该持仓没有可定价的压力测试腿。这不是 0，而是未被测量。",
          )}
        </p>
      )}
      <p style={{ color: "var(--text-dim)", fontSize: 11, marginTop: 6, marginBottom: 0 }}>
        {t(
          "SHADOW — the stress layer is computed and displayed; it decides nothing.",
          "影子模式 — 压力测试层仅计算与展示，不参与任何决策。",
        )}
      </p>
    </div>
  );
}

function ExitBadge({ p }: { p: PositionRow }) {
  if (p.exit_status == null) return DASH;
  const signaled = p.exit_status === "EXIT_SIGNALED";
  return (
    <span
      className={`badge ${signaled ? "red" : "dim"}`}
      title={p.exit_reasons.length > 0 ? p.exit_reasons.join("\n") : undefined}
    >
      {p.exit_status}
    </span>
  );
}

function EdgeCell({ p }: { p: PositionRow }) {
  const t = useT();
  // signal_decay = entry_edge - current_edge; the chip shows the edge CHANGE
  // (current - entry), so a weakening signal reads as a negative red delta.
  const change = p.signal_decay == null ? null : -p.signal_decay;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {p.entry_edge.toFixed(1)} → {p.current_edge == null ? "—" : p.current_edge.toFixed(1)}{" "}
      {change != null && (
        <span
          className="chip"
          title={t(
            `signal decay (entry edge − current edge): ${p.signal_decay!.toFixed(1)}`,
            `信号衰减（入场 edge − 当前 edge）：${p.signal_decay!.toFixed(1)}`,
          )}
          style={{
            color:
              change < 0 ? "var(--red)" : change > 0 ? "var(--green)" : "var(--text-dim)",
          }}
        >
          Δ{change > 0 ? "+" : ""}
          {change.toFixed(1)}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- broker status */

/**
 * Broker state, shown beside the auto-exit-monitor line so the two things that
 * can act on a position without the user — the sweep and the broker — are read
 * in one glance.
 *
 * Configured: the broker's OWN figures (cash / equity), never local ones, plus
 * the PAPER badge. Execution is paper-only by construction — the adapter
 * hard-refuses any non-paper base URL — so a mode other than "paper" is an
 * inconsistency worth showing loudly rather than rendering as normal.
 *
 * Unconfigured: an amber line stating that NO orders can be placed. This is not
 * a degraded mode where the internal simulator quietly takes over; nothing is
 * sent anywhere.
 */
function BrokerStatusLine({ status }: { status: BrokerStatus }) {
  const t = useT();
  if (!status.configured) {
    return (
      <p
        style={{
          color: "var(--amber)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        {t(
          "Broker not configured — no orders can be placed",
          "券商未配置 — 无法下达任何订单",
        )}
        {status.error != null && status.error.trim() !== "" && <> · {status.error}</>}
      </p>
    );
  }
  const a = status.account;
  const paperOnly = status.mode === "paper";
  return (
    <p className="datasource" style={{ marginBottom: 8 }}>
      {status.provider || t("Broker", "券商")} {status.mode ?? t("mode unknown", "模式未知")}{" "}
      <span className={`badge ${paperOnly ? "green" : "red"}`}>
        {paperOnly ? t("PAPER", "模拟盘") : t("MODE UNKNOWN", "模式未知")}
      </span>
      {a != null ? (
        <>
          {" "}
          · {t("cash", "现金")} {fmtUsd(a.cash)} · {t("equity", "权益")} {fmtUsd(a.equity)}
        </>
      ) : (
        <>
          {" "}
          ·{" "}
          {t(
            "account unavailable — no cash or equity figure is shown",
            "账户不可用 — 不显示现金或权益数据",
          )}
        </>
      )}
      {!paperOnly && (
        <span style={{ color: "var(--red)" }}>
          {" "}
          ·{" "}
          {t(
            "the broker did not report paper mode — do not place orders",
            "券商未报告为模拟盘模式 — 请勿下单",
          )}
        </span>
      )}
      {status.error != null && status.error.trim() !== "" && (
        <span style={{ color: "var(--amber)" }}> · {status.error}</span>
      )}
    </p>
  );
}

/* ---------------------------------------------------------------- reconciliation (§26) */

/**
 * §26 reconciliation status for one open position, derived from the SINGLE
 * page-level reconcile response plus the SINGLE open-orders response (never
 * fetched per row):
 *
 *   MISMATCH       — the position appears in mismatches[] (matched by ticker,
 *                    or by OCC symbol for option rows, since the broker
 *                    reports option positions under their OCC symbol);
 *   PENDING_UPDATE — a NON-terminal order (PENDING_SUBMIT / ACCEPTED /
 *                    PARTIALLY_FILLED) is addressed at this position: its
 *                    position_id matches, or it has no position_id yet (a BUY
 *                    before its first fill lands) and names the same ticker.
 *                    The local view is honestly mid-change until the
 *                    order-sync sweep settles the order against the broker;
 *   MATCHED        — a successful reconcile did not list it and nothing is
 *                    in flight.
 *
 * Precedence (§26 "Mismatch must be prominent"): MISMATCH wins over
 * everything — a live divergence stays red even while an order is working —
 * and PENDING_UPDATE wins over MATCHED, because "agreement" measured
 * mid-flight is a snapshot of a moving target, not a settled fact.
 *
 * PENDING_UPDATE derives from LOCAL order rows, so it renders even when the
 * reconcile response is unavailable. Otherwise returns null (rendered "—")
 * when the broker is unconfigured or the reconcile response is unavailable —
 * no status is invented.
 */
function reconcileStatusFor(
  p: PositionRow,
  data: BrokerReconcile | undefined,
  openOrders: PaperOrder[] | undefined,
  t: (en: string, zh: string) => string,
): { status: "MATCHED" | "MISMATCH" | "PENDING_UPDATE"; detail: string } | null {
  // Prefer the server-built OCC symbol. The display-side construction is a
  // fallback ONLY when the field is ABSENT (older payload) — a server-sent
  // null means the server could NOT build one, and reconstructing it here
  // from the same raw fields would be guessing an unvalidated symbol.
  const occ =
    p.contract == null
      ? null
      : p.contract.option_symbol === undefined
        ? occOptionSymbol(p.ticker, p.contract)
        : p.contract.option_symbol;
  if (data != null && data.configured) {
    const hits = data.mismatches.filter(
      (m) => m.symbol === p.ticker || (occ != null && m.symbol === occ),
    );
    if (hits.length > 0) {
      return {
        status: "MISMATCH",
        detail: hits.map((m) => `${m.kind}: ${m.detail}`).join("\n"),
      };
    }
  }
  const inFlight = (openOrders ?? []).filter(
    (o) => o.position_id === p.id || (o.position_id == null && o.ticker === p.ticker),
  );
  if (inFlight.length > 0) {
    return {
      status: "PENDING_UPDATE",
      detail:
        inFlight
          .map(
            (o) =>
              `${t("order", "订单")} #${o.id} ${o.side} ${o.quantity} ${o.ticker} — ${o.status}`,
          )
          .join("\n") +
        "\n" +
        t(
          "In flight at the broker — the order-sync sweep settles it (§26).",
          "订单在券商处进行中 — 订单同步扫描将完成其结算（§26）。",
        ),
    };
  }
  if (data == null || !data.configured) return null;
  return {
    status: "MATCHED",
    detail: t(
      "Broker and local database agree on this position (§18).",
      "券商与本地数据库对该持仓记录一致（§18）。",
    ),
  };
}

/* ---------------------------------------------------------------- page */

const OPEN_COLS = 16;

export default function PositionsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [checkResult, setCheckResult] = useState<CheckExitsResult | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const open = useQuery({
    queryKey: ["positions", "OPEN"],
    queryFn: () => api.positions.list("OPEN"),
  });
  const monitor = useQuery({
    queryKey: ["positions-monitor"],
    queryFn: api.positions.monitorStatus,
  });
  // Never 503s — "no broker" is a reportable state, not a failure.
  const broker = useQuery({ queryKey: ["broker-status"], queryFn: api.broker.status });
  const brokerUnconfigured = broker.data != null && !broker.data.configured;
  // §26 — ONE reconcile per page load feeds every row's Reconciliation cell
  // (staleTime keeps refocus refetches quiet; a 503 is terminal, not retried).
  // When the broker is unconfigured the response says so and the column
  // renders "—" — the query is not even sent.
  const reconcile = useQuery({
    queryKey: ["broker-reconcile"],
    queryFn: api.broker.reconcile,
    staleTime: 30_000,
    retry: retryUnlessTerminal,
    enabled: broker.data != null && broker.data.configured,
  });
  // §26 — ONE open-orders read feeds every row's PENDING_UPDATE state. Local
  // rows only (never needs a broker, never 503s); a short staleTime tracks
  // the order-sync sweep settling in-flight orders.
  const openOrders = useQuery({
    queryKey: ["orders-open"],
    queryFn: api.orders.open,
    staleTime: 15_000,
  });
  const closed = useQuery({
    queryKey: ["positions", "CLOSED"],
    queryFn: () => api.positions.list("CLOSED"),
  });

  const invalidateAfterTrade = () => {
    qc.invalidateQueries({ queryKey: ["positions"] });
    qc.invalidateQueries({ queryKey: ["portfolio-risk"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
    // A close/exit just created or settled an order — PENDING_UPDATE derives
    // from this query, so it must refresh with the positions themselves.
    qc.invalidateQueries({ queryKey: ["orders-open"] });
  };

  const checkExits = useMutation({
    mutationFn: () => api.positions.checkExits(),
    onSuccess: (data) => {
      setCheckResult(data);
      invalidateAfterTrade();
    },
    onError: (e: Error) => {
      // The not-configured 503 gets the dedicated panel, not a red failure
      // banner — nothing failed, there is simply no data source.
      if (isMarketDataNotConfigured(e)) {
        setActionMsg(null);
        setCheckResult(null);
        return;
      }
      setActionMsg({
        kind: "err",
        text: t(`Exit check failed: ${e.message}`, `离场检查失败：${e.message}`),
      });
    },
  });

  const exitCheckUnconfigured = isMarketDataNotConfigured(checkExits.error);

  const closePosition = useMutation({
    mutationFn: (args: { ticker: string; quantity?: number }) =>
      api.orders.close(args.ticker, args.quantity, "manual close from Positions page"),
    onSuccess: (res) => {
      setClosing(null);
      toast(
        "SUCCESS",
        t(
          `Position closed: ${res.order.quantity} ${res.order.ticker} @ ${fmtUsd(res.order.fill_price, 2)} — realized P&L ${signedUsd(res.realized_pnl)}`,
          `已平仓：${res.order.quantity} ${res.order.ticker} @ ${fmtUsd(res.order.fill_price, 2)} — 已实现 P&L ${signedUsd(res.realized_pnl)}`,
        ),
      );
      setActionMsg({
        kind: "ok",
        text: t(
          `Closed ${res.order.quantity} ${res.order.ticker} @ ${fmtUsd(res.order.fill_price, 2)}` +
            ` (order #${res.order.id}, commission ${fmtUsd(res.order.commission, 2)})` +
            ` — realized P&L ${signedUsd(res.realized_pnl)}.`,
          `已平仓 ${res.order.quantity} ${res.order.ticker} @ ${fmtUsd(res.order.fill_price, 2)}` +
            `（订单 #${res.order.id}，佣金 ${fmtUsd(res.order.commission, 2)}）` +
            ` — 已实现 P&L ${signedUsd(res.realized_pnl)}。`,
        ),
      });
      invalidateAfterTrade();
    },
    onError: (e: Error) => {
      // The broker 503 gets the dedicated panel below, not a red failure
      // banner: nothing failed and no order exists — there is simply no broker
      // to send it to, and the internal simulator does not stand in for one.
      if (isBrokerNotConfigured(e)) {
        setActionMsg(null);
        // Re-read the broker status so the header line agrees with what the
        // close attempt just proved.
        qc.invalidateQueries({ queryKey: ["broker-status"] });
        return;
      }
      setActionMsg({
        kind: "err",
        // A close needs a fill price, which needs the provider — report the
        // server's own wording rather than a generic failure.
        text: isMarketDataNotConfigured(e)
          ? t(
              `Close unavailable — ${notConfiguredMessage(e)}. No fill price can be sourced, and none will be estimated.`,
              `无法平仓 — ${notConfiguredMessage(e)}。无法获取成交价格，系统也不会进行估算。`,
            )
          : t(`Close failed: ${e.message}`, `平仓失败：${e.message}`),
      });
    },
  });

  const closeBrokerUnconfigured = isBrokerNotConfigured(closePosition.error);

  const toggleExpanded = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // §27/§30: the close flow is an application dialog — quantity input plus
  // the SELL TO CLOSE consequences — never a browser-native prompt/confirm.
  const [closing, setClosing] = useState<PositionRow | null>(null);
  const [closeQty, setCloseQty] = useState("");

  const onClose = (p: PositionRow) => {
    setCloseQty(String(p.quantity));
    setClosing(p);
  };

  const closeQtyNumber = (() => {
    const trimmed = closeQty.trim();
    if (trimmed === "") return closing?.quantity ?? null;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0 || (closing != null && n > closing.quantity)) {
      return null;
    }
    return n;
  })();

  const exitList = (checkResult?.exits_triggered ?? [])
    .map((e) =>
      t(
        `${e.ticker} (${e.rule}, order #${e.order_id})`,
        `${e.ticker}（${e.rule}，订单 #${e.order_id}）`,
      ),
    )
    .join(", ");

  return (
    <>
      {closing != null && (
        <ConfirmDialog
          title={t(`SELL TO CLOSE ${closing.ticker}`, `卖出平仓 ${closing.ticker}`)}
          confirmLabel={t("Sell to Close", "卖出平仓")}
          destructive
          loading={closePosition.isPending}
          disabled={closeQtyNumber == null}
          onCancel={() => setClosing(null)}
          onConfirm={() =>
            closePosition.mutate({
              ticker: closing.ticker,
              quantity:
                closeQtyNumber != null && closeQtyNumber !== closing.quantity
                  ? closeQtyNumber
                  : undefined,
            })
          }
        >
          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              {t(
                `Quantity to sell (1–${closing.quantity}; ${closing.quantity} closes the full position)`,
                `卖出数量（1–${closing.quantity}；${closing.quantity} 即全部平仓）`,
              )}
            </span>
            <input
              autoFocus
              type="number"
              min={1}
              max={closing.quantity}
              step={1}
              value={closeQty}
              onChange={(e) => setCloseQty(e.target.value)}
              style={{ width: "100%", marginTop: 4 }}
              aria-label={t(
                `Quantity to sell (1 to ${closing.quantity})`,
                `卖出数量（1 至 ${closing.quantity}）`,
              )}
            />
          </label>
          {closeQtyNumber == null && (
            <p className="error" style={{ marginBottom: 8 }}>
              {t(
                `Quantity must be a whole number between 1 and ${closing.quantity}.`,
                `数量必须是 1 到 ${closing.quantity} 之间的整数。`,
              )}
            </p>
          )}
          <p>
            {t(
              `Paper fill model: the SELL fills at the last stored close × (1 − paper_slippage_bps/10000); commission = paper_commission_per_share × ${closeQtyNumber ?? "qty"} is charged on this close, just as it was on entry.`,
              `模拟成交模型：卖出按最近存储的收盘价 ×（1 − paper_slippage_bps/10000）成交；本次平仓收取佣金 = paper_commission_per_share × ${closeQtyNumber ?? "数量"}，与开仓时一致。`,
            )}
          </p>
          <p style={{ color: "var(--text-dim)", marginTop: 8 }}>
            {t(
              "Closing is allowed even while global trading is paused — closing reduces risk (§18 risk-priority).",
              "即使全局交易已暂停仍允许平仓 — 平仓会降低风险（§18 风险优先）。",
            )}
          </p>
        </ConfirmDialog>
      )}
      <h1>{t("Positions", "持仓")}</h1>
      <p className="subtitle">
        {t(
          "Paper positions with live P&L, the exit rules protecting each one, and — per §37 — exactly why the system is still holding.",
          "模拟持仓的实时 P&L、保护每笔持仓的离场规则，以及（按 §37）系统仍在持有的确切原因。",
        )}
      </p>
      <FlowNav stage="execute" />
      <p className="datasource">
        {t(
          "paper execution · fills = last stored close ± paper_slippage_bps · commission = paper_commission_per_share × qty, charged both ways (constants shared with settings) · closing stays allowed while trading is paused (§18: closing reduces risk)",
          "模拟撮合 · 成交价 = 最近存储收盘价 ± paper_slippage_bps · 佣金 = paper_commission_per_share × 数量，双向收取（常量与设置页共享）· 交易暂停期间仍可平仓（§18：平仓降低风险）",
        )}
      </p>

      {actionMsg && (
        <div className={`banner ${actionMsg.kind === "ok" ? "active" : "paused"}`}>
          {actionMsg.text}
        </div>
      )}

      {checkResult && (
        <div className={`banner ${checkResult.exits_triggered.length > 0 ? "paused" : "active"}`}>
          {t(
            `Exit check: ${checkResult.checked} ${checkResult.checked === 1 ? "position" : "positions"} checked`,
            `离场检查：已检查 ${checkResult.checked} 个持仓`,
          )}
          {" — "}
          {checkResult.exits_triggered.length > 0
            ? t(
                `${checkResult.exits_triggered.length} exit${
                  checkResult.exits_triggered.length === 1 ? "" : "s"
                } triggered: ${exitList}`,
                `触发 ${checkResult.exits_triggered.length} 个离场：${exitList}`,
              )
            : t("all held", "全部继续持有")}
        </div>
      )}

      {/* Rendered from the broker's own status endpoint, beside the monitor
          line — a close is only possible when this says a broker exists. */}
      {broker.data && <BrokerStatusLine status={broker.data} />}

      {/* A close that came back BROKER_NOT_CONFIGURED: no order was placed, so
          this is the explicit state rather than a red "Close failed" string. */}
      {closeBrokerUnconfigured && (
        <NotConfigured variant="broker" message={notConfiguredMessage(closePosition.error)}>
          <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
            {t(
              "The position is unchanged and still open. Configure the paper broker to close it, or close it in the broker's own interface.",
              "该持仓未受影响，仍处于打开状态。请配置模拟券商后再平仓，或在券商自己的界面中平仓。",
            )}
          </p>
        </NotConfigured>
      )}

      {monitor.data &&
        (monitor.data.enabled ? (
          <p className="datasource" style={{ marginBottom: 8 }}>
            {t(
              `Auto exit monitor: every ${monitor.data.interval_seconds}s · last sweep`,
              `自动离场监控：每 ${monitor.data.interval_seconds} 秒 · 上次扫描`,
            )}{" "}
            {monitor.data.last_sweep_at == null
              ? t("never", "从未")
              : new Date(monitor.data.last_sweep_at).toLocaleString()}
            {monitor.data.last_result != null &&
              t(
                ` · ${monitor.data.last_result.checked} checked / ${monitor.data.last_result.exits_triggered} exits`,
                ` · 已检查 ${monitor.data.last_result.checked} / 离场 ${monitor.data.last_result.exits_triggered}`,
              )}
            {exitCheckUnconfigured &&
              t(
                " · sweeps are being skipped — market data is not configured",
                " · 扫描已被跳过 — 行情数据未配置",
              )}
          </p>
        ) : (
          <p
            style={{
              color: "var(--amber)",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {t(
              "Auto exit monitor: disabled — exits run only via the manual button below",
              "自动离场监控：已禁用 — 仅可通过下方手动按钮执行离场",
            )}
          </p>
        ))}

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginBottom: 4 }}>
          <h2 style={{ marginBottom: 0 }}>{t("Open positions", "未平仓持仓")}</h2>
          <button
            onClick={() => checkExits.mutate()}
            disabled={checkExits.isPending || exitCheckUnconfigured}
            title={
              exitCheckUnconfigured
                ? t(
                    "Market data is not configured — exit rules cannot be evaluated.",
                    "行情数据未配置 — 无法评估离场规则。",
                  )
                : undefined
            }
          >
            {checkExits.isPending ? t("Checking…", "检查中…") : t("Run Exit Check", "运行离场检查")}
          </button>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
          {t(
            "The exit sweep evaluates every open position against its stop, trail, time stop, and signal rules — the same sweep the automated position monitor runs on a timer.",
            "离场扫描会根据止损、移动止损、时间止损与信号规则评估每个未平仓持仓 — 与自动持仓监控定时执行的是同一个扫描。",
          )}
        </p>

        {/* The sweep prices every open position against the market; with no
            provider it cannot run, and the automated monitor skips too. */}
        {exitCheckUnconfigured && (
          <NotConfigured message={notConfiguredMessage(checkExits.error)}>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
              {t(
                "The exit sweep — manual and automated — cannot evaluate stops, trails or signal decay without prices. Positions below still list; their market columns are blank.",
                "离场扫描（无论手动还是自动）在没有价格时无法评估止损、移动止损或信号衰减。下方持仓仍会列出；其行情相关列为空。",
              )}
            </p>
          </NotConfigured>
        )}

        {open.isPending ? (
          <p className="empty">{t("Loading open positions…", "正在加载未平仓持仓…")}</p>
        ) : open.isError ? (
          // GET /api/positions is specified NOT to 503 — positions are DB rows.
          // Handle it anyway so no backend variation can produce numbers here.
          isMarketDataNotConfigured(open.error) ? (
            <NotConfigured message={notConfiguredMessage(open.error)} />
          ) : (
            <p className="error">
              {t(
                `Positions unavailable: ${open.error.message}`,
                `无法加载持仓：${open.error.message}`,
              )}
            </p>
          )
        ) : open.data.length === 0 ? (
          <p className="empty">
            {t(
              "No open positions — approve a trade plan from a symbol's",
              "暂无未平仓持仓 — 请在个股的",
            )}{" "}
            <Link href="/research?tab=watchlist" style={{ color: "var(--accent)" }}>
              {t("Trade Plan tab", "交易计划标签页")}
            </Link>
            {t(".", "中批准一个交易计划。")}
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Ticker", "代码")}</th>
                  <th>{t("Instrument", "品种")}</th>
                  <th className="num">{t("Qty", "数量")}</th>
                  <th className="num">{t("Avg price", "均价")}</th>
                  <th className="num">{t("Current", "现价")}</th>
                  <th className="num">{t("Mkt value", "市值")}</th>
                  <th className="num">{t("Unrealized P&L", "未实现 P&L")}</th>
                  <th className="num">{t("Max loss", "最大亏损")}</th>
                  <th className="num">
                    <Term k="atr_trail">{t("Stop", "止损")}</Term>
                  </th>
                  <th className="num">
                    <Term k="atr_trail">{t("Trail", "移动止损")}</Term>
                  </th>
                  <th>{t("Edge entry → now", "Edge 入场 → 当前")}</th>
                  <th className="num">{t("Bars held", "持有K线数")}</th>
                  <th className="num">
                    <Term k="time_stop">{t("Time stop", "时间止损")}</Term>
                  </th>
                  <th>{t("Exit status", "离场状态")}</th>
                  <th
                    title={t(
                      "§26 — broker truth vs local truth from one page-level reconcile, plus PENDING_UPDATE while an order is in flight",
                      "§26 — 单次页面级对账得出的券商数据与本地数据对比；订单在途时显示 PENDING_UPDATE",
                    )}
                  >
                    {t("Reconciliation", "对账")}
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {open.data.map((p) => {
                  const rec = reconcileStatusFor(p, reconcile.data, openOrders.data?.orders, t);
                  const mismatch = rec?.status === "MISMATCH";
                  return (
                  <Fragment key={p.id}>
                    <tr
                      className="click-row"
                      onClick={() => toggleExpanded(p.id)}
                      title={t(
                        "Click to show the full exit-rule evaluation",
                        "点击查看完整的离场规则评估",
                      )}
                    >
                      <td
                        style={{
                          // Same left-accent treatment CRITICAL alerts get on
                          // the dashboard — a MISMATCH row must be prominent
                          // (§26): the local view of this position is wrong.
                          borderLeft: mismatch ? "3px solid var(--red)" : undefined,
                        }}
                      >
                        <Link href={`/watchlist/${encodeURIComponent(p.ticker)}`} className="ticker">
                          {p.ticker}
                        </Link>{" "}
                        <Link
                          href={`/oversight?tab=activity&q=${encodeURIComponent(p.ticker)}`}
                          className="audit-link"
                          title={t(
                            "Full audit trail for this symbol — every order, fill and exit decision",
                            "该代码的完整审计轨迹 — 每次下单、成交与离场决策",
                          )}
                        >
                          {t("audit", "审计")}
                        </Link>
                        <ContractLine p={p} />
                      </td>
                      <td>
                        <InstrumentBadge p={p} />
                      </td>
                      <td className="num">{p.quantity.toLocaleString()}</td>
                      <td className="num">{fmtUsd(p.avg_price, 2)}</td>
                      <td className="num">{p.current_price == null ? DASH : fmtUsd(p.current_price, 2)}</td>
                      <td className="num">{usd(p.market_value)}</td>
                      <td className="num">
                        <PnlCell pnl={p.unrealized_pnl} pct={p.unrealized_pnl_pct} />
                      </td>
                      <td className="num" style={{ color: "var(--red)" }}>
                        {fmtUsd(p.max_loss, 0)}
                      </td>
                      <td className="num">{p.stop_price != null ? fmtUsd(p.stop_price, 2) : "—"}</td>
                      <td className="num">{usd(p.trail_price)}</td>
                      <td>
                        <EdgeCell p={p} />
                      </td>
                      <td className="num">{p.bars_held == null ? DASH : p.bars_held}</td>
                      <td className="num">
                        {p.time_stop_remaining == null
                          ? DASH
                          : t(`${p.time_stop_remaining} bars`, `${p.time_stop_remaining} 根K线`)}
                      </td>
                      <td>
                        <ExitBadge p={p} />
                      </td>
                      <td>
                        {/* §26 — "—" when the broker is unconfigured or no
                            reconcile result exists (and nothing is in
                            flight); never an invented status. MISMATCH red >
                            PENDING_UPDATE amber > MATCHED green. */}
                        {rec == null ? (
                          DASH
                        ) : (
                          <span
                            className={`badge ${
                              mismatch
                                ? "red"
                                : rec.status === "PENDING_UPDATE"
                                  ? "amber"
                                  : "green"
                            }`}
                            title={rec.detail}
                          >
                            {rec.status}
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <span className="row">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(p.id);
                            }}
                            aria-expanded={expanded.has(p.id)}
                            title={t(
                              "Show why the system is still holding",
                              "查看系统仍在持有的原因",
                            )}
                          >
                            {expanded.has(p.id) ? t("Hide why", "收起原因") : t("Why?", "原因?")}
                          </button>
                          <button
                            className="danger"
                            disabled={closePosition.isPending || brokerUnconfigured}
                            title={
                              brokerUnconfigured
                                ? t(
                                    "Broker not configured — no orders can be placed.",
                                    "券商未配置 — 无法下达任何订单。",
                                  )
                                : t(
                                    "SELL TO CLOSE — closing stays allowed while trading is paused (§18)",
                                    "卖出平仓 — 交易暂停期间仍可平仓（§18）",
                                  )
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              onClose(p);
                            }}
                          >
                            {t("Close", "平仓")}
                          </button>
                        </span>
                      </td>
                    </tr>
                    {expanded.has(p.id) && (
                      <tr>
                        <td colSpan={OPEN_COLS} style={{ background: "var(--bg)" }}>
                          <div style={{ padding: "4px 2px" }}>
                            <div
                              style={{
                                fontSize: 11,
                                textTransform: "uppercase",
                                letterSpacing: 0.5,
                                color: "var(--text-dim)",
                                marginBottom: 6,
                                fontFamily:
                                  '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                              }}
                            >
                              {p.exit_status === "EXIT_SIGNALED"
                                ? t(
                                    "Exit rules — why the system is signaling an exit",
                                    "离场规则 — 系统发出离场信号的原因",
                                  )
                                : t(
                                    "Exit rules — why the system is still holding",
                                    "离场规则 — 系统仍在持有的原因",
                                  )}
                            </div>
                            {p.exit_reasons.length > 0 ? (
                              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                                {p.exit_reasons.map((r, i) => (
                                  <li
                                    key={i}
                                    style={{
                                      color: r.startsWith("OK:")
                                        ? "var(--text-dim)"
                                        : "var(--red)",
                                      fontSize: 12,
                                      marginBottom: 2,
                                    }}
                                  >
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                                {hasNoMarketData(p)
                                  ? t(
                                      "No exit-rule evaluation — the rules need current prices, and market data is not configured.",
                                      "无离场规则评估 — 规则需要当前价格，而行情数据未配置。",
                                    )
                                  : t("No exit reasons reported.", "未报告离场原因。")}
                              </span>
                            )}
                            {/* §52 — the option-only risk facts live in the
                                same expander as the exit rules, so an option
                                row carries them and a stock row does not
                                grow four empty cells. */}
                            <OptionRiskFacts p={p} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
            {/* §26 — a mismatch is never buried in a cell: restate it below the
                table with the automatic consequence and where the full broker
                vs local comparison lives. */}
            {reconcile.data != null &&
              reconcile.data.configured &&
              !reconcile.data.in_sync && (
                <p
                  style={{
                    color: "var(--red)",
                    fontSize: 12,
                    fontFamily: "var(--font-mono)",
                    marginTop: 8,
                    marginBottom: 0,
                  }}
                >
                  {t(
                    `Reconciliation found ${reconcile.data.mismatches.length} mismatch${
                      reconcile.data.mismatches.length === 1 ? "" : "es"
                    } — trading pauses automatically (§18). In-flight orders are not mismatches: rows marked PENDING_UPDATE resolve on their own once the order-sync sweep settles the order against the broker. Full broker-vs-local comparison on the`,
                    `对账发现 ${reconcile.data.mismatches.length} 处不一致 — 交易已自动暂停（§18）。在途订单并非不一致：标记为 PENDING_UPDATE 的行会在订单同步扫描与券商完成结算后自行消除。完整的券商与本地对比请见`,
                  )}{" "}
                  <Link href="/oversight?tab=risk" style={{ color: "var(--accent)" }}>
                    {t("Risk page", "风险页面")}
                  </Link>
                  {t(".", "。")}
                </p>
              )}
            {/* Positions are real DB rows and always list; only their
                market-derived columns go blank. The exit-check 503 is the one
                place this page learns WHY, so quote it when we have it and
                otherwise state only what the blank cells prove. */}
            {open.data.some(hasNoMarketData) &&
              (exitCheckUnconfigured ? (
                <NotConfiguredNote message={notConfiguredMessage(checkExits.error)} />
              ) : (
                <p className="nc-inline">
                  {t(
                    "Blank market columns mean no price could be sourced for that position — no data is shown rather than estimated or synthetic values.",
                    "行情列为空表示无法为该持仓获取价格 — 系统宁可不显示数据，也不使用估算或合成值。",
                  )}
                </p>
              ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>{t("Closed positions", "已平仓持仓")}</h2>
        {closed.isPending ? (
          <p className="empty">{t("Loading closed positions…", "正在加载已平仓持仓…")}</p>
        ) : closed.isError ? (
          <p className="error">
            {t(
              `Closed positions unavailable: ${closed.error.message}`,
              `无法加载已平仓持仓：${closed.error.message}`,
            )}
          </p>
        ) : closed.data.length === 0 ? (
          <p className="empty">{t("No closed positions yet.", "暂无已平仓持仓。")}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Ticker", "代码")}</th>
                  <th>{t("Instrument", "品种")}</th>
                  <th className="num">{t("Qty", "数量")}</th>
                  <th className="num">{t("Avg price", "均价")}</th>
                  <th className="num">{t("Realized P&L", "已实现 P&L")}</th>
                  <th>{t("Opened", "开仓日期")}</th>
                  <th>{t("Closed", "平仓日期")}</th>
                </tr>
              </thead>
              <tbody>
                {closed.data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/watchlist/${encodeURIComponent(p.ticker)}`} className="ticker">
                        {p.ticker}
                      </Link>{" "}
                      <Link
                        href={`/oversight?tab=activity&q=${encodeURIComponent(p.ticker)}`}
                        className="audit-link"
                        title={t(
                          "Full audit trail for this symbol",
                          "该代码的完整审计轨迹",
                        )}
                      >
                        {t("audit", "审计")}
                      </Link>
                      <ContractLine p={p} />
                    </td>
                    <td>
                      <InstrumentBadge p={p} />
                    </td>
                    <td className="num">{p.quantity.toLocaleString()}</td>
                    <td className="num">{fmtUsd(p.avg_price, 2)}</td>
                    <td className="num">
                      {p.realized_pnl == null ? (
                        DASH
                      ) : (
                        <span
                          style={{
                            color: p.realized_pnl >= 0 ? "var(--green)" : "var(--red)",
                          }}
                        >
                          {signedUsd(p.realized_pnl)}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(p.opened_at).toLocaleDateString()}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {p.closed_at == null ? DASH : new Date(p.closed_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
