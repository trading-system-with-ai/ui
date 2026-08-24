/**
 * §5 model-tier chip — the classification artefact the compliance audit found
 * missing. These tests pin the two rules that make the chip honest rather
 * than decorative:
 *
 *   1. NO TIER → NO CHIP. A backend that predates the taxonomy sends no
 *      `tier` field, and the UI must render nothing rather than default to a
 *      plausible tier. This is the whole "no crash, no invention on old
 *      payloads" contract for this component.
 *   2. An UNRECOGNISED tier still renders, verbatim. A tier the backend adds
 *      later must stay legible instead of silently vanishing — the failure
 *      mode of a `Record` lookup with no fallback.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import ModelTierChip from "./ModelTierChip";

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

function renderChip(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("ModelTierChip — §5 classification", () => {
  it("renders the tier token, compacted to T1", () => {
    const { container } = renderChip(<ModelTierChip tier="TIER_1" compact />);
    expect(screen.getByText("T1")).toBeTruthy();
    expect(container.querySelector('[data-tier="TIER_1"]')).toBeTruthy();
  });

  it("renders the full token when not compact", () => {
    renderChip(<ModelTierChip tier="TIER_2" />);
    expect(screen.getByText("TIER_2")).toBeTruthy();
  });

  it("renders NOTHING when the server sent no tier (old payload)", () => {
    // The contract: absence is absence. A missing tier must never become a
    // default one, because a wrongly-labelled model is worse than an
    // unlabelled one.
    const { container } = renderChip(<ModelTierChip tier={undefined} />);
    expect(container.textContent).toBe("");
  });

  it("renders NOTHING for an explicit null tier", () => {
    const { container } = renderChip(<ModelTierChip tier={null} />);
    expect(container.textContent).toBe("");
  });

  it("renders NOTHING for an empty-string tier", () => {
    const { container } = renderChip(<ModelTierChip tier="" />);
    expect(container.textContent).toBe("");
  });

  it("renders an UNKNOWN tier verbatim rather than dropping it", () => {
    // A tier added server-side after this build ships. It must stay visible.
    renderChip(<ModelTierChip tier="TIER_9_EXPERIMENTAL" compact />);
    expect(screen.getByText("TIER_9_EXPERIMENTAL")).toBeTruthy();
  });

  it("carries a bilingual explanation of the tier as its title", () => {
    const { container } = renderChip(<ModelTierChip tier="TIER_0" compact />);
    const chip = container.querySelector('[data-tier="TIER_0"]');
    // TIER_0 is the ONLY tier that vetoes today — the title must say so, so
    // the chip cannot be read as a trust score.
    expect(chip?.getAttribute("title")).toContain("only tier that vetoes");
  });

  it("marks TIER_0 distinctly from the shadow tiers", () => {
    const { container: t0 } = renderChip(<ModelTierChip tier="TIER_0" compact />);
    const t0Class = t0.querySelector('[data-tier="TIER_0"]')?.className;
    cleanup();
    const { container: t3 } = renderChip(<ModelTierChip tier="TIER_3" compact />);
    const t3Class = t3.querySelector('[data-tier="TIER_3"]')?.className;
    // The tier that decides must not look like the tier that is deferred.
    expect(t0Class).not.toBe(t3Class);
  });
});
