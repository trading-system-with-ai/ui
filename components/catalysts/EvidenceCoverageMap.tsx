"use client";

/**
 * WHAT THIS EVENT ACTUALLY HAS — the evidence bundle's shape, before its text.
 *
 * The bundle is ~16 sections of nested JSON. Rendered as a tree it is a
 * faithful audit record and an unreadable summary: the reader's first
 * question is "which parts of this event do we know anything about?", and
 * answering it previously meant expanding sixteen `<details>` in turn and
 * holding the answer in their head.
 *
 * Form (dataviz step 1): a CATEGORICAL STATUS MATRIX, not a chart. The
 * variable is nominal with three states (present / absent / partial) over an
 * unordered set of ~16 named sections. There is no magnitude to compare and
 * no axis to share, so bars or a heatmap would both invent a quantity that
 * does not exist — the right mark is a labelled cell whose state is read
 * directly.
 *
 * Encoding decisions that are honesty rules, not taste:
 *
 *  A. ABSENT IS NOT ZERO, AND GETS ITS OWN MARK. A section with no data draws
 *     a hollow cell, never a filled one at minimum intensity — the platform's
 *     §44 rule 18 in visual form. "We have nothing" and "we have a little"
 *     must not be adjacent shades of the same ink.
 *  B. STATE IS SHAPE AND TEXT, NOT COLOUR ALONE. Each cell carries a glyph
 *     and a word; colour is redundant reinforcement. A reader with any colour
 *     vision deficiency loses nothing, and the matrix survives being printed.
 *  C. NO SCORE, NO ROLL-UP. The header counts sections — it does not divide
 *     them into a "completeness percentage". A bundle missing consensus and
 *     one missing peer comparison are not 87% of the same thing, and a single
 *     number would invite exactly that comparison.
 *  D. THE HOVER ADDS, IT NEVER CARRIES. Every cell's state is legible without
 *     pointing at it; the tooltip supplies the server's own verbatim reason
 *     for an absence. A reader who never hovers loses detail, not meaning.
 *
 * Clicking a cell scrolls to that section and opens it — the matrix is a
 * table of contents as much as a summary.
 */
import { useT } from "@/lib/i18n";

export type CoverageState = "present" | "absent" | "partial";

export interface CoverageCell {
  key: string;
  label: string;
  state: CoverageState;
  /** The server's own words for an absence. Never paraphrased. */
  reason?: string | null;
  /** A short factual detail when present, e.g. "5 markets". */
  detail?: string | null;
}

/** Glyph per state — the non-colour channel (encoding rule B). */
const GLYPH: Record<CoverageState, string> = {
  present: "●",
  partial: "◐",
  absent: "○",
};

export default function EvidenceCoverageMap({
  cells,
  onSelect,
}: {
  cells: CoverageCell[];
  onSelect?: (key: string) => void;
}) {
  const t = useT();
  if (cells.length === 0) return null;

  const present = cells.filter((c) => c.state === "present").length;
  const partial = cells.filter((c) => c.state === "partial").length;

  return (
    <div className="ev-coverage" data-testid="evidence-coverage-map">
      <div className="ev-coverage-head">
        <span className="k">{t("Coverage", "数据覆盖")}</span>
        {/* A COUNT, not a percentage — see encoding rule C. */}
        <span className="mono" data-testid="evidence-coverage-count">
          {t(
            `${present} of ${cells.length} sections have data${partial > 0 ? `, ${partial} partial` : ""}`,
            `${cells.length} 个部分中有 ${present} 个含数据${partial > 0 ? `，${partial} 个部分可用` : ""}`,
          )}
        </span>
      </div>
      <div className="ev-coverage-grid">
        {cells.map((cell) => {
          const stateWord =
            cell.state === "present"
              ? t("has data", "有数据")
              : cell.state === "partial"
                ? t("partial", "部分可用")
                : t("no data", "无数据");
          // The tooltip ADDS the reason; the cell already says the state.
          const tip = [
            `${cell.label} — ${stateWord}`,
            cell.detail || null,
            cell.reason || null,
          ]
            .filter(Boolean)
            .join("\n");
          return (
            <button
              type="button"
              key={cell.key}
              className={`ev-cell ev-cell-${cell.state}`}
              title={tip}
              onClick={() => onSelect?.(cell.key)}
              data-testid={`evidence-cell-${cell.key}`}
              data-state={cell.state}
            >
              <span className="ev-cell-glyph" aria-hidden="true">
                {GLYPH[cell.state]}
              </span>
              <span className="ev-cell-label">{cell.label}</span>
              {cell.detail && <span className="ev-cell-detail mono">{cell.detail}</span>}
              {/* Screen readers get the state as words, not as a glyph. */}
              <span className="sr-only">{stateWord}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
