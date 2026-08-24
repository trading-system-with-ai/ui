/**
 * A version mismatch between the two repositories must be VISIBLE.
 *
 * The frontend and backend ship separately, so they can legitimately run
 * different versions. Without a check the symptom is an empty panel: a field
 * the API stopped sending reads as `undefined` in TypeScript, which the type
 * checker cannot catch and the UI renders as nothing.
 */
import { describe, expect, it } from "vitest";
import { EXPECTED_API_VERSION, apiVersionMismatch } from "../api";

describe("API version", () => {
  it("expects a major version, not a full version string", () => {
    // Comparing majors means an ADDITIVE backend release (1.0 -> 1.1) does not
    // raise a false alarm, while a breaking one (1.x -> 2.0) does.
    expect(EXPECTED_API_VERSION).toMatch(/^\d+$/);
  });

  it("reports no mismatch before any response has been seen", () => {
    // Claiming a mismatch on no evidence would be its own dishonest empty
    // state — "we have not looked yet" is not "the versions differ".
    expect(apiVersionMismatch()).toBeNull();
  });
});
