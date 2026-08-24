/**
 * Event date-status badge helper (2026-08-20 crash fix): the backend
 * struct must never reach React as a child, CONFIRMED must not show a
 * warning chip, and ESTIMATED must name its source.
 */
import { describe, expect, it } from "vitest";
import { badgeInfo } from "./eventStatusBadge";

describe("badgeInfo", () => {
  it("CONFIRMED struct → no chip (a confirmed date must not cry wolf)", () => {
    const r = badgeInfo({
      status: "CONFIRMED", is_estimated: false,
      source: "GOVERNMENT_AGENCY", source_name: "bea", note: null,
    });
    expect(r.show).toBe(false);
  });

  it("ESTIMATED struct → chip with status + source, note as title", () => {
    const r = badgeInfo({
      status: "ESTIMATED", is_estimated: true,
      source: "SEC_EDGAR", source_name: "sec_edgar",
      note: "derived from 8-K cadence",
    });
    expect(r.show).toBe(true);
    expect(r.text).toBe("ESTIMATED (sec_edgar)");
    expect(r.title).toBe("derived from 8-K cadence");
  });

  it("legacy bare string still renders", () => {
    const r = badgeInfo("ESTIMATED");
    expect(r.show).toBe(true);
    expect(r.text).toBe("ESTIMATED");
  });

  it("null/empty → no chip", () => {
    expect(badgeInfo(null).show).toBe(false);
    expect(badgeInfo("").show).toBe(false);
    expect(badgeInfo(undefined).show).toBe(false);
  });
});
