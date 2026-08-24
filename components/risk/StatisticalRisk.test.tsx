/**
 * Phase B statistical risk layer (SHADOW) — component tests against a fixture
 * that mirrors the §6 gateway contract exactly, INCLUDING the shapes that are
 * easiest to render dishonestly:
 *   - a VaR row with value_usd null / health UNAVAILABLE and a reason string;
 *   - a null dispersion, null distribution and null vol-contribution block;
 *   - a drawdown block with n=1 (no scheduled snapshots yet);
 *   - data_quality.valid false with server reasons;
 *   - positions_excluded with a reason.
 *
 * What these tests pin (the rules that are cheap to break in a refactor):
 *   1. §6 — no VaR/ES number is ever shown without its method label.
 *   2. Honest nulls — a null value renders an em dash plus the server reason,
 *      never 0 and never another model's number.
 *   3. *_pct fields are FRACTIONS (0.0076 → "0.76%").
 *   4. SHADOW is stated on screen, not just in a comment.
 *   5. Server strings (reasons) render verbatim.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { DrawdownBlock, StatisticalRisk } from "@/lib/types";
import {
  DrawdownPanel,
  RiskContributionPanel,
  StatisticalRiskPanel,
  StatisticalStatTiles,
} from "./StatisticalRisk";

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
});

/** §6 contract fixture — real shapes, honest nulls, one UNAVAILABLE row. */
function fixture(overrides: Partial<StatisticalRisk> = {}): StatisticalRisk {
  return {
    mode: "SHADOW",
    snapshot_id: 123,
    snapshot_version: "b.1",
    as_of: "2026-08-18T14:03:11+00:00",
    stale: false,
    pnl_method: "DELTA_LINEAR",
    n_obs: 598,
    window_start: "2024-03-21",
    window_end: "2026-08-14",
    data_quality: { valid: true, reasons: [], tickers_missing: [], keys_excluded: [] },
    model_health: {
      historical_var: "ACTIVE",
      historical_es: "ACTIVE",
      gaussian_var: "ACTIVE",
      gaussian_es: "DEGRADED",
    },
    model_risk: { state: "ELEVATED", reasons: ["gaussian_es DEGRADED: small tail: k=6"] },
    dispersion: {
      ratio: 1.62,
      high: true,
      min_model: "gaussian_var",
      max_model: "historical_var",
      n_comparable: 3,
      health: "ACTIVE",
      reason: null,
    },
    distribution: {
      primary: "HEAVY_TAIL",
      flags: ["HEAVY_TAIL"],
      skew: -0.12,
      excess_kurtosis: 1.8,
      jarque_bera: 3.1,
      jb_p: 0.21,
      gaussian_trust: "LOW",
      n: 598,
      health: "ACTIVE",
      reason: null,
    },
    volatility: {
      value_usd: 1234.5,
      pct_nav: 0.0124,
      annualized_pct_nav: 0.197,
      health: "ACTIVE",
      reason: null,
      sample_size: 598,
      model_name: "portfolio_volatility",
      model_version: "1.0.0",
    },
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
      },
      {
        model: "GAUSSIAN",
        model_name: "gaussian_var",
        model_version: "1.0.0",
        distribution: "NORMAL",
        confidence: 0.95,
        horizon_days: 1,
        value_usd: 690.4,
        pct_nav: 0.0069,
        health: "ACTIVE",
        reason: null,
        sample_size: 598,
        tail_size: null,
        scaling: null,
      },
      {
        // Honest null: the estimator could not run, so there is no number.
        model: "HISTORICAL_VOL_SCALED",
        model_name: "conditional_var",
        model_version: "1.0.0",
        distribution: "EMPIRICAL_VOL_SCALED",
        confidence: 0.95,
        horizon_days: 1,
        value_usd: null,
        pct_nav: null,
        health: "UNAVAILABLE",
        reason: "n=17 < min_obs=60",
        sample_size: 17,
        tail_size: null,
        scaling: null,
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
      },
      {
        model: "GAUSSIAN",
        model_name: "gaussian_es",
        model_version: "1.0.0",
        distribution: "NORMAL",
        confidence: 0.95,
        horizon_days: 1,
        value_usd: 865.2,
        pct_nav: 0.0087,
        health: "DEGRADED",
        reason: "gaussian trust LOW: excess kurtosis 1.80",
        sample_size: 598,
        tail_size: null,
        scaling: null,
      },
    ],
    contributions: {
      es: {
        confidence: 0.95,
        total_usd: 919.9,
        pct_nav: 0.0092,
        health: "ACTIVE",
        reason: null,
        rows: [
          {
            key: "AAPL#12",
            ticker: "AAPL",
            instrument: "LONG_STOCK",
            contribution_usd: 512.3,
            share: 0.557,
            capital_weight: 0.31,
          },
          {
            key: "NVDA#7",
            ticker: "NVDA",
            instrument: "LONG_CALL",
            contribution_usd: 407.6,
            share: 0.443,
            capital_weight: 0.69,
          },
        ],
      },
      vol: null,
    },
    positions_excluded: [
      { key: "NVDA#3", reason: "no delta (contract missing from today's chain)" },
    ],
    ...overrides,
  };
}

function drawdownFixture(overrides: Partial<DrawdownBlock> = {}): DrawdownBlock {
  return {
    nav_series: { n: 3, since: "2026-08-14", source: "risk_snapshots SCHEDULED" },
    current_pct: -0.012,
    max_pct: -0.031,
    peak_date: "2026-08-15",
    trough_date: "2026-08-17",
    peak_nav: 100000,
    health: "ACTIVE",
    reason: null,
    reconstructed: {
      label: "RECONSTRUCTED_CURRENT_BOOK",
      current_pct: -0.02,
      max_pct: -0.09,
      n_obs: 598,
      health: "ACTIVE",
      reason: null,
    },
    ...overrides,
  };
}

function renderWithLang(node: React.ReactElement) {
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

describe("StatisticalStatTiles — Phase E active forecaster (§13/§58)", () => {
  it("names the forecaster on the conditional-vol tile when the payload says which ran", () => {
    const s = fixture();
    renderWithLang(
      <StatisticalStatTiles
        s={{ ...s, volatility: { ...s.volatility!, forecaster: "EWMA" } }}
        drawdown={null}
      />,
    );
    expect(screen.getByText(/forecaster EWMA/)).toBeTruthy();
  });

  it("marks a GARCH forecaster as research — it must not read as accepted", () => {
    const s = fixture();
    renderWithLang(
      <StatisticalStatTiles
        s={{ ...s, volatility: { ...s.volatility!, forecaster: "GARCH" } }}
        drawdown={null}
      />,
    );
    expect(screen.getByText(/forecaster GARCH-research/)).toBeTruthy();
  });

  it("reads the forecaster out of diagnostics when there is no dedicated field", () => {
    const s = fixture();
    renderWithLang(
      <StatisticalStatTiles
        s={{
          ...s,
          volatility: { ...s.volatility!, diagnostics: { source: "EWMA", half_life: 11.2 } },
        }}
        drawdown={null}
      />,
    );
    expect(screen.getByText(/forecaster EWMA/)).toBeTruthy();
  });

  it("names NO forecaster when the backend sends none (pre-Phase-E payload)", () => {
    // The base fixture's model_name is "portfolio_volatility" — the plain
    // sample sigma, which identifies no conditional forecaster at all. The
    // tile must stay silent rather than guess one.
    renderWithLang(<StatisticalStatTiles s={fixture()} drawdown={null} />);
    expect(screen.queryByText(/forecaster/i)).toBeNull();
    // …and the tile itself still renders with its annualized sub-line.
    expect(screen.getByText("Conditional Vol σ (1D)")).toBeTruthy();
    expect(screen.getByText(/annualized/)).toBeTruthy();
  });
});

describe("StatisticalStatTiles (§6 methodology labels, §50 explainer)", () => {
  it("labels every VaR/ES tile with its model — never a bare 'VaR'", () => {
    renderWithLang(<StatisticalStatTiles s={fixture()} drawdown={drawdownFixture()} />);
    expect(screen.getByText("Historical VaR 95% 1D")).toBeTruthy();
    expect(screen.getByText("Historical ES 95% 1D")).toBeTruthy();
    expect(screen.getByText("Gaussian VaR 95% 1D")).toBeTruthy();
    expect(screen.getByText("Conditional Vol σ (1D)")).toBeTruthy();
    expect(screen.getByText("Current Drawdown")).toBeTruthy();
    expect(screen.getByText("Model Risk")).toBeTruthy();
    // No tile is labelled with an unqualified "VaR".
    expect(screen.queryByText("VaR")).toBeNull();
  });

  it("renders values as USD with pct_nav treated as a FRACTION, plus the sample line", () => {
    renderWithLang(<StatisticalStatTiles s={fixture()} drawdown={null} />);
    expect(screen.getByText("$755")).toBeTruthy();
    // 0.0076 is a fraction → 0.76%, not 0.01%.
    expect(screen.getByText("0.76%")).toBeTruthy();
    expect(screen.getAllByText("n=598, tail 30").length).toBeGreaterThan(0);
  });

  it("the explainer modal shows model, confidence, horizon, lookback, source and health", async () => {
    const user = userEvent.setup();
    renderWithLang(<StatisticalStatTiles s={fixture()} drawdown={null} />);
    await user.click(
      screen.getByRole("button", { name: "How is Historical VaR 95% 1D calculated?" }),
    );
    const dialog = screen.getByRole("dialog");
    const text = dialog.textContent ?? "";
    expect(text).toContain("HISTORICAL VaR (historical_var)");
    expect(text).toContain("95%");
    expect(text).toContain("1 trading day");
    expect(text).toContain("598 obs · 2024-03-21 → 2026-08-14");
    expect(text).toContain("EMPIRICAL");
    expect(text).toContain("stock_bars_daily, DELTA_LINEAR book P&L");
    expect(text).toContain("1.0.0");
    expect(text).toContain("ACTIVE");
    // Advanced diagnostics.
    expect(text).toContain("Tail size (k)");
    expect(text).toContain("Excess kurtosis");
    expect(text).toContain("Model dispersion");
    // SHADOW disclaimer travels with the methodology card.
    expect(text).toContain("does not alter trading decisions yet");
  });

  it("a drawdown tile with no snapshots renders a dash, not a zero", () => {
    renderWithLang(
      <StatisticalStatTiles
        s={fixture()}
        drawdown={drawdownFixture({
          nav_series: { n: 1, since: "2026-08-18", source: "risk_snapshots SCHEDULED" },
          current_pct: null,
          max_pct: null,
          peak_date: null,
          trough_date: null,
          peak_nav: null,
          health: "UNAVAILABLE",
          reason: "n=1 < 2 observations",
          reconstructed: null,
        })}
      />,
    );
    expect(screen.getByText("Current Drawdown")).toBeTruthy();
    expect(screen.queryByText("0.00%")).toBeNull();
  });
});

describe("StatisticalRiskPanel (§39/§40/§41)", () => {
  it("shows the SHADOW badge and states that it changes nothing", () => {
    renderWithLang(<StatisticalRiskPanel s={fixture()} />);
    expect(screen.getAllByText("SHADOW").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/does not alter trading decisions yet/).length,
    ).toBeGreaterThan(0);
  });

  it("lists every var and es row with its model, and both 95% and 99% confidences", () => {
    renderWithLang(<StatisticalRiskPanel s={fixture()} />);
    // The metrics table: 4 var + 2 es rows plus its header (the excluded
    // positions table below has its own rows, so scope the query to this one).
    const metrics = screen.getByText("Tail k").closest("table")!;
    expect(within(metrics).getAllByRole("row").length).toBe(7);
    expect(screen.getAllByText(/HISTORICAL VaR/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/GAUSSIAN ES/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("99%").length).toBe(1);
  });

  it("an UNAVAILABLE row shows an em dash and the server reason verbatim — never 0", () => {
    renderWithLang(<StatisticalRiskPanel s={fixture()} />);
    const reason = screen.getByText("n=17 < min_obs=60");
    const row = reason.closest("tr")!;
    expect(within(row).getByText("UNAVAILABLE")).toBeTruthy();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(within(row).queryByText("$0")).toBeNull();
  });

  it("reports model disagreement with the MODEL_DISPERSION_HIGH flag, never an average", () => {
    renderWithLang(<StatisticalRiskPanel s={fixture()} />);
    expect(
      screen.getByText(/historical_var ÷ gaussian_var = 1.62× across 3 views/),
    ).toBeTruthy();
    expect(screen.getByText("MODEL_DISPERSION_HIGH")).toBeTruthy();
  });

  it("shows the distribution line and the model-risk state with its real reasons", () => {
    renderWithLang(<StatisticalRiskPanel s={fixture()} />);
    expect(screen.getByText("HEAVY_TAIL")).toBeTruthy();
    expect(screen.getByText(/skew -0.12 · excess kurtosis 1.80/)).toBeTruthy();
    expect(screen.getByText("Gaussian trust LOW")).toBeTruthy();
    expect(screen.getByText("ELEVATED")).toBeTruthy();
    expect(screen.getByText("gaussian_es DEGRADED: small tail: k=6")).toBeTruthy();
  });

  it("names every excluded position with its reason", () => {
    renderWithLang(<StatisticalRiskPanel s={fixture()} />);
    expect(screen.getByText("NVDA#3")).toBeTruthy();
    expect(
      screen.getByText("no delta (contract missing from today's chain)"),
    ).toBeTruthy();
  });

  it("stale snapshot raises an amber pill", () => {
    renderWithLang(<StatisticalRiskPanel s={fixture({ stale: true })} />);
    const pill = screen.getByText("stale snapshot");
    expect(pill.className).toContain("amber");
  });

  it("data_quality.valid false shows the server reasons", () => {
    renderWithLang(
      <StatisticalRiskPanel
        s={fixture({
          data_quality: {
            valid: false,
            reasons: ["stale bars for 3 of 4 open positions"],
            tickers_missing: ["TSLA"],
            keys_excluded: ["TSLA#9"],
          },
        })}
      />,
    );
    expect(screen.getByText("data quality INVALID")).toBeTruthy();
    expect(screen.getByText("stale bars for 3 of 4 open positions")).toBeTruthy();
    expect(screen.getByText(/tickers missing history: TSLA/)).toBeTruthy();
  });

  it("null dispersion and null distribution degrade to honest sentences, not blanks", () => {
    renderWithLang(<StatisticalRiskPanel s={fixture({ dispersion: null, distribution: null })} />);
    expect(
      screen.getByText(/fewer than two models produced a positive value/),
    ).toBeTruthy();
    expect(screen.getByText(/not computed for this snapshot/)).toBeTruthy();
    expect(screen.queryByText("MODEL_DISPERSION_HIGH")).toBeNull();
  });
});

describe("RiskContributionPanel (§10/§49 capital weight vs risk weight)", () => {
  it("renders one row per position with both weights and the two comparison bars", () => {
    const { container } = renderWithLang(<RiskContributionPanel s={fixture()} />);
    expect(screen.getByText("AAPL")).toBeTruthy();
    expect(screen.getByText("NVDA")).toBeTruthy();
    expect(screen.getByText("LONG_CALL")).toBeTruthy();
    // Capital weight 31% vs ES risk share 55.7% — the distinction is visible.
    expect(screen.getByText("31.0%")).toBeTruthy();
    expect(screen.getByText("55.7%")).toBeTruthy();
    // Two CSS-only bars per row, no chart library.
    expect(container.querySelectorAll(".rc-bar-fill.capital").length).toBe(2);
    expect(container.querySelectorAll(".rc-bar-fill.risk").length).toBe(2);
  });

  it("the totals row reconciles to the block total_usd", () => {
    renderWithLang(<RiskContributionPanel s={fixture()} />);
    const total = screen.getByText("TOTAL").closest("tr")!;
    // 512.3 + 407.6 = 919.9 = contributions.es.total_usd.
    expect(within(total).getByText("$920")).toBeTruthy();
  });

  it("a missing vol block leaves dashes rather than borrowing the ES numbers", () => {
    renderWithLang(<RiskContributionPanel s={fixture()} />);
    const aapl = screen.getByText("AAPL").closest("tr")!;
    expect(within(aapl).getByText("$512")).toBeTruthy();
    expect(within(aapl).getAllByText("—").length).toBe(1);
  });

  it("no contributions at all → an honest empty state", () => {
    renderWithLang(
      <RiskContributionPanel s={fixture({ contributions: { es: null, vol: null } })} />,
    );
    expect(screen.getByText(/No risk contributions/)).toBeTruthy();
  });
});

describe("DrawdownPanel (§45)", () => {
  it("separates the live NAV drawdown from the labelled reconstructed one", () => {
    renderWithLang(
      <DrawdownPanel
        d={drawdownFixture()}
        asOf="2026-08-18T14:03:11+00:00"
        dataSource="stock_bars_daily, DELTA_LINEAR book P&L"
      />,
    );
    expect(screen.getByText("Live NAV series")).toBeTruthy();
    expect(screen.getByText(/Reconstructed \(today's book over the window\)/)).toBeTruthy();
    expect(screen.getByText("RECONSTRUCTED_CURRENT_BOOK")).toBeTruthy();
    expect(screen.getByText(/not realized history/i)).toBeTruthy();
    // -0.012 is a fraction → -1.20%.
    expect(screen.getByText("-1.20%")).toBeTruthy();
    expect(screen.getByText("n=3 since 2026-08-14")).toBeTruthy();
  });

  it("fewer than two snapshots → the honest empty state, not a zero drawdown", () => {
    renderWithLang(
      <DrawdownPanel
        d={drawdownFixture({
          nav_series: { n: 1, since: "2026-08-18", source: "risk_snapshots SCHEDULED" },
          current_pct: null,
          max_pct: null,
          peak_date: null,
          trough_date: null,
          peak_nav: null,
          health: "UNAVAILABLE",
          reason: "n=1 < 2 observations",
          reconstructed: null,
        })}
        asOf="2026-08-18T14:03:11+00:00"
        dataSource="stock_bars_daily, DELTA_LINEAR book P&L"
      />,
    );
    expect(
      screen.getByText(/drawdown accrues from the first daily snapshot/),
    ).toBeTruthy();
    // Server reason, verbatim.
    expect(screen.getByText("n=1 < 2 observations")).toBeTruthy();
    expect(screen.queryByText("0.00%")).toBeNull();
    expect(screen.getByText(/No reconstructed drawdown/)).toBeTruthy();
  });
});

describe("Chinese rendering", () => {
  it("renders the SHADOW panel in Simplified Chinese when lang=zh", () => {
    window.localStorage.setItem("lang", "zh");
    renderWithLang(<StatisticalRiskPanel s={fixture()} />);
    expect(screen.getByText("统计风险")).toBeTruthy();
    expect(screen.getAllByText(/影子模式/).length).toBeGreaterThan(0);
    // Server strings stay verbatim even in Chinese.
    expect(screen.getByText("gaussian_es DEGRADED: small tail: k=6")).toBeTruthy();
  });

  it("translates the estimator family and health tokens (total enum table)", () => {
    window.localStorage.setItem("lang", "zh");
    renderWithLang(<StatisticalRiskPanel s={fixture()} />);
    // The method label still travels with every number, in Chinese.
    expect(screen.getAllByText(/历史法 VaR/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/高斯法 ES/).length).toBeGreaterThan(0);
    // Health tokens are mapped, not left as raw English.
    expect(screen.getAllByText("不可用").length).toBeGreaterThan(0);
    expect(screen.getAllByText("运行中").length).toBeGreaterThan(0);
  });
});

/**
 * REGRESSION (QA, Phase B verify): a book whose P&L series has ~zero variance
 * makes the backend report distribution.primary "UNSTABLE" with skew /
 * excess_kurtosis / jarque_bera / jb_p ALL null (see
 * libs/trading_core/risk/models/diagnostics.py: they are `float | None`, and
 * `0/0` has no value). The panel used to call `.toFixed()` on them straight
 * and threw "Cannot read properties of null", blanking the whole risk page.
 * `model_risk` is likewise null when the ensemble estimator itself failed.
 */
describe("honest nulls inside a non-null distribution / model_risk", () => {
  const unstable = fixture({
    distribution: {
      primary: "UNSTABLE",
      flags: ["UNSTABLE"],
      skew: null,
      excess_kurtosis: null,
      jarque_bera: null,
      jb_p: null,
      gaussian_trust: "LOW",
      n: 100,
      health: "UNAVAILABLE",
      reason: "variance ~ 0 (m2=0.0 <= 1e-18) over n=100",
    },
    model_risk: null,
  });

  it("renders an UNSTABLE distribution without crashing, with em dashes not zeros", () => {
    renderWithLang(<StatisticalRiskPanel s={unstable} />);
    expect(screen.getByText("UNSTABLE")).toBeTruthy();
    // No fabricated 0.00 / 0.000 stood in for a null statistic.
    expect(screen.queryByText(/skew 0\.00/)).toBeNull();
    expect(screen.queryByText(/偏度 0\.00/)).toBeNull();
  });

  it("renders a null model_risk as 'not computed', never as a LOW badge", () => {
    renderWithLang(<StatisticalRiskPanel s={unstable} />);
    expect(screen.queryByText("LOW", { selector: ".badge.green" })).toBeNull();
  });
});

/* --------------------------------- §34 diversification + §11 factor share */

/**
 * Both are additive display-only blocks. What matters is that an
 * UNMEASURABLE number shows the server's own reason instead of a fabricated
 * figure: "not measured" and "no diversification" / "no market exposure"
 * are different facts, and only the server knows which one applies.
 */
describe("diversification ratio + factor share", () => {
  it("renders both numbers when the backend sends them", () => {
    renderWithLang(
      <StatisticalRiskPanel
        s={fixture({
          diversification_ratio: {
            value: 1.36,
            health: "ACTIVE",
            reason: null,
          },
          factor: {
            portfolio_beta: 2.5,
            explained_variance_share: 0.8,
            idiosyncratic_share: 0.2,
            factor: "SPY",
            n: 142,
            health: "ACTIVE",
            reason: null,
          },
        })}
      />,
    );

    expect(screen.getByText(/1\.36× \(1\.00 = none\)/)).toBeDefined();
    expect(screen.getByText(/80% of book variance · β 2\.50/)).toBeDefined();
    // RESEARCH is stated on screen — one step BELOW shadow.
    expect(screen.getAllByText("RESEARCH").length).toBeGreaterThan(0);
  });

  it("shows the server reason, not a number, when the factor is unmeasurable", () => {
    const reason =
      "no stored SPY bars (0 found); the factor series is unavailable, which is not a statement about this book's market exposure";
    renderWithLang(
      <StatisticalRiskPanel
        s={fixture({
          factor: {
            portfolio_beta: null,
            explained_variance_share: null,
            idiosyncratic_share: null,
            factor: "SPY",
            n: 0,
            health: "UNAVAILABLE",
            reason,
          },
        })}
      />,
    );

    expect(screen.getByText(reason)).toBeDefined();
    // A null must never be rendered as a 0% market exposure.
    expect(screen.queryByText(/0% of book variance/)).toBeNull();
  });

  it("renders NOTHING when the backend predates both blocks", () => {
    renderWithLang(<StatisticalRiskPanel s={fixture()} />);
    expect(screen.queryByText(/1\.00 = none/)).toBeNull();
    expect(screen.queryByText(/of book variance/)).toBeNull();
  });
});


// ---------------------------------------------------------------------------
// 2026-08-20 crash regression: the dispersion BLOCK can be present with a
// NULL ratio (health UNAVAILABLE, e.g. the empty book after the §40 stress
// view joined the set) — every render site must guard the fields, not just
// the block (Runtime TypeError: Cannot read properties of null (toFixed)).
// ---------------------------------------------------------------------------
describe("dispersion with a null ratio (UNAVAILABLE)", () => {
  const unavailableDispersion = {
    ratio: null,
    high: false,
    min_model: null,
    max_model: null,
    n_comparable: 0,
    health: "UNAVAILABLE" as const,
    reason: "only 0 comparable view(s) < min_views=2 (of 3 offered)",
  };

  it("renders the page without crashing and shows the server reason verbatim", () => {
    const s = fixture({ dispersion: unavailableDispersion });
    renderWithLang(
      <>
        <StatisticalStatTiles s={s} drawdown={null} />
        <StatisticalRiskPanel s={s} />
      </>,
    );
    expect(
      screen.getAllByText(/only 0 comparable view\(s\) < min_views=2/).length,
    ).toBeGreaterThanOrEqual(1);
    // No fabricated number anywhere near the disagreement line.
    expect(screen.queryByText(/NaN|null×|undefined/)).toBeNull();
  });
});
