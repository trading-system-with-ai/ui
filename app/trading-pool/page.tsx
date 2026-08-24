"use client";

import Link from "next/link";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import { useToast } from "@/components/shared/Toast";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import FlowNav from "@/components/shared/FlowNav";
import TradingStatusBanner from "@/components/shared/TradingStatusBanner";

export default function TradingPoolPage() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState("");
  const pool = useQuery({ queryKey: ["trading-pool"], queryFn: api.tradingPool.list });
  const status = useQuery({ queryKey: ["trading-status"], queryFn: api.trading.status });

  // Safety: unknown global status is always presented as PAUSED.
  const globalEnabled = status.data?.trading_enabled === true;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trading-pool"] });
    qc.invalidateQueries({ queryKey: ["audit"] });
  };

  const toggle = useMutation({
    mutationFn: ({ t, enabled }: { t: string; enabled: boolean }) => api.tradingPool.toggle(t, enabled),
    onSuccess: (_, vars) => {
      // §31 toast, §32 severity: enabling execution is a WARNING-level state
      // change (orders may now flow), disabling is neutral INFO.
      if (vars.enabled) {
        toast(
          "WARNING",
          t(
            `Trading ENABLED for ${vars.t} — qualifying signals may submit paper orders after all gates pass`,
            `已为 ${vars.t} 启用交易 — 符合条件的信号在通过全部闸门后可能提交模拟盘订单`,
          ),
        );
      } else {
        toast("INFO", t(`Trading disabled for ${vars.t}`, `已为 ${vars.t} 停用交易`));
      }
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (ticker: string) => api.tradingPool.remove(ticker),
    onSuccess: (_, ticker) => {
      toast(
        "INFO",
        t(
          `${ticker} removed from Trading Pool — execution authorization revoked`,
          `${ticker} 已移出交易池 — 执行授权已撤销`,
        ),
      );
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const anyEnabled = pool.data?.some((p) => p.trading_enabled) ?? false;

  // §27/§28: application-styled dialogs, never browser-native popups.
  const [confirmPauseAll, setConfirmPauseAll] = useState(false);
  const [enabling, setEnabling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const pauseAll = () => setConfirmPauseAll(true);

  return (
    <>
      {confirmPauseAll && (
        <ConfirmDialog
          title={t("Pause all trading", "暂停全部交易")}
          confirmLabel={t("Disable All Symbols", "停用全部标的")}
          destructive
          loading={toggle.isPending}
          onCancel={() => setConfirmPauseAll(false)}
          onConfirm={() => {
            pool.data
              ?.filter((p) => p.trading_enabled)
              .forEach((p) => toggle.mutate({ t: p.ticker, enabled: false }));
            setConfirmPauseAll(false);
          }}
        >
          <p>
            {t(
              "Disables trading for every Trading Pool symbol. No new orders will be generated until symbols are explicitly re-enabled. Open positions and their exits are not affected.",
              "将停用交易池中所有标的的交易。在标的被显式重新启用之前，不会生成任何新订单。已有持仓及其退出不受影响。",
            )}
          </p>
        </ConfirmDialog>
      )}
      {enabling != null && (
        <ConfirmDialog
          title={t(`Enable trading for ${enabling}`, `为 ${enabling} 启用交易`)}
          confirmLabel={t("Enable Trading", "启用交易")}
          loading={toggle.isPending}
          onCancel={() => setEnabling(null)}
          onConfirm={() => {
            toggle.mutate({ t: enabling, enabled: true });
            setEnabling(null);
          }}
        >
          <p>
            {t(
              `Future qualifying signals may submit paper orders for ${enabling} after all execution and risk gates pass. This is the explicit execution enablement step — research and plan approval alone never trade.`,
              `此后符合条件的信号在通过全部执行与风控闸门后，可能为 ${enabling} 提交模拟盘订单。这是显式的执行启用步骤 — 仅有研究和计划批准绝不会触发交易。`,
            )}
          </p>
        </ConfirmDialog>
      )}
      {removing != null && (
        <ConfirmDialog
          title={t(`Remove ${removing} from Trading Pool`, `将 ${removing} 移出交易池`)}
          confirmLabel={t("Remove", "移除")}
          destructive
          loading={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            remove.mutate(removing);
            setRemoving(null);
          }}
        >
          <p>
            {t(
              `Revokes execution authorization for ${removing}. The symbol stays on the Watchlist for research; no order can be placed for it until it is promoted again.`,
              `将撤销 ${removing} 的执行授权。该标的仍保留在自选列表中用于研究；在再次晋升之前，不能为其提交任何订单。`,
            )}
          </p>
        </ConfirmDialog>
      )}
      <h1>{t("Trading Pool", "交易池")}</h1>
      <p className="subtitle">
        {t(
          "Symbols here are authorized to trade if the mechanical strategy and risk engine approve. Authorization is not an order — every trade still passes the full gate chain.",
          "此处的标的在机械策略与风控引擎批准后方可交易。授权并不等于下单 — 每笔交易仍需通过完整的闸门链。",
        )}
      </p>
      <FlowNav stage="authorize" />

      <p style={{ color: "var(--text-dim)", fontSize: 13 }}>
        {/* pipeline linkage: authorization feeds execution next door */}
        {t(
          "Orders for enabled symbols appear under ",
          "已启用标的产生的订单会出现在",
        )}
        <Link href="/trading?tab=positions" style={{ color: "var(--accent)" }}>
          {t("Positions →", "持仓 →")}
        </Link>
        {t(
          " — every one still passes the full gate chain first.",
          " — 每笔订单仍须先通过完整闸门链。",
        )}
      </p>

      <TradingStatusBanner
        statusKnown={status.data !== undefined}
        globalEnabled={globalEnabled}
        pausedReason={status.data?.reason}
        poolKnown={pool.data !== undefined}
        enabledCount={pool.data?.filter((p) => p.trading_enabled).length ?? 0}
        poolSize={pool.data?.length ?? 0}
        action={
          anyEnabled ? (
            <button className="danger" onClick={pauseAll}>
              {t("PAUSE ALL TRADING", "暂停全部交易")}
            </button>
          ) : null
        }
      />

      {error && (
        <div className="panel">
          <p className="error">{error}</p>
        </div>
      )}

      <div className="panel">
        <h2>
          {t(
            `Authorized Symbols (${pool.data?.length ?? 0})`,
            `已授权标的（${pool.data?.length ?? 0}）`,
          )}
        </h2>
        {pool.data && pool.data.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Ticker", "代码")}</th>
                  <th>{t("Trading", "交易")}</th>
                  <th>{t("Allowed Strategies", "允许的策略")}</th>
                  <th>{t("Promoted", "晋升日期")}</th>
                  <th style={{ textAlign: "right" }}>{t("Actions", "操作")}</th>
                </tr>
              </thead>
              <tbody>
                {pool.data.map((p) => (
                  <tr key={p.ticker}>
                    <td className="ticker">{p.ticker}</td>
                    <td>
                      <span className={`badge ${p.trading_enabled ? "on" : "off"}`}>
                        {p.trading_enabled ? t("ENABLED", "已启用") : t("DISABLED", "已停用")}
                      </span>
                    </td>
                    <td>{p.allowed_strategies.join(", ")}</td>
                    <td>{new Date(p.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: "right" }}>
                      <span className="row" style={{ justifyContent: "flex-end" }}>
                        <button
                          onClick={() => {
                            if (p.trading_enabled) {
                              toggle.mutate({ t: p.ticker, enabled: false });
                            } else {
                              setEnabling(p.ticker);
                            }
                          }}
                        >
                          {p.trading_enabled
                            ? t("Disable Trading", "停用交易")
                            : t("Enable Trading", "启用交易")}
                        </button>
                        <button className="danger" onClick={() => setRemoving(p.ticker)}>
                          {t("Remove", "移除")}
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : pool.isPending ? (
          <p className="empty">{t("Loading…", "加载中…")}</p>
        ) : (
          <p className="empty">
            {t(
              "No symbols authorized. Promote a researched symbol from the Watchlist page.",
              "暂无已授权标的。请在自选列表页面晋升已完成研究的标的。",
            )}
          </p>
        )}
      </div>
    </>
  );
}
