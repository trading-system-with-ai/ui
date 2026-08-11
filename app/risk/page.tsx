"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  DECISION_BADGE,
  HEAT_BADGE,
  INSTRUMENT_BADGE,
  fmtPct,
  fmtUsd,
  utilizationSeverity,
} from "@/lib/risk-format";
import type {
  AuditEvent,
  PortfolioRisk,
  RiskDecision,
  RiskLimits,
  StrategyHealth,
  StrategyHealthStatus,
  VolTargeting,
} from "@/lib/types";

/* ---------------------------------------------------------------- limits copy */

const LIMIT_ROWS: { key: keyof RiskLimits; label: string; meaning: string }[] = [
  {
    key: "single_name_risk_pct",
    label: "Single-name risk",
    meaning: "Max risk (stop distance × size) in any one name, as % of NAV.",
  },
  {
    key: "single_name_capital_pct",
    label: "Single-name capital",
    meaning: "Max capital deployed into any one name, as % of NAV.",
  },
  {
    key: "bucket_risk_pct",
    label: "Bucket risk cap",
    meaning: "Max combined open risk inside any correlation bucket, as % of NAV.",
  },
  {
    key: "heat_elevated_pct",
    label: "Heat: ELEVATED",
    meaning: "Portfolio Heat at or above this is ELEVATED — new trades are sized down.",
  },
  {
    key: "heat_high_pct",
    label: "Heat: HIGH",
    meaning: "Portfolio Heat at or above this is HIGH — only the strongest signals get sized.",
  },
  {
    key: "heat_reject_pct",
    label: "Heat: reject",
    meaning: "Portfolio Heat at or above this BLOCKS all new risk.",
  },
  {
    key: "abs_max_trade_risk_pct",
    label: "Abs max trade risk",
    meaning: "Absolute ceiling on any single trade's risk, as % of NAV — never exceeded.",
  },
];

/* ---------------------------------------------------------------- helpers */

const NO_DATA = (
  <span style={{ color: "var(--text-dim)", fontStyle: "italic" }}>no data</span>
);

/** Shares / share-equivalents — options make these fractional, keep 1 decimal max. */
function fmtShares(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Small unitless Greek (gamma) — up to 2 decimals, no trailing zeros. */
function fmtGreek(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Annualized vol fraction → "12%" / "18.2%" (whole percents drop the ".0" so the
 * line reads "target 12%", not "target 12.0%").
 */
function fmtVol(v: number): string {
  const pct = v * 100;
  const digits = Math.abs(pct - Math.round(pct)) < 1e-9 ? 0 : 1;
  return `${pct.toFixed(digits)}%`;
}

/** "0.66×" / "1.0×" — at least one decimal so the multiplier never reads as a count. */
function fmtMultiplier(v: number): string {
  return `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`;
}

/** Badge class for a per-position instrument label (unknown labels render dim). */
function instrumentBadge(instrument: string): string {
  return (INSTRUMENT_BADGE as Record<string, string | undefined>)[instrument] ?? "dim";
}

function decisionFromDetails(details: Record<string, unknown>): {
  decision: RiskDecision | null;
  reasons: string;
} {
  const d = details.decision;
  const decision =
    d === "APPROVE" || d === "APPROVE_WITH_RESIZE" || d === "REJECT" ? d : null;
  const rc = details.reason_codes;
  const reasons = Array.isArray(rc)
    ? rc.filter((r): r is string => typeof r === "string").join(", ")
    : "";
  return { decision, reasons };
}

/* ---------------------------------------------------------------- panels */

function StatTiles({ d }: { d: PortfolioRisk }) {
  // Cash severity: red below the floor, amber within 5 points of it.
  // cash_pct / cash_floor_pct are FRACTIONS (0.20 = 20%), so 5 points = 0.05.
  const cashSeverity =
    d.cash_pct < d.cash_floor_pct
      ? "var(--red)"
      : d.cash_pct < d.cash_floor_pct + 0.05
        ? "var(--amber)"
        : undefined;

  return (
    <div className="statbar">
      <div className="stat">
        <div className="label">Portfolio NAV</div>
        <div className="value">{fmtUsd(d.nav)}</div>
      </div>
      <div className="stat">
        <div className="label">Cash</div>
        <div className="value" style={cashSeverity ? { color: cashSeverity } : undefined}>
          {fmtUsd(d.cash)}
          <span style={{ fontSize: 13, marginLeft: 6 }}>{fmtPct(d.cash_pct)}</span>
        </div>
        <div className="sub" style={cashSeverity ? { color: cashSeverity } : undefined}>
          floor {fmtPct(d.cash_floor_pct)} of NAV
          {d.cash_pct < d.cash_floor_pct
            ? " — BELOW FLOOR"
            : d.cash_pct < d.cash_floor_pct + 0.05
              ? " — near floor"
              : ""}
        </div>
      </div>
      <div className="stat">
        <div className="label">Portfolio Heat</div>
        <div className="value">
          {fmtPct(d.portfolio_heat_pct)}{" "}
          <span className={`badge ${HEAT_BADGE[d.heat_state]}`}>{d.heat_state}</span>
        </div>
        <div className="sub">total open risk if every stop is hit</div>
      </div>
      <div className="stat">
        <div className="label">Max New Risk</div>
        <div className="value">{fmtUsd(d.max_new_risk_usd)}</div>
        <div className="sub">{fmtPct(d.max_new_risk_pct)} of NAV available</div>
      </div>
      <div className="stat">
        <div className="label">Market Regime</div>
        <div className="value" style={{ fontSize: 15 }}>{d.market_regime}</div>
      </div>
      <div className="stat">
        <div className="label">Trading</div>
        <div className="value">
          <span className={`badge ${d.trading_enabled ? "green" : "amber"}`}>
            {d.trading_enabled ? "ENABLED" : "PAUSED"}
          </span>
        </div>
        <div className="sub">
          <Link href="/" style={{ color: "var(--accent)" }}>
            Dashboard controls →
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * §14 vol targeting — how much NEW risk budgets are scaled by forecast vs
 * target vol. Amber when the multiplier is scaling risk down (< 1×).
 */
function VolTargetingLine({ v }: { v: VolTargeting }) {
  const scalingDown = v.multiplier < 1;
  return (
    <p
      style={{
        color: scalingDown ? "var(--amber)" : "var(--text-dim)",
        fontSize: 12,
        fontFamily: "var(--font-mono)",
        margin: "-4px 0 16px",
      }}
      title={v.note}
    >
      {v.forecast_vol == null
        ? `Vol targeting: no open positions — multiplier ${fmtMultiplier(v.multiplier)}`
        : `Vol targeting: forecast ${fmtVol(v.forecast_vol)} vs target ${fmtVol(v.target_vol)} → multiplier ${fmtMultiplier(v.multiplier)}`}
      <span style={{ color: "var(--text-dim)" }}>
        {" "}· max {fmtMultiplier(v.max_multiplier)} · hard risk caps always apply
      </span>
    </p>
  );
}

/** §16 / §36 — portfolio-level Net Delta / Gamma / Theta / Vega, always shown. */
function GreeksPanel({ d }: { d: PortfolioRisk }) {
  const g = d.greeks;
  if (g == null) return null; // older backend without the §16 contract additions
  // Theta limit is a fraction of NAV; flag decay once it burns past HALF the cap.
  const thetaLimitUsd = g.limits.max_net_theta_pct_nav * d.nav;
  const thetaRed =
    g.net_theta_usd_per_day < 0 &&
    Math.abs(g.net_theta_usd_per_day) > thetaLimitUsd / 2;
  const deltaBreached =
    Math.abs(g.delta_notional_pct_nav) > g.limits.max_delta_notional_pct_nav;
  return (
    <div className="panel">
      <h2>Portfolio Greeks</h2>
      {g.breaches.map((b, i) => (
        <div className="banner breach" key={i} style={{ marginBottom: 8 }}>
          {b}
        </div>
      ))}
      <div className="statbar" style={{ marginBottom: 12 }}>
        <div className="stat">
          <div className="label">Net Delta</div>
          <div className="value">{fmtShares(g.net_delta_shares)}</div>
          <div className="sub">equivalent shares</div>
        </div>
        <div className="stat">
          <div className="label">Delta-Adj Notional</div>
          <div
            className="value"
            style={deltaBreached ? { color: "var(--red)" } : undefined}
          >
            {fmtUsd(g.delta_adjusted_notional_usd)}
          </div>
          <div className="sub" style={deltaBreached ? { color: "var(--red)" } : undefined}>
            {fmtPct(g.delta_notional_pct_nav)} of NAV · limit{" "}
            {fmtPct(g.limits.max_delta_notional_pct_nav)}
            {deltaBreached ? " — BREACH" : ""}
          </div>
        </div>
        <div className="stat">
          <div className="label">Net Gamma</div>
          <div className="value">{fmtGreek(g.net_gamma)}</div>
          <div className="sub">Δ shares per $1 spot move</div>
        </div>
        <div className="stat">
          <div className="label">Net Theta</div>
          <div className="value" style={thetaRed ? { color: "var(--red)" } : undefined}>
            {fmtUsd(g.net_theta_usd_per_day, 2)}
          </div>
          <div className="sub" style={thetaRed ? { color: "var(--red)" } : undefined}>
            $/day decay · limit {fmtPct(g.limits.max_net_theta_pct_nav)} of NAV
            {thetaRed ? " — past half the limit" : ""}
          </div>
        </div>
        <div className="stat">
          <div className="label">Net Vega</div>
          <div className="value">{fmtUsd(g.net_vega_usd, 2)}</div>
          <div className="sub">
            $ per IV pt · limit {fmtPct(g.limits.max_net_vega_pct_nav)} of NAV
          </div>
        </div>
      </div>
      {g.per_position.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Instrument</th>
                <th className="num">Equiv. shares</th>
                <th className="num">Delta notional</th>
                <th className="num">Gamma</th>
                <th className="num">Theta/day</th>
                <th className="num">Vega</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {g.per_position.map((p) => (
                <tr
                  key={`${p.ticker}-${p.instrument}`}
                  style={p.data_ok ? undefined : { opacity: 0.55 }}
                >
                  <td className="ticker">{p.ticker}</td>
                  <td>
                    <span className={`badge ${instrumentBadge(p.instrument)}`}>
                      {p.instrument}
                    </span>
                  </td>
                  <td className="num">{fmtShares(p.equivalent_shares)}</td>
                  <td className="num">{fmtUsd(p.delta_notional_usd)}</td>
                  <td className="num">{fmtGreek(p.gamma)}</td>
                  <td className="num">{fmtUsd(p.theta_usd_per_day, 2)}</td>
                  <td className="num">{fmtUsd(p.vega_usd, 2)}</td>
                  <td>
                    {p.data_ok ? (
                      ""
                    ) : (
                      <span
                        style={{
                          color: "var(--text-dim)",
                          fontStyle: "italic",
                          whiteSpace: "nowrap",
                        }}
                      >
                        no chain data
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No open positions — portfolio Greeks are flat.</p>
      )}
    </div>
  );
}

function BucketsPanel({ d }: { d: PortfolioRisk }) {
  return (
    <div className="panel">
      <h2>Correlation buckets</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
        STATIC buckets are configured groups; DYNAMIC buckets are connected components of
        rolling 60-day correlation &gt; 0.70 among open-position tickers, computed from
        stored bars (§12.4).
      </p>
      {d.buckets.length > 0 ? (
        d.buckets.map((b) => {
          // utilization_pct is a FRACTION of the cap (1.0 = cap fully used).
          const utilPct = b.utilization_pct * 100;
          const sev = utilizationSeverity(utilPct);
          const width = Math.max(0, Math.min(100, utilPct));
          return (
            <div className="bucket" key={b.name}>
              <div className="bucket-head">
                <span className="name">
                  {b.name}{" "}
                  <span
                    className={`badge ${(b.kind ?? "STATIC") === "DYNAMIC" ? "accent" : "dim"}`}
                    title={
                      (b.kind ?? "STATIC") === "DYNAMIC"
                        ? "Computed from rolling 60d correlation > 0.70 among open positions (§12.4)"
                        : "Configured bucket"
                    }
                  >
                    {b.kind ?? "STATIC"}
                  </span>
                </span>
                <span className="figures">
                  risk {fmtUsd(b.risk_usd)} · {fmtPct(b.risk_pct)} of NAV · cap{" "}
                  {fmtPct(b.cap_pct)} · {fmtPct(b.utilization_pct, 0)} used
                </span>
              </div>
              <div
                className={`meter-track ${sev}`}
                role="meter"
                aria-valuenow={utilPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${b.name} bucket: ${fmtPct(b.risk_pct)} of NAV risk against a ${fmtPct(b.cap_pct)} cap`}
              >
                <div className={`meter-fill ${sev}`} style={{ width: `${width}%` }} />
              </div>
              <div className="bucket-members">
                {b.tickers.length > 0 ? b.tickers.join(" · ") : "no members"}
              </div>
            </div>
          );
        })
      ) : (
        <p className="empty">No correlation buckets configured.</p>
      )}
    </div>
  );
}

function PositionsPanel({ d }: { d: PortfolioRisk }) {
  return (
    <div className="panel">
      <h2>Open positions</h2>
      {d.positions.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="num">Qty</th>
                <th className="num">Avg price</th>
                <th className="num">Market price</th>
                <th className="num">Market value</th>
                <th className="num">Max loss</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {d.positions.map((p) => (
                <tr key={p.ticker}>
                  <td className="ticker">{p.ticker}</td>
                  <td className="num">{p.quantity.toLocaleString()}</td>
                  <td className="num">{fmtUsd(p.avg_price, 2)}</td>
                  <td className="num">{p.market_price == null ? NO_DATA : fmtUsd(p.market_price, 2)}</td>
                  <td className="num">{p.market_value == null ? NO_DATA : fmtUsd(p.market_value)}</td>
                  <td className="num" style={{ color: "var(--red)" }}>
                    {fmtUsd(p.max_loss)}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(p.opened_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No open positions — paper execution arrives in Phase 6.</p>
      )}
    </div>
  );
}

function LimitsPanel({ d }: { d: PortfolioRisk }) {
  return (
    <div className="panel">
      <h2>Hard limits</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 12, marginBottom: 12 }}>
        Configured caps enforced by the risk engine — read-only here; every veto they cause
        is audited.
      </p>
      <table>
        <thead>
          <tr>
            <th>Limit</th>
            <th className="num">Value</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {LIMIT_ROWS.map((r) => (
            <tr key={r.key}>
              <td style={{ whiteSpace: "nowrap" }}>{r.label}</td>
              <td className="num">{fmtPct(d.limits[r.key])}</td>
              <td style={{ color: "var(--text-dim)", fontFamily: "inherit" }}>{r.meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------- strategy health */

const HEALTH_BADGE: Record<StrategyHealthStatus, "dim" | "green" | "amber" | "red"> = {
  INSUFFICIENT_DATA: "dim",
  HEALTHY: "green",
  WARNING: "amber",
  PAUSE_RECOMMENDED: "red",
};

/** null → em dash, otherwise fmtUsd (the API sends null where a stat is undefined). */
function usdOrDash(v: number | null): string {
  return v == null ? "—" : fmtUsd(v);
}

function pnlColor(v: number): string | undefined {
  if (v > 0) return "var(--green)";
  if (v < 0) return "var(--red)";
  return undefined;
}

function StrategyHealthPanel({
  health,
  errorMessage,
}: {
  health: StrategyHealth | undefined;
  errorMessage?: string;
}) {
  return (
    <div className="panel">
      <h2>Strategy Health</h2>
      {errorMessage !== undefined ? (
        <p className="error">Strategy health unavailable: {errorMessage}</p>
      ) : health === undefined ? (
        <p className="empty">Loading strategy health…</p>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            <span className={`badge ${HEALTH_BADGE[health.status]}`}>
              {health.status.replace(/_/g, " ")}
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
              {health.trade_count} closed trade{health.trade_count === 1 ? "" : "s"} of{" "}
              {health.min_trades_for_judgement} needed for judgement · as of{" "}
              {new Date(health.as_of).toLocaleString()}
            </span>
          </div>
          <div className="kv" style={{ marginBottom: 12 }}>
            <div>
              <div className="k">Win rate</div>
              {/* win_rate is a FRACTION of closed trades (0.55 = 55%). */}
              <div className="v">{health.win_rate == null ? "—" : fmtPct(health.win_rate)}</div>
            </div>
            <div>
              <div className="k">Profit factor</div>
              <div className="v">
                {health.profit_factor == null ? "—" : health.profit_factor.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="k">Expectancy / trade</div>
              <div className="v">{usdOrDash(health.expectancy_usd)}</div>
            </div>
            <div>
              <div className="k">Avg win</div>
              <div className="v">{usdOrDash(health.avg_win_usd)}</div>
            </div>
            <div>
              <div className="k">Avg loss</div>
              <div className="v">{usdOrDash(health.avg_loss_usd)}</div>
            </div>
            <div>
              <div className="k">Gross profit</div>
              <div className="v" style={{ color: "var(--green)" }}>
                {fmtUsd(health.gross_profit_usd)}
              </div>
            </div>
            <div>
              <div className="k">Gross loss</div>
              <div className="v" style={{ color: "var(--red)" }}>
                {fmtUsd(health.gross_loss_usd)}
              </div>
            </div>
            <div>
              <div className="k">Cumulative P&amp;L</div>
              <div className="v" style={{ color: pnlColor(health.cumulative_pnl_usd) }}>
                {fmtUsd(health.cumulative_pnl_usd)}
              </div>
            </div>
            <div>
              <div className="k">Max drawdown</div>
              <div className="v">{fmtUsd(health.max_drawdown_usd)}</div>
            </div>
            <div>
              <div className="k">Current drawdown</div>
              <div className="v">{fmtUsd(health.current_drawdown_usd)}</div>
            </div>
          </div>
          {health.explanations.length > 0 && (
            <ul className="why-list" style={{ marginBottom: 12 }}>
              {health.explanations.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          <p style={{ color: "var(--text-dim)", fontSize: 12 }}>
            Rolling stats over closed paper trades — pause automation arrives in a later
            phase.
          </p>
        </>
      )}
    </div>
  );
}

function RiskDecisionsPanel({
  events,
  errorMessage,
}: {
  events: AuditEvent[] | undefined;
  errorMessage?: string;
}) {
  const decisions = (events ?? []).filter((e) => e.action === "RISK_DECISION");
  return (
    <div className="panel">
      <h2>Recent risk decisions</h2>
      {errorMessage !== undefined ? (
        <p className="error">Audit trail unavailable: {errorMessage}</p>
      ) : events === undefined ? (
        <p className="empty">Loading audit events…</p>
      ) : decisions.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Ticker</th>
                <th>Decision</th>
                <th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {decisions.slice(0, 20).map((e) => {
                const { decision, reasons } = decisionFromDetails(e.details);
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(e.ts).toLocaleString()}</td>
                    <td className="ticker">{e.entity_id}</td>
                    <td>
                      {decision ? (
                        <span className={`badge ${DECISION_BADGE[decision]}`}>{decision}</span>
                      ) : (
                        <span className="badge dim">UNKNOWN</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-dim)" }}>
                      {reasons ||
                        (Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          No risk decisions yet — generate a Trade Plan on a symbol page to see one.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export default function RiskPage() {
  const risk = useQuery({ queryKey: ["portfolio-risk"], queryFn: api.portfolio.risk });
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit.list() });
  const health = useQuery({ queryKey: ["strategy-health"], queryFn: api.health.strategy });

  return (
    <>
      <h1>Risk</h1>
      <p className="subtitle">
        NAV, cash floor, Portfolio Heat, portfolio Greeks, and correlation buckets — the
        page that decides whether new risk is allowed.
      </p>

      {risk.isPending ? (
        <div className="panel">
          <p className="empty">Loading portfolio risk…</p>
        </div>
      ) : risk.isError ? (
        <div className="panel">
          <p className="error">Portfolio risk unavailable: {risk.error.message}</p>
        </div>
      ) : (
        <>
          <p className="datasource">
            as of {new Date(risk.data.as_of).toLocaleString()}
          </p>
          <StatTiles d={risk.data} />
          {risk.data.vol_targeting != null && (
            <VolTargetingLine v={risk.data.vol_targeting} />
          )}
          <GreeksPanel d={risk.data} />
          <BucketsPanel d={risk.data} />
          <PositionsPanel d={risk.data} />
          <LimitsPanel d={risk.data} />
        </>
      )}

      <StrategyHealthPanel
        health={health.data}
        errorMessage={health.isError ? health.error.message : undefined}
      />

      <RiskDecisionsPanel
        events={audit.data}
        errorMessage={audit.isError ? audit.error.message : undefined}
      />
    </>
  );
}
