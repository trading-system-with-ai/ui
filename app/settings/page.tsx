"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PlatformConfig } from "@/lib/types";
import { fmtPct, fmtUsd } from "@/lib/risk-format";

/** Panel heading with the plan-section chip every panel carries. */
function PanelTitle({ title, section }: { title: string; section: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
      <h2 style={{ marginBottom: 0 }}>{title}</h2>
      <span className="chip">{section}</span>
    </div>
  );
}

/** Parameter | Value | Meaning table used by every parameter panel. */
function ParamTable({ rows }: { rows: [name: string, value: string, meaning: string][] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th className="num">Value</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, value, meaning]) => (
            <tr key={name}>
              <td style={{ whiteSpace: "nowrap" }}>{name}</td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>
                {value}
              </td>
              <td style={{ fontFamily: "inherit", fontSize: 12, color: "var(--text-dim)" }}>
                {meaning}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Provider value with an amber STUB flag when the provider is stubbed. */
function ProviderValue({ value }: { value: string }) {
  const stub = value.toLowerCase().includes("stub");
  return (
    <span className="row" style={{ gap: 6 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{value}</span>
      {stub && <span className="badge amber">STUB</span>}
    </span>
  );
}

/** Signal-parameter values are numbers or (lo, hi) tuples serialized as arrays. */
function fmtSignalValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(" – ");
  if (typeof v === "number") return String(v);
  return String(v);
}

/** Key-value dump of a (long) signal-parameter object, in declaration order. */
function SignalParamGrid({ params }: { params: Record<string, unknown> }) {
  return (
    <div className="kv" style={{ marginTop: 10 }}>
      {Object.entries(params).map(([k, v]) => (
        <div key={k}>
          <div className="k">{k}</div>
          <div className="v">{fmtSignalValue(v)}</div>
        </div>
      ))}
    </div>
  );
}

function AllowedBadge({ allowed }: { allowed: boolean }) {
  return (
    <span className={`badge ${allowed ? "green" : "red"}`}>
      {allowed ? "ALLOWED" : "BLOCKED"}
    </span>
  );
}

function ConfigView({ cfg }: { cfg: PlatformConfig }) {
  const rl = cfg.risk_limits;
  const ex = cfg.exit_params;
  const sel = cfg.selector_params;
  const vt = cfg.vol_target_params;
  const bt = cfg.backtest_defaults;
  const pt = cfg.paper_trading;
  const killEnabled = cfg.kill_switch.trading_enabled === true;

  const permissionRows: [string, boolean, string][] = [
    ["Long stock", cfg.account_permissions.long_stock, "Buy and hold shares."],
    ["Long calls", cfg.account_permissions.long_call, "Buy call options (bull side)."],
    ["Long puts", cfg.account_permissions.long_put, "Buy put options (bear side)."],
    [
      "Defined-risk spreads",
      cfg.account_permissions.defined_risk_spreads,
      "Off until the account is approved for spreads (§5).",
    ],
  ];

  return (
    <>
      {/* -------------------------------------------------- environment & providers */}
      <div className="panel">
        <PanelTitle title="Environment & Providers" section="§22" />
        <div className="kv">
          <div>
            <div className="k">Environment</div>
            <div className="v" style={{ marginTop: 2 }}>
              <span className="badge accent">{cfg.environment.toUpperCase()}</span>
            </div>
          </div>
          <div>
            <div className="k">Market data provider</div>
            <div className="v" style={{ marginTop: 2 }}>
              <ProviderValue value={cfg.providers.market_data} />
            </div>
          </div>
          <div>
            <div className="k">LLM provider</div>
            <div className="v" style={{ marginTop: 2 }}>
              <ProviderValue value={cfg.providers.llm} />
            </div>
          </div>
          <div>
            <div className="k">LLM model</div>
            <div className="v" style={{ marginTop: 2 }}>{cfg.providers.llm_model}</div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------- kill switch */}
      <div className="panel">
        <PanelTitle title="Kill Switch" section="§18" />
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span className={`badge ${killEnabled ? "green" : "red"}`}>
            {killEnabled ? "TRADING ENABLED" : "TRADING PAUSED"}
          </span>
          {!killEnabled && (
            <span style={{ fontSize: 13 }}>
              {cfg.kill_switch.reason || "no reason given"}
            </span>
          )}
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8 }}>
          The global kill switch overrides every per-symbol enablement.{" "}
          <Link href="/" style={{ color: "var(--accent)" }}>
            Pause / resume controls live on the Dashboard →
          </Link>
        </p>
      </div>

      {/* -------------------------------------------------- account permissions */}
      <div className="panel">
        <PanelTitle title="Account Permissions" section="§5" />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Capability</th>
                <th>Status</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              {permissionRows.map(([label, allowed, meaning]) => (
                <tr key={label}>
                  <td style={{ whiteSpace: "nowrap" }}>{label}</td>
                  <td>
                    <AllowedBadge allowed={allowed} />
                  </td>
                  <td style={{ fontFamily: "inherit", fontSize: 12, color: "var(--text-dim)" }}>
                    {meaning}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ whiteSpace: "nowrap" }}>Short stock</td>
                <td>
                  <span className="badge red">BLOCKED</span>
                </td>
                <td style={{ fontFamily: "inherit", fontSize: 12, color: "var(--text-dim)" }}>
                  Short stock does not exist in this system — there is no flag for it (§5).
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* -------------------------------------------------- risk limits */}
      <div className="panel">
        <PanelTitle title="Risk Limits" section="§12" />
        <ParamTable
          rows={[
            ["budget_weak", fmtPct(rl.budget_weak, 2), "Per-trade risk budget at WEAK signal strength, fraction of NAV (§12.2)."],
            ["budget_moderate", fmtPct(rl.budget_moderate, 2), "Per-trade risk budget at MODERATE strength (§12.2)."],
            ["budget_strong", fmtPct(rl.budget_strong, 2), "Per-trade risk budget at STRONG strength (§12.2)."],
            ["budget_very_strong", fmtPct(rl.budget_very_strong, 2), "Per-trade risk budget at VERY_STRONG strength (§12.2)."],
            ["abs_max_trade_risk", fmtPct(rl.abs_max_trade_risk, 2), "Absolute per-trade ceiling no tier or confidence may override (§12.2)."],
            ["single_name_risk", fmtPct(rl.single_name_risk, 2), "Max open risk per underlying (§12.3)."],
            ["single_name_capital", fmtPct(rl.single_name_capital, 0), "Max capital deployed per underlying (§12.3)."],
            ["bucket_risk", fmtPct(rl.bucket_risk, 1), "Combined risk cap for one correlation bucket (§12.4)."],
            ["heat_elevated", fmtPct(rl.heat_elevated, 1), "Portfolio heat boundary: ELEVATED state begins (§12.5)."],
            ["heat_high", fmtPct(rl.heat_high, 1), "Portfolio heat boundary: HIGH state begins (§12.5)."],
            ["heat_reject", fmtPct(rl.heat_reject, 1), "At or above this heat, NO new risk is accepted (§12.5)."],
            ["strength_weak", rl.strength_weak.toFixed(0), "|edge| at or above this maps to the WEAK tier; below it there is no valid signal (§12.2)."],
            ["strength_moderate", rl.strength_moderate.toFixed(0), "|edge| threshold for the MODERATE tier (§12.2)."],
            ["strength_strong", rl.strength_strong.toFixed(0), "|edge| threshold for the STRONG tier (§12.2)."],
            ["strength_very_strong", rl.strength_very_strong.toFixed(0), "|edge| threshold for the VERY_STRONG tier (§12.2)."],
            ["max_delta_notional_pct_nav", fmtPct(rl.max_delta_notional_pct_nav, 0), "Max |delta-adjusted notional| as a share of NAV (§16)."],
            ["max_net_theta_pct_nav", fmtPct(rl.max_net_theta_pct_nav, 2), "Max |net theta| per day as a share of NAV (§16)."],
            ["max_net_vega_pct_nav", fmtPct(rl.max_net_vega_pct_nav, 1), "Max |net vega| per IV point as a share of NAV (§16)."],
          ]}
        />

        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--text-dim)",
            margin: "16px 0 6px",
          }}
        >
          Cash floors by regime (§13)
        </h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Regime</th>
                <th className="num">Minimum cash (of NAV)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rl.cash_floors).map(([regime, floor]) => (
                <tr key={regime}>
                  <td style={{ whiteSpace: "nowrap" }}>{regime}</td>
                  <td className="num">{fmtPct(floor, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: "var(--text-dim)",
            margin: "16px 0 6px",
          }}
        >
          Static correlation buckets (§12.4)
        </h3>
        {Object.keys(rl.correlation_buckets).length > 0 ? (
          Object.entries(rl.correlation_buckets).map(([name, tickers]) => (
            <div key={name} className="bucket">
              <div className="bucket-head">
                <span className="name">{name}</span>
                <span className="figures">
                  {tickers.length} tickers · shared cap {fmtPct(rl.bucket_risk, 1)}
                </span>
              </div>
              <div className="bucket-members">{tickers.join(" · ")}</div>
            </div>
          ))
        ) : (
          <p className="empty">No static correlation buckets configured.</p>
        )}
      </div>

      {/* -------------------------------------------------- exit parameters */}
      <div className="panel">
        <PanelTitle title="Exit Parameters" section="§11" />
        <ParamTable
          rows={[
            ["exit_edge_threshold", String(ex.exit_edge_threshold), "SIGNAL_DECAY fires when the directional edge drops below this — deliberately easier than entry (§11.1)."],
            ["atr_trail_k", String(ex.atr_trail_k), "Trailing-stop distance in ATR multiples below the highest close since entry (§11.5)."],
            ["time_stop_bars", String(ex.time_stop_bars), "Bars after which a going-nowhere position is abandoned (§11.6)."],
            ["min_move_atr", String(ex.min_move_atr), "Minimum favourable move, in ATR multiples, required to escape the time stop (§11.6)."],
            ["atr_period", String(ex.atr_period), "ATR period used by the trailing exit and the time stop."],
            ["premium_hard_stop_pct", fmtPct(ex.premium_hard_stop_pct, 0), "Options only: loss of this fraction of the entry premium fires PREMIUM_HARD_STOP (§11.3)."],
            ["dte_exit_threshold", `${ex.dte_exit_threshold} DTE`, "Options only: at or below this DTE, DTE_EXIT fires rather than holding into the gamma/theta zone (§11.7)."],
          ]}
        />
      </div>

      {/* -------------------------------------------------- contract selector */}
      <div className="panel">
        <PanelTitle title="Contract Selector" section="§9" />
        <ParamTable
          rows={[
            ["dte_min", `${sel.dte_min} days`, "Minimum days-to-expiry for a candidate contract (§9.1)."],
            ["dte_max", `${sel.dte_max} days`, "Maximum days-to-expiry for a candidate contract (§9.1)."],
            ["abs_delta_min", sel.abs_delta_min.toFixed(2), "Minimum |delta| — right-agnostic window (§9.1)."],
            ["abs_delta_max", sel.abs_delta_max.toFixed(2), "Maximum |delta| (§9.1)."],
            ["min_open_interest", String(sel.min_open_interest), "Open-interest liquidity floor (§9.1)."],
            ["min_volume", String(sel.min_volume), "Daily volume liquidity floor (§9.1)."],
            ["max_spread_pct", fmtPct(sel.max_spread_pct, 0), "Max relative bid-ask spread, (ask − bid) / mid (§9.1)."],
            ["max_theta_premium_pct", fmtPct(sel.max_theta_premium_pct, 0), "Max fraction of the premium that decays away per calendar day (§9.1)."],
            ["top_n", String(sel.top_n), "How many eligible contracts get a rank (§9.2)."],
            ["w_liquidity", String(sel.w_liquidity), "Ranking weight: liquidity term (§9.2 v0 heuristic)."],
            ["w_theta", String(sel.w_theta), "Ranking weight: theta-burden term (§9.2)."],
            ["w_delta_fit", String(sel.w_delta_fit), "Ranking weight: delta-fit term (§9.2)."],
          ]}
        />
      </div>

      {/* -------------------------------------------------- vol targeting */}
      <div className="panel">
        <PanelTitle title="Vol Targeting" section="§14" />
        <ParamTable
          rows={[
            ["target_vol", fmtPct(vt.target_vol, 0), "Annualized portfolio volatility target the forecast is matched against."],
            ["max_multiplier", `${vt.max_multiplier}×`, "Hard cap on UPWARD scaling in calm markets — low vol must not balloon sizes."],
            ["min_multiplier", `${vt.min_multiplier}×`, "Floor on downward scaling so a vol spike shrinks sizing sanely, not to zero."],
          ]}
        />
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8 }}>
          The multiplier scales NEW risk budgets only; hard risk caps always apply regardless
          (§14, §44 rule 20).
        </p>
      </div>

      {/* -------------------------------------------------- signal parameters */}
      <div className="panel">
        <PanelTitle title="Signal Parameters" section="§6" />
        <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 8 }}>
          Every value is a tunable backtest parameter — defaults are starting points for
          optimization, never truths (§6.2).
        </p>
        <details className="skip-details">
          <summary>
            Regime engine (§6.1) — {Object.keys(cfg.regime_params).length} parameters
          </summary>
          <SignalParamGrid params={cfg.regime_params as unknown as Record<string, unknown>} />
        </details>
        <details className="skip-details" style={{ marginTop: 10 }}>
          <summary>
            Directional scorer (§6.2) — {Object.keys(cfg.directional_params).length} parameters
          </summary>
          <SignalParamGrid
            params={cfg.directional_params as unknown as Record<string, unknown>}
          />
        </details>
      </div>

      {/* -------------------------------------------------- backtest defaults */}
      <div className="panel">
        <PanelTitle title="Backtest Defaults" section="§20" />
        <ParamTable
          rows={[
            ["position_pct", fmtPct(bt.position_pct, 0), "Fraction of current equity deployed per entry."],
            ["commission_per_share", fmtUsd(bt.commission_per_share, 3), "Commission charged per share on BOTH the buy and the sell fill (§44 rule 11)."],
            ["slippage_bps", `${bt.slippage_bps} bps`, "Slippage applied against us on every fill (§44 rule 11)."],
            ["entry_edge_threshold", String(bt.entry_edge_threshold), "Minimum directional edge (with BULL bias, bull regime) to enter (§11.1)."],
            ["exit_edge_threshold", String(bt.exit_edge_threshold), "SIGNAL_DECAY exit threshold — must be ≤ entry threshold (§11.1)."],
            ["atr_trail_k", String(bt.atr_trail_k), "ATR multiple of the trailing stop (§11.5)."],
            ["time_stop_bars", String(bt.time_stop_bars), "Bars before a stagnant position is abandoned (§11.6)."],
            ["min_move_atr", String(bt.min_move_atr), "Minimum move (ATR multiples) to escape the time stop (§11.6)."],
            ["oos_split", fmtPct(bt.oos_split, 0), "In-sample fraction; the rest is out-of-sample — reported on, never optimized against (§44 rule 16)."],
            ["warmup_bars", String(bt.warmup_bars), "Bars withheld at the start so every indicator is fully formed (§20.3)."],
          ]}
        />
      </div>

      {/* -------------------------------------------------- paper trading */}
      <div className="panel">
        <PanelTitle title="Paper Trading" section="§43 · Phase 6" />
        <ParamTable
          rows={[
            ["initial_cash", fmtUsd(pt.initial_cash, 0), "Starting cash of the paper portfolio."],
            ["slippage_bps", `${pt.slippage_bps} bps`, "Fill model: BUY at close × (1 + bps/10000), SELL at close × (1 − bps/10000)."],
            ["commission_per_share", fmtUsd(pt.commission_per_share, 3), "Stock commission per share, charged both ways."],
            ["commission_per_contract", fmtUsd(pt.commission_per_contract, 2), "Option commission per contract, charged both ways."],
          ]}
        />
      </div>
    </>
  );
}

export default function SettingsPage() {
  const config = useQuery({ queryKey: ["platform-config"], queryFn: api.config.get });

  return (
    <>
      <h1>Settings</h1>
      <p className="subtitle">
        The configuration every engine is actually running with — §44 rule 2 (&ldquo;every rule
        must be configuration-driven&rdquo;) made visible.
      </p>

      <div className="preview-note">
        <strong>Read-only</strong> view of the configuration the engines are actually using.
        Editing arrives in a later phase.
      </div>

      {config.data ? (
        <ConfigView cfg={config.data} />
      ) : config.isError ? (
        <div className="panel">
          <p className="error" style={{ marginTop: 0 }}>
            Configuration unavailable: {config.error.message}
          </p>
          <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
            GET /api/config failed — the backend may not be running.
          </p>
        </div>
      ) : (
        <div className="panel">
          <p className="empty">Loading configuration…</p>
        </div>
      )}
    </>
  );
}
