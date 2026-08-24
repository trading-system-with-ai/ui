/**
 * Percent-unit regression tests (2026-08-15 audit): the backend mixes two
 * conventions — *_pct metric fields are ALREADY percent (77.03 = 77.03%),
 * while win_rate is a fraction (0.25 = 25%). The drawdown-chart bug family
 * came from mixing these up; these tests pin the metric-table half.
 */
import { describe, expect, it } from "vitest";
import { METRIC_ROWS, fmtPct } from "./backtest-metrics";

function rowFmt(key: string): (v: number | null) => string {
  const row = METRIC_ROWS.find((r) => r.key === key);
  if (!row) throw new Error(`no metric row ${key}`);
  return row.fmt;
}

describe("backtest metric percent units", () => {
  it("fmtPct takes already-percent numbers verbatim", () => {
    expect(fmtPct(77.03)).toBe("77.03%");
    expect(fmtPct(-34.67)).toBe("-34.67%");
    expect(fmtPct(19.13, true)).toBe("+19.13%");
    expect(fmtPct(null)).toBe("—");
  });

  it("*_pct rows render backend percents unscaled", () => {
    expect(rowFmt("total_return_pct")(77.03)).toBe("+77.03%");
    expect(rowFmt("max_drawdown_pct")(-34.67)).toBe("-34.67%");
    expect(rowFmt("exposure_pct")(29.0)).toBe("29.00%");
  });

  it("win_rate is a FRACTION and scales ×100 (0.25 → 25%, never 0.25%)", () => {
    expect(rowFmt("win_rate")(0.25)).toBe("25.00%");
    expect(rowFmt("win_rate")(0.3333333333333333)).toBe("33.33%");
    expect(rowFmt("win_rate")(null)).toBe("—");
  });
});
