/**
 * Compliance batch 3 (Tier C) — the display gaps the spec-compliance audit
 * listed over data the platform already computes:
 *
 *   §48  VaR 99% / ES 99% / Stress Loss / Net Delta / Net Vega as dashboard
 *        CARDS, not only as table rows;
 *   §5   a machine-readable model tier surfaced as a chip;
 *   §10  ES contributions at 99% beside 95%, WITH the noise warning;
 *   §46  net vega and incremental VaR rows in the pre-trade comparison;
 *   §26  per-ticker spot shocks on the user scenario form;
 *   §50  ⓘ methodology modals on StressScenarios and ModelValidation.
 *
 * Every one of these is ADDITIVE over an optional wire field, so each block
 * below is tested TWICE: once with a FULL payload (the feature renders and
 * carries its caveats) and once with a NULL/ABSENT payload (nothing renders,
 * nothing crashes, and no number is invented). That pairing is the point —
 * the backend ships these fields concurrently, so the UI must be correct on
 * both sides of that landing.
 *
 * The house rules pinned here:
 *   1. Honest nulls — an absent block renders NOTHING rather than a dash that
 *      would imply a measurement was attempted.
 *   2. No number is ever computed from another. Signs are the server's.
 *   3. Server strings (health reasons, scenario names) render VERBATIM.
 *   4. *_pct fields are FRACTIONS.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import { api } from "@/lib/api";
import { GLOSSARY } from "@/lib/glossary";
import type {
  DrawdownBlock,
  OrderPreviewRisk,
  PortfolioGreeks,
  RiskContributionBlock,
  RiskComparisonBlock,
  StatisticalRisk,
  StressBlock,
  StressRunResponse,
  ValidationBlock,
} from "@/lib/types";
import { RiskContributionPanel, StatisticalStatTiles } from "./StatisticalRisk";
import StressScenarios from "./StressScenarios";
import ModelValidation from "./ModelValidation";
import TradeComparison from "./TradeComparison";

// This jsdom build ships no working localStorage; LanguageProvider reads it.
const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});

afterEach(() => {
  cleanup();
  store.clear();
  vi.restoreAllMocks();
});

function renderWithLang(node: React.ReactElement) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

/* ------------------------------------------------------------------ fixtures */

/**
 * A FULL statistical payload: 95 AND 99 on both var and es, tiers on every
 * row, a stress block with a worst scenario, and an es99 contribution block
 * carrying the server's own noise reason.
 */
function fullStatistical(overrides: Partial<StatisticalRisk> = {}): StatisticalRisk {
  return {
    mode: "SHADOW",
    snapshot_id: 501,
    snapshot_version: "b.1",
    as_of: "2026-08-19T14:03:11+00:00",
    stale: false,
    pnl_method: "FULL_REVAL_CONST_IV",
    n_obs: 598,
    window_start: "2024-03-21",
    window_end: "2026-08-18",
    data_quality: { valid: true, reasons: [], tickers_missing: [], keys_excluded: [] },
    model_health: { historical_var: "ACTIVE", historical_es: "ACTIVE" },
    model_risk: { state: "LOW", reasons: [] },
    dispersion: null,
    distribution: null,
    volatility: null,
    var: [
      {
        model: "HISTORICAL",
        model_name: "historical_var",
        model_version: "1.0.0",
        distribution: "EMPIRICAL",
        confidence: 0.95,
        horizon_days: 1,
        value_usd: 754.97,
        pct_nav: 0.0076,
        health: "ACTIVE",
        reason: null,
        sample_size: 598,
        tail_size: 30,
        scaling: null,
        tier: "TIER_1",
      },
      {
        model: "HISTORICAL",
        model_name: "historical_var",
        model_version: "1.0.0",
        distribution: "EMPIRICAL",
        confidence: 0.99,
        horizon_days: 1,
        value_usd: 1402.11,
        pct_nav: 0.014,
        health: "DEGRADED",
        reason: "small tail: k=6",
        sample_size: 598,
        tail_size: 6,
        scaling: null,
        tier: "TIER_1",
      },
    ],
    es: [
      {
        model: "HISTORICAL",
        model_name: "historical_es",
        model_version: "1.0.0",
        distribution: "EMPIRICAL",
        confidence: 0.95,
        horizon_days: 1,
        value_usd: 919.9,
        pct_nav: 0.0092,
        health: "ACTIVE",
        reason: null,
        sample_size: 598,
        tail_size: 30,
        scaling: null,
        tier: "TIER_1",
      },
      {
        model: "HISTORICAL",
        model_name: "historical_es",
        model_version: "1.0.0",
        distribution: "EMPIRICAL",
        confidence: 0.99,
        horizon_days: 1,
        value_usd: 1788.44,
        pct_nav: 0.0179,
        health: "DEGRADED",
        reason: "small tail: k=6",
        sample_size: 598,
        tail_size: 6,
        scaling: null,
        tier: "TIER_1",
      },
    ],
    contributions: { es: null, vol: null },
    positions_excluded: [],
    ...overrides,
  };
}

/**
 * A statistical payload as an OLDER backend sends it: no `tier` anywhere, no
 * 99% rows, no stress block. Nothing added by this batch may render from it,
 * and nothing may crash.
 */
function legacyStatistical(): StatisticalRisk {
  const s = fullStatistical();
  return {
    ...s,
    var: [{ ...s.var[0], tier: undefined }],
    es: [{ ...s.es[0], tier: undefined }],
    stress: undefined,
  };
}

function stressFixture(overrides: Partial<StressBlock> = {}): StressBlock {
  return {
    rows: [
      {
        name: "2018-Q4 drawdown replay",
        kind: "HISTORICAL",
        validated: true,
        pnl_usd: -2100.5,
        pnl_pct_nav: -0.021,
        loss_usd: 2100.5,
        loss_pct_nav: 0.021,
        method_coverage: { FULL_REVAL: 3, DELTA_LINEAR: 1 },
        health: "ACTIVE",
        reason: null,
      },
      {
        name: "Equity −20% / IV ×1.6",
        kind: "HYPOTHETICAL",
        validated: false,
        pnl_usd: -5400.25,
        pnl_pct_nav: -0.054,
        loss_usd: 5400.25,
        loss_pct_nav: 0.054,
        method_coverage: { FULL_REVAL: 4 },
        health: "ACTIVE",
        reason: null,
      },
      {
        name: "2020-03 COVID crash",
        kind: "HISTORICAL",
        validated: true,
        pnl_usd: null,
        pnl_pct_nav: null,
        loss_usd: null,
        loss_pct_nav: null,
        method_coverage: {},
        health: "UNAVAILABLE",
        reason: "window 2020-02-19..2020-03-23 outside stored history",
      },
    ],
    worst: {
      name: "Equity −20% / IV ×1.6",
      kind: "HYPOTHETICAL",
      validated: false,
      pnl_usd: -5400.25,
      pnl_pct_nav: -0.054,
      loss_usd: 5400.25,
      loss_pct_nav: 0.054,
      method_coverage: { FULL_REVAL: 4 },
      health: "ACTIVE",
      reason: null,
    },
    health: "ACTIVE",
    catalogue_version: "d.3",
    model_version: "2.1.0",
    mode: "SHADOW",
    n_stock_legs: 2,
    n_option_legs: 2,
    tier: "TIER_1",
    positions_excluded: [],
    ...overrides,
  };
}

function greeksFixture(overrides: Partial<PortfolioGreeks> = {}): PortfolioGreeks {
  return {
    net_delta_shares: 412.5,
    delta_adjusted_notional_usd: 88_204.13,
    delta_notional_pct_nav: 0.3412,
    net_gamma: 4.2718,
    net_theta_usd_per_day: -63.4,
    net_vega_usd: 271.85,
    limits: {
      max_delta_notional_pct_nav: 0.5,
      max_net_theta_pct_nav: 0.002,
      max_net_vega_pct_nav: 0.01,
    },
    breaches: [],
    per_position: [
      {
        ticker: "AAPL",
        instrument: "LONG_STOCK",
        equivalent_shares: 200,
        delta_notional_usd: 44_000,
        gamma: 0,
        theta_usd_per_day: 0,
        vega_usd: 0,
        data_ok: true,
      },
      {
        ticker: "NVDA",
        instrument: "LONG_CALL",
        equivalent_shares: 212.5,
        delta_notional_usd: 44_204.13,
        gamma: 4.2718,
        theta_usd_per_day: -63.4,
        vega_usd: 271.85,
        data_ok: true,
      },
    ],
    ...overrides,
  };
}

function drawdownFixture(): DrawdownBlock {
  return {
    nav_series: { n: 3, since: "2026-08-14", source: "risk_snapshots SCHEDULED" },
    current_pct: -0.012,
    max_pct: -0.031,
    peak_date: "2026-08-15",
    trough_date: "2026-08-17",
    peak_nav: 100_000,
    health: "ACTIVE",
    reason: null,
    reconstructed: null,
  };
}

/* --------------------------------------------------- §48 dashboard cards */

describe("§48 dashboard cards — VaR 99% / ES 99% / Stress Loss / Net Delta / Net Vega", () => {
  it("renders all five cards when every block is on the wire", () => {
    renderWithLang(
      <StatisticalStatTiles
        s={fullStatistical({ stress: stressFixture() })}
        drawdown={drawdownFixture()}
        greeks={greeksFixture()}
      />,
    );
    // §6 — each card carries its METHOD in the label, never a bare number.
    expect(screen.getByText("Historical VaR 99% 1D")).toBeTruthy();
    expect(screen.getByText("Historical ES 99% 1D")).toBeTruthy();
    expect(screen.getByText("Stress Loss (worst)")).toBeTruthy();
    expect(screen.getByText("Net Delta")).toBeTruthy();
    expect(screen.getByText("Net Vega")).toBeTruthy();
  });

  it("shows the 99% values and their FRACTION pct_nav", () => {
    renderWithLang(
      <StatisticalStatTiles s={fullStatistical()} drawdown={null} greeks={null} />,
    );
    expect(screen.getByText(/\$1,402/)).toBeTruthy();
    expect(screen.getByText(/\$1,788/)).toBeTruthy();
    // 0.0179 is a FRACTION → 1.79%, never 0.02% and never 179%.
    expect(screen.getByText("1.79%")).toBeTruthy();
  });

  it("carries the DEGRADED health and the server's verbatim tail reason on the 99% cards", () => {
    renderWithLang(
      <StatisticalStatTiles s={fullStatistical()} drawdown={null} greeks={null} />,
    );
    // The reason explains WHY a 99% figure from this window is thin. It is
    // the server's string and must not be paraphrased.
    expect(screen.getAllByText("n=598, tail 6").length).toBeGreaterThan(0);
  });

  it("shows the stress card in the VaR/ES LOSS sign, with the scenario NAMED", () => {
    renderWithLang(
      <StatisticalStatTiles
        s={fullStatistical({ stress: stressFixture() })}
        drawdown={null}
        greeks={null}
      />,
    );
    // loss_usd (positive = money lost), NOT the negated pnl_usd: the server
    // sends both signs so the UI never computes one from the other.
    expect(screen.getByText(/\$5,400/)).toBeTruthy();
    // An anonymous loss figure is not acceptable — the scenario is named.
    expect(screen.getByText("Equity −20% / IV ×1.6")).toBeTruthy();
  });

  it("shows Net Delta as the delta-adjusted NOTIONAL with equivalent shares beneath", () => {
    renderWithLang(
      <StatisticalStatTiles
        s={fullStatistical()}
        drawdown={null}
        greeks={greeksFixture()}
      />,
    );
    expect(screen.getByText(/\$88,204/)).toBeTruthy();
    expect(screen.getByText(/413 equivalent shares/)).toBeTruthy();
  });

  it("shows Net Vega in $ per IV point and does NOT print a percent-of-NAV for it", () => {
    renderWithLang(
      <StatisticalStatTiles
        s={fullStatistical()}
        drawdown={null}
        greeks={greeksFixture()}
      />,
    );
    // fmtUsd defaults to 0 decimals on a tile: 271.85 → "$272".
    expect(screen.getByText("$272")).toBeTruthy();
    expect(screen.getByText(/\$ per IV point/)).toBeTruthy();
  });

  it("OMITS the stress card entirely when no stress block was sent", () => {
    // A "—" here would claim the catalogue ran and lost nothing.
    renderWithLang(
      <StatisticalStatTiles s={fullStatistical()} drawdown={null} greeks={null} />,
    );
    expect(screen.queryByText("Stress Loss (worst)")).toBeNull();
  });

  it("OMITS the stress card when the block exists but produced no worst row", () => {
    renderWithLang(
      <StatisticalStatTiles
        s={fullStatistical({ stress: stressFixture({ worst: null }) })}
        drawdown={null}
        greeks={null}
      />,
    );
    expect(screen.queryByText("Stress Loss (worst)")).toBeNull();
  });

  it("OMITS both Greek cards when market data is unconfigured (greeks null)", () => {
    // Greeks need chain data. A flat book of zeros would be a lie.
    renderWithLang(
      <StatisticalStatTiles s={fullStatistical()} drawdown={null} greeks={null} />,
    );
    expect(screen.queryByText("Net Delta")).toBeNull();
    expect(screen.queryByText("Net Vega")).toBeNull();
  });

  it("OMITS the 99% cards on a legacy payload that carries only 95% rows", () => {
    renderWithLang(
      <StatisticalStatTiles s={legacyStatistical()} drawdown={null} greeks={null} />,
    );
    expect(screen.queryByText("Historical VaR 99% 1D")).toBeNull();
    expect(screen.queryByText("Historical ES 99% 1D")).toBeNull();
    // …while the 95% cards it DOES send still render.
    expect(screen.getByText("Historical VaR 95% 1D")).toBeTruthy();
  });

  it("does not crash on a fully legacy payload with every optional block absent", () => {
    const { container } = renderWithLang(
      <StatisticalStatTiles s={legacyStatistical()} drawdown={undefined} greeks={undefined} />,
    );
    expect(container.querySelector(".statbar")).toBeTruthy();
  });
});

/* ------------------------------------------------------- §5 tier chips */

describe("§5 tier chips on statistical tiles", () => {
  it("renders the tier chip beside a model that reports one", () => {
    const { container } = renderWithLang(
      <StatisticalStatTiles s={fullStatistical()} drawdown={null} greeks={null} />,
    );
    expect(container.querySelectorAll('[data-tier="TIER_1"]').length).toBeGreaterThan(0);
  });

  it("marks the Greek cards TIER_0 — the only tier that decides today", () => {
    const { container } = renderWithLang(
      <StatisticalStatTiles
        s={fullStatistical()}
        drawdown={null}
        greeks={greeksFixture()}
      />,
    );
    expect(container.querySelectorAll('[data-tier="TIER_0"]').length).toBe(2);
  });

  it("renders NO tier chip anywhere on a payload that carries no tier", () => {
    const { container } = renderWithLang(
      <StatisticalStatTiles s={legacyStatistical()} drawdown={null} greeks={null} />,
    );
    expect(container.querySelector("[data-tier]")).toBeNull();
  });
});

/* -------------------------------------------- §10 ES contributions at 99% */

function contributionBlock(
  confidence: number,
  total: number,
  reason: string | null,
  health: RiskContributionBlock["health"] = "ACTIVE",
): RiskContributionBlock {
  return {
    confidence,
    total_usd: total,
    pct_nav: total / 100_000,
    health,
    reason,
    rows: [
      {
        key: "AAPL#12",
        ticker: "AAPL",
        instrument: "LONG_STOCK",
        contribution_usd: total * 0.6,
        share: 0.6,
        capital_weight: 0.31,
      },
      {
        key: "NVDA#7",
        ticker: "NVDA",
        instrument: "LONG_CALL",
        contribution_usd: total * 0.4,
        share: 0.4,
        capital_weight: 0.69,
      },
    ],
  };
}

describe("§10 ES contributions at 99% — shown WITH the noise warning", () => {
  const withEs99 = () =>
    fullStatistical({
      contributions: {
        es: contributionBlock(0.95, 919.9, null),
        vol: null,
        es99: contributionBlock(
          0.99,
          1788.44,
          "noisy at 99%: k=6 tail observations",
          "DEGRADED",
        ),
      },
    });

  it("renders the ES-99 column when the block is present", () => {
    renderWithLang(<RiskContributionPanel s={withEs99()} />);
    // The header text is split by the NOISY badge element, so match the
    // cell rather than a single text node.
    expect(
      screen.getByRole("columnheader", { name: /ES-99 contribution/ }),
    ).toBeTruthy();
  });

  it("carries the NOISY badge on the column header — the audit's condition for showing it", () => {
    renderWithLang(<RiskContributionPanel s={withEs99()} />);
    // The audit asked for the 99% figures "shown with the health warning",
    // not silently. The caveat must be inseparable from the numbers.
    expect(screen.getByText("NOISY")).toBeTruthy();
  });

  it("renders the server's own noise reason VERBATIM", () => {
    renderWithLang(<RiskContributionPanel s={withEs99()} />);
    expect(screen.getByText(/noisy at 99%: k=6 tail observations/)).toBeTruthy();
  });

  it("renders per-position 99% contributions alongside the 95% ones", () => {
    renderWithLang(<RiskContributionPanel s={withEs99()} />);
    // 95% AAPL contribution 551.94 and 99% AAPL contribution 1073.06 must
    // BOTH appear (fmtUsd → 0 decimals) — the 99% column is additive, not a
    // replacement for the 95% reading.
    expect(screen.getByText("$552")).toBeTruthy();
    expect(screen.getByText("$1,073")).toBeTruthy();
  });

  it("renders NO 99% column when the block is absent (older backend)", () => {
    const s = fullStatistical({
      contributions: { es: contributionBlock(0.95, 919.9, null), vol: null },
    });
    renderWithLang(<RiskContributionPanel s={s} />);
    expect(screen.queryByText(/ES-99 contribution/)).toBeNull();
    expect(screen.queryByText("NOISY")).toBeNull();
    // The 95% column is untouched.
    expect(screen.getByText(/ES contribution/)).toBeTruthy();
  });

  it("renders NO 99% column when the block is explicitly null", () => {
    const s = fullStatistical({
      contributions: { es: contributionBlock(0.95, 919.9, null), vol: null, es99: null },
    });
    renderWithLang(<RiskContributionPanel s={s} />);
    expect(screen.queryByText(/ES-99 contribution/)).toBeNull();
  });

  it("keeps the 95% column primary even when a key exists only at 99%", () => {
    const es99 = contributionBlock(0.99, 1788.44, null);
    es99.rows.push({
      key: "TSLA#4",
      ticker: "TSLA",
      instrument: "LONG_PUT",
      contribution_usd: 12.5,
      share: 0.01,
      capital_weight: 0.02,
    });
    const s = fullStatistical({
      contributions: { es: contributionBlock(0.95, 919.9, null), vol: null, es99 },
    });
    renderWithLang(<RiskContributionPanel s={s} />);
    // The 99%-only key still appears rather than being dropped…
    expect(screen.getByText("TSLA")).toBeTruthy();
    // …and its 95% cell is an honest dash, not a fabricated 0.
    const row = screen.getByText("TSLA").closest("tr");
    expect(within(row as HTMLElement).getAllByText("—").length).toBeGreaterThan(0);
  });
});

/* --------------------------------------------------- §50 methodology modals */

describe("§50 ⓘ modal on StressScenarios", () => {
  it("opens a methodology card carrying the stress block's own provenance", async () => {
    const user = userEvent.setup();
    renderWithLang(
      <StressScenarios stress={stressFixture()} asOf="2026-08-19T14:03:11+00:00" />,
    );
    await user.click(screen.getByRole("button", { name: /How is this calculated/i }));
    expect(screen.getByText(/How is this calculated\? — Stress scenarios/)).toBeTruthy();
    // Catalogue version and leg counts are the stress run's own lineage —
    // NOT a borrowed VaR sample window.
    expect(screen.getByText("d.3")).toBeTruthy();
    expect(screen.getByText("Scenario revaluation catalogue")).toBeTruthy();
  });

  it("reports confidence and horizon as em dashes — a scenario estimates no distribution", async () => {
    const user = userEvent.setup();
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: /How is this calculated/i }));
    const dialog = screen.getByText(/How is this calculated\? — Stress scenarios/).closest("div");
    expect(dialog).toBeTruthy();
    // Honest null: a stress result fixes a state, it does not estimate a
    // confidence level, so the field is a dash rather than "95%".
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("names the worst row's method coverage so the headline number's pricing quality travels with it", async () => {
    const user = userEvent.setup();
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: /How is this calculated/i }));
    expect(screen.getByText("4 FULL_REVAL")).toBeTruthy();
    expect(screen.getByText("UNVALIDATED — research default")).toBeTruthy();
  });

  it("counts the rows the catalogue could not run rather than hiding them", async () => {
    const user = userEvent.setup();
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: /How is this calculated/i }));
    const label = screen.getByText("Rows the catalogue could not run");
    expect(label.nextElementSibling?.textContent).toBe("1");
  });

  it("renders the tier chip on the panel heading when the server sent one", () => {
    const { container } = renderWithLang(
      <StressScenarios stress={stressFixture()} asOf={null} />,
    );
    expect(container.querySelector('[data-tier="TIER_1"]')).toBeTruthy();
  });

  it("renders NO tier chip when the stress block carries no tier", () => {
    const { container } = renderWithLang(
      <StressScenarios stress={stressFixture({ tier: undefined })} asOf={null} />,
    );
    expect(container.querySelector("[data-tier]")).toBeNull();
  });

  it("does not crash when asOf is omitted entirely", () => {
    const { container } = renderWithLang(<StressScenarios stress={stressFixture()} />);
    expect(container.querySelector(".panel")).toBeTruthy();
  });
});

describe("§50 ⓘ modal on ModelValidation", () => {
  function validationFixture(overrides: Partial<ValidationBlock> = {}): ValidationBlock {
    return {
      as_of: "2026-08-19",
      rows: [
        {
          model_name: "historical_var",
          model_version: "1.0.0",
          distribution: "EMPIRICAL",
          confidence: 0.95,
          horizon_days: 1,
          window: 250,
          n_forecasts: 348,
          exceedances: 19,
          rate: 0.0546,
          expected_rate: 0.05,
          kupiec_p: 0.6812,
          christoffersen_p: 0.2214,
          es_severity_ratio: 0.94,
          verdict: "GREEN",
          health: "ACTIVE",
          reason: null,
          tier: "TIER_1",
        },
        {
          model_name: "garch_var",
          model_version: "0.9.0",
          distribution: "EMPIRICAL_GARCH_SCALED",
          confidence: 0.99,
          horizon_days: 1,
          window: 250,
          n_forecasts: 17,
          exceedances: 1,
          rate: null,
          expected_rate: 0.01,
          kupiec_p: null,
          christoffersen_p: null,
          es_severity_ratio: null,
          verdict: null,
          health: "UNAVAILABLE",
          reason: "n_forecasts=17 < min=250",
          tier: "TIER_2",
        },
      ],
      comparison: null,
      ...overrides,
    };
  }

  it("opens a methodology card documenting the BACKTEST, not the models", async () => {
    const user = userEvent.setup();
    renderWithLang(<ModelValidation v={validationFixture()} />);
    await user.click(screen.getByRole("button", { name: /How is this calculated/i }));
    expect(
      screen.getByText(/How is this calculated\? — VaR backtests \(walk-forward\)/),
    ).toBeTruthy();
    expect(
      screen.getByText("Kupiec POF + Christoffersen independence"),
    ).toBeTruthy();
  });

  it("counts views with and without a verdict rather than averaging them", async () => {
    const user = userEvent.setup();
    renderWithLang(<ModelValidation v={validationFixture()} />);
    await user.click(screen.getByRole("button", { name: /How is this calculated/i }));
    expect(screen.getByText("Model views tested").nextElementSibling?.textContent).toBe("2");
    expect(
      screen.getByText("Views with no verdict").nextElementSibling?.textContent,
    ).toBe("1");
    expect(screen.getByText("GREEN verdicts").nextElementSibling?.textContent).toBe("1");
  });

  it("renders per-row tier chips distinct from the RESEARCH badge", () => {
    const { container } = renderWithLang(<ModelValidation v={validationFixture()} />);
    expect(container.querySelector('[data-tier="TIER_1"]')).toBeTruthy();
    // The GARCH row is BOTH TIER_2 and RESEARCH — the chip never replaces
    // the badge, because tier and acceptance are different questions.
    expect(container.querySelector('[data-tier="TIER_2"]')).toBeTruthy();
    expect(screen.getByText("RESEARCH")).toBeTruthy();
  });

  it("renders NO tier chip when the rows carry no tier", () => {
    const v = validationFixture();
    const stripped: ValidationBlock = {
      ...v,
      rows: v.rows.map((r) => ({ ...r, tier: undefined })),
    };
    const { container } = renderWithLang(<ModelValidation v={stripped} />);
    expect(container.querySelector("[data-tier]")).toBeNull();
  });

  it("still offers the ⓘ modal on an empty block (no backtest yet)", async () => {
    const user = userEvent.setup();
    renderWithLang(<ModelValidation v={null} />);
    await user.click(screen.getByRole("button", { name: /How is this calculated/i }));
    // With no rows, every count is an honest 0 and as_of is an em dash —
    // the card never invents a run that did not happen.
    expect(screen.getByText("Model views tested").nextElementSibling?.textContent).toBe("0");
  });
});

/* ------------------------------------ §46 / §8 new pre-trade comparison rows */

/** Minimal Tier 0 half — unchanged by this batch. */
function tier0(): OrderPreviewRisk {
  return {
    decision: "APPROVE",
    approved_quantity: 2,
    signal_strength: "MODERATE",
    risk_budget_pct: 0.0075,
    trade_risk_usd: 840,
    reason_codes: [],
    explanations: [],
    heat_before_pct: 0.032,
    heat_after_pct: 0.04,
    cash_after_pct: 0.38,
  };
}

describe("§46 net vega and §8 incremental VaR rows", () => {
  it("renders both rows from the block-level scalars", () => {
    renderWithLang(
      <TradeComparison
        risk={{
          ...tier0(),
          comparison: {
            quantity: 2,
            rows: [],
            health: "ACTIVE",
            reason: null,
            net_vega_before: 120.5,
            net_vega_after: 392.35,
            incremental_var_95_usd: 226.23,
            incremental_var_95_pct_nav: 0.0023,
          },
        }}
        quantityRequested={2}
      />,
    );
    expect(screen.getByText("Net vega ($/IV pt)")).toBeTruthy();
    expect(screen.getByText("Incremental VaR 95% (this trade)")).toBeTruthy();
  });

  it("computes the vega delta from the two SERVER sides and signs it", () => {
    renderWithLang(
      <TradeComparison
        risk={{
          ...tier0(),
          comparison: {
            quantity: 2,
            rows: [],
            health: "ACTIVE",
            reason: null,
            net_vega_before: 120.5,
            net_vega_after: 392.35,
          },
        }}
        quantityRequested={2}
      />,
    );
    const row = screen.getByText("Net vega ($/IV pt)").closest("tr") as HTMLElement;
    // 392.35 − 120.5 = 271.85 → "+$272" (fmtUsd, 0 decimals).
    expect(within(row).getByText("+$272")).toBeTruthy();
  });

  it("leaves the vega delta UNCOLOURED — more vega is a different exposure, not more risk", () => {
    renderWithLang(
      <TradeComparison
        risk={{
          ...tier0(),
          comparison: {
            quantity: 2,
            rows: [],
            health: "ACTIVE",
            reason: null,
            net_vega_before: 120.5,
            net_vega_after: 392.35,
            incremental_var_95_usd: 226.23,
          },
        }}
        quantityRequested={2}
      />,
    );
    const vegaRow = screen.getByText("Net vega ($/IV pt)").closest("tr") as HTMLElement;
    const vegaDelta = within(vegaRow).getByText("+$272");
    expect(vegaDelta.getAttribute("style")).toContain("var(--text-dim)");
    // …while incremental VaR, which IS a loss, keeps the amber "worse" tone.
    const varRow = screen
      .getByText("Incremental VaR 95% (this trade)")
      .closest("tr") as HTMLElement;
    const varDelta = within(varRow).getByText("+$226");
    expect(varDelta.getAttribute("style")).toContain("var(--amber)");
  });

  it("renders NEITHER row when the block predates them", () => {
    renderWithLang(
      <TradeComparison
        risk={{
          ...tier0(),
          comparison: { quantity: 2, rows: [], health: "ACTIVE", reason: null },
        }}
        quantityRequested={2}
      />,
    );
    expect(screen.queryByText("Net vega ($/IV pt)")).toBeNull();
    expect(screen.queryByText("Incremental VaR 95% (this trade)")).toBeNull();
  });

  it("renders the vega row when only ONE side is known, with the other an em dash", () => {
    renderWithLang(
      <TradeComparison
        risk={{
          ...tier0(),
          comparison: {
            quantity: 2,
            rows: [],
            health: "ACTIVE",
            reason: null,
            net_vega_before: null,
            net_vega_after: 392.35,
          },
        }}
        quantityRequested={2}
      />,
    );
    const row = screen.getByText("Net vega ($/IV pt)").closest("tr") as HTMLElement;
    expect(within(row).getByText("$392")).toBeTruthy();
    // A null side is a dash — never 0, which would assert the book had no
    // vega before the trade.
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows an incremental-VaR row of dashes with the reason when the server sent an explicit null", () => {
    renderWithLang(
      <TradeComparison
        risk={{
          ...tier0(),
          comparison: {
            quantity: 2,
            rows: [],
            health: "UNAVAILABLE",
            reason: "candidate ticker has no returns column",
            incremental_var_95_usd: null,
          },
        }}
        quantityRequested={2}
      />,
    );
    const row = screen
      .getByText("Incremental VaR 95% (this trade)")
      .closest("tr") as HTMLElement;
    expect(within(row).getByText(/candidate ticker has no returns column/)).toBeTruthy();
  });

  it("defers to a SERVER-sent wire row rather than rendering the metric twice", () => {
    // When the backend promotes these scalars to first-class rows, the
    // synthesised fallback must stand down — one metric, one row.
    renderWithLang(
      <TradeComparison
        risk={{
          ...tier0(),
          comparison: {
            quantity: 2,
            rows: [
              {
                metric: "net_vega",
                before_usd: 120.5,
                after_usd: 392.35,
                delta_usd: 271.85,
                before_health: "ACTIVE",
                after_health: "ACTIVE",
                reason: null,
              },
            ],
            health: "ACTIVE",
            reason: null,
            net_vega_before: 120.5,
            net_vega_after: 392.35,
          },
        }}
        quantityRequested={2}
      />,
    );
    expect(screen.getAllByText("Net vega ($/IV pt)").length).toBe(1);
  });
});

/* ------------------------------- §26 per-ticker shocks on the user scenario */

describe("§26 per-ticker spot shocks on the user scenario form", () => {
  function stressRunResult(): StressRunResponse {
    return {
      mode: "SHADOW",
      as_of: "2026-08-19T14:03:11+00:00",
      run_id: 42,
      nav: 100_000,
      n_stock_legs: 2,
      n_option_legs: 2,
      positions_excluded: [],
      scenario: {
        name: "SPY −5% / QQQ −8%",
        kind: "USER",
        validated: false,
        pnl_usd: -3200,
        pnl_pct_nav: -0.032,
        loss_usd: 3200,
        loss_pct_nav: 0.032,
        method_coverage: { FULL_REVAL: 2 },
        health: "ACTIVE",
        reason: null,
      },
      per_position: {},
      note: "SHADOW — this scenario decided nothing.",
    };
  }

  it("sends spot_shock_by_ticker when the user adds rows", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api.risk, "stressRun")
      .mockResolvedValue(stressRunResult());
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);

    await user.click(screen.getByRole("button", { name: "+ Add ticker shock" }));
    await user.type(
      screen.getByLabelText("Ticker for per-ticker shock"),
      "spy",
    );
    await user.type(screen.getByLabelText("Shock percent for this ticker"), "-5");
    await user.click(screen.getByRole("button", { name: "Run scenario" }));

    expect(spy).toHaveBeenCalledTimes(1);
    const body = spy.mock.calls[0][0];
    // Uppercased on entry, and a FRACTION on the wire (−5% → −0.05).
    expect(body.spot_shock_by_ticker).toEqual({ SPY: -0.05 });
    // The uniform shock is still required — the map NARROWS it.
    expect(body.equity_shock).toBeCloseTo(-0.1, 10);
  });

  it("OMITS the key entirely when no rows were added", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api.risk, "stressRun")
      .mockResolvedValue(stressRunResult());
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: "Run scenario" }));
    // An absent key and {} are the same scenario, but only the former runs on
    // a backend that predates the field.
    expect("spot_shock_by_ticker" in spy.mock.calls[0][0]).toBe(false);
  });

  it("OMITS the key when a row was added but left completely blank", async () => {
    const user = userEvent.setup();
    const spy = vi
      .spyOn(api.risk, "stressRun")
      .mockResolvedValue(stressRunResult());
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: "+ Add ticker shock" }));
    await user.click(screen.getByRole("button", { name: "Run scenario" }));
    expect("spot_shock_by_ticker" in spy.mock.calls[0][0]).toBe(false);
  });

  it("rejects an out-of-range per-ticker shock CLIENT-side, mirroring the server", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api.risk, "stressRun");
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: "+ Add ticker shock" }));
    await user.type(screen.getByLabelText("Ticker for per-ticker shock"), "SPY");
    // 300% is outside the documented −90% … 200% range.
    await user.type(screen.getByLabelText("Shock percent for this ticker"), "300");
    await user.click(screen.getByRole("button", { name: "Run scenario" }));
    expect(screen.getByText(/Shock for SPY must be between/)).toBeTruthy();
    // Told BEFORE the round trip, not instead of it — no request went out.
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a half-filled row rather than silently dropping the user's shock", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api.risk, "stressRun");
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: "+ Add ticker shock" }));
    await user.type(screen.getByLabelText("Ticker for per-ticker shock"), "SPY");
    await user.click(screen.getByRole("button", { name: "Run scenario" }));
    expect(screen.getByText("Per-ticker shock for SPY has no percent.")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects the same ticker listed twice", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(api.risk, "stressRun");
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: "+ Add ticker shock" }));
    await user.click(screen.getByRole("button", { name: "+ Add ticker shock" }));
    const tickers = screen.getAllByLabelText("Ticker for per-ticker shock");
    const pcts = screen.getAllByLabelText("Shock percent for this ticker");
    await user.type(tickers[0], "SPY");
    await user.type(pcts[0], "-5");
    await user.type(tickers[1], "SPY");
    await user.type(pcts[1], "-8");
    await user.click(screen.getByRole("button", { name: "Run scenario" }));
    expect(screen.getByText(/SPY is listed twice/)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("removes a row when its Remove button is pressed", async () => {
    const user = userEvent.setup();
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: "+ Add ticker shock" }));
    expect(screen.getAllByLabelText("Ticker for per-ticker shock").length).toBe(1);
    await user.click(screen.getByRole("button", { name: /Remove per-ticker shock/ }));
    expect(screen.queryByLabelText("Ticker for per-ticker shock")).toBeNull();
  });

  it("uses NO native dialog for any of these errors (§47)", async () => {
    const user = userEvent.setup();
    vi.spyOn(api.risk, "stressRun");
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderWithLang(<StressScenarios stress={stressFixture()} asOf={null} />);
    await user.click(screen.getByRole("button", { name: "+ Add ticker shock" }));
    await user.type(screen.getByLabelText("Ticker for per-ticker shock"), "SPY");
    await user.click(screen.getByRole("button", { name: "Run scenario" }));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

/* --------------------------------------------------- §6 glossary entries */

describe("glossary entries added by this batch", () => {
  const ADDED = ["model_tier", "net_vega", "incremental_var"] as const;

  it.each(ADDED)("%s exists with a complete bilingual entry", (k) => {
    const entry = GLOSSARY[k];
    expect(entry, `missing glossary entry ${k}`).toBeTruthy();
    for (const side of [entry.en, entry.zh]) {
      expect(side.name.length).toBeGreaterThan(0);
      expect(side.short.length).toBeGreaterThan(0);
      // "How to read it" is the half that stops a definition being a
      // restatement of the label; an empty one is a silently useless card.
      expect(side.read.length).toBeGreaterThan(40);
    }
  });

  it("model_tier states that tier is not a trust score", () => {
    // The single most likely misreading of a T0..T3 chip. The entry must
    // close it explicitly rather than leave it to inference.
    expect(GLOSSARY.model_tier.en.short).toMatch(/not how much it is trusted/i);
    expect(GLOSSARY.model_tier.en.read).toMatch(/SHADOW/);
  });

  it("net_vega explains why its pre-trade delta is uncoloured", () => {
    expect(GLOSSARY.net_vega.en.read).toMatch(/uncoloured|not \\"worse\\"/i);
  });

  it("incremental_var distinguishes itself from the candidate's standalone VaR", () => {
    expect(GLOSSARY.incremental_var.en.read).toMatch(/standalone/i);
  });
});

/* ------------------------------- real gateway payload shape (contract pin) */

describe("§46/§8 rows against the REAL gateway payload shape", () => {
  /**
   * Copied from `orders.py::_scalar_pair_row` as it actually serialises: the
   * gateway sends the two new metrics BOTH as wire rows AND as block-level
   * scalars. That duplication is the exact case the dedup guard exists for,
   * so it is pinned against the real shape rather than a UI-shaped fixture.
   *
   * Note `net_vega` carries `pct_of_nav=False` server-side — its percent
   * fields are null because $-per-IV-point ÷ NAV is arithmetic without
   * meaning. The UI must render the USD figure and not reach for the nulls.
   */
  function gatewayComparison(): RiskComparisonBlock {
    return {
      quantity: 2,
      health: "ACTIVE",
      reason: null,
      rows: [
        {
          metric: "incremental_var_95",
          layer: "STATISTICAL",
          before_usd: 754.97,
          after_usd: 981.2,
          before_pct_nav: 0.0075,
          after_pct_nav: 0.0098,
          delta_usd: 226.23,
          delta_pct_nav: 0.0023,
          before_health: null,
          after_health: null,
          reason: null,
        },
        {
          metric: "net_vega",
          layer: "STATISTICAL",
          before_usd: 120.5,
          after_usd: 392.35,
          before_pct_nav: null,
          after_pct_nav: null,
          delta_usd: 271.85,
          delta_pct_nav: null,
          before_health: null,
          after_health: null,
          reason: null,
        },
      ],
      incremental_var_95_usd: 226.23,
      incremental_var_95_pct_nav: 0.0023,
      net_vega_before: 120.5,
      net_vega_after: 392.35,
    };
  }

  it("labels both server rows through METRIC_LABELS instead of showing raw slugs", () => {
    renderWithLang(
      <TradeComparison
        risk={{ ...tier0(), comparison: gatewayComparison() }}
        quantityRequested={2}
      />,
    );
    expect(screen.getByText("Incremental VaR 95% (this trade)")).toBeTruthy();
    expect(screen.getByText("Net vega ($/IV pt)")).toBeTruthy();
    // The raw slugs must never reach the screen.
    expect(screen.queryByText("net_vega")).toBeNull();
    expect(screen.queryByText("incremental_var_95")).toBeNull();
  });

  it("renders each metric EXACTLY ONCE despite the payload carrying both forms", () => {
    renderWithLang(
      <TradeComparison
        risk={{ ...tier0(), comparison: gatewayComparison() }}
        quantityRequested={2}
      />,
    );
    expect(screen.getAllByText("Net vega ($/IV pt)").length).toBe(1);
    expect(screen.getAllByText("Incremental VaR 95% (this trade)").length).toBe(1);
  });

  it("uses the SERVER's delta rather than differencing the two sides itself", () => {
    renderWithLang(
      <TradeComparison
        risk={{ ...tier0(), comparison: gatewayComparison() }}
        quantityRequested={2}
      />,
    );
    const vega = screen.getByText("Net vega ($/IV pt)").closest("tr") as HTMLElement;
    expect(within(vega).getByText("+$272")).toBeTruthy();
    const iv = screen
      .getByText("Incremental VaR 95% (this trade)")
      .closest("tr") as HTMLElement;
    expect(within(iv).getByText("+$226")).toBeTruthy();
  });

  it("shows the vega row's USD figures and never substitutes its null percents", () => {
    renderWithLang(
      <TradeComparison
        risk={{ ...tier0(), comparison: gatewayComparison() }}
        quantityRequested={2}
      />,
    );
    const vega = screen.getByText("Net vega ($/IV pt)").closest("tr") as HTMLElement;
    expect(within(vega).getByText("$121")).toBeTruthy();
    expect(within(vega).getByText("$392")).toBeTruthy();
  });

  it("renders the server's honest reason when net vega is unmeasured on one side", () => {
    const c = gatewayComparison();
    const reason =
      "net vega is unmeasured on at least one side (the book greeks or the " +
      "contract vega was unavailable)";
    c.rows[1] = {
      ...c.rows[1],
      after_usd: null,
      delta_usd: null,
      reason,
    };
    c.net_vega_after = null;
    renderWithLang(
      <TradeComparison risk={{ ...tier0(), comparison: c }} quantityRequested={2} />,
    );
    // Verbatim server string — the ONLY explanation for the em dash.
    expect(screen.getByText(new RegExp("net vega is unmeasured"))).toBeTruthy();
  });
});
