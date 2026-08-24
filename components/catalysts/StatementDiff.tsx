"use client";

/**
 * Phase H §44 — the statement diff, sentence by sentence.
 *
 * This is the single most valuable object on the Fed tab, and it exists
 * because of what a policy reader actually does on decision day: they put the
 * new statement beside the last one and look for what moved. Three or four
 * sentences change between meetings; the rest is boilerplate. Everything about
 * this component follows from that fact:
 *
 *  A. WHAT MOVED IS ON SCREEN; WHAT DID NOT IS ONE CLICK AWAY. The changed
 *     items render expanded, the UNCHANGED bulk sits behind a <details>. A
 *     statement is mostly repetition, and rendering forty unchanged sentences
 *     above the three that moved buries the finding under the boilerplate. The
 *     unchanged text stays REACHABLE rather than dropped, because §44's rule
 *     that the source document is authoritative means the reader must always
 *     be able to get to the whole of it.
 *  B. A CHANGED PAIR ALWAYS SHOWS BOTH TEXTS. "risks to employment have
 *     risen" replacing "risks to employment remain elevated" is a finding that
 *     only exists as a pair — showing the new sentence alone turns a diff into
 *     a quote, and the reader loses the very comparison they came for.
 *  C. THE COLOURS ARE DIFF COLOURS, NOT STANCE COLOURS. Green is added text
 *     and red is removed text, the convention from every code review the
 *     reader has ever seen. Neither says anything about hawkish or dovish, and
 *     §43 forbids this tab from saying it: a removed sentence about inflation
 *     risks can be either, and only the reader (or the Analysis tab's model,
 *     explaining per dimension) decides which.
 *  D. THE TEXT IS VERBATIM. No truncation, no ellipsis, no sentence-casing.
 *     The Fed's language is chosen word by word and a UI that trims "somewhat"
 *     off the end of a sentence has edited the source document.
 */
import { useT } from "@/lib/i18n";
import type { FedDiffItem, FedStatementDiff } from "@/lib/types-fed";
import {
  DIFF_STATUSES,
  changedDiffItems,
  diffCount,
  diffItemsWithStatus,
  diffStatusClass,
  diffStatusText,
  dimensionLabel,
  fmtSimilarity,
  itemDimensions,
} from "./fed-format";

/** The dimension tags a sentence carries, as chips. */
function DimensionTags({ item }: { item: FedDiffItem }) {
  const t = useT();
  const dims = itemDimensions(item);
  if (dims.length === 0) return null;
  return (
    <span className="fd-tags" data-testid="fd-item-dimensions">
      {dims.map((d) => (
        <span key={d} className="chip fd-tag" data-testid={`fd-tag-${d}`}>
          {dimensionLabel(d, t)}
        </span>
      ))}
    </span>
  );
}

/**
 * One diff row.
 *
 * A CHANGED row renders the previous text struck-through above the current one
 * (rule B); ADDED and REMOVED render their one text with the status colour
 * carrying the meaning. The similarity ratio rides on the CHANGED row because
 * it says how much of the sentence survived — a 92% pair is a word swap and a
 * 63% pair is a rewrite, and those are different events.
 */
function DiffRow({ item, index }: { item: FedDiffItem; index: number }) {
  const t = useT();
  const status = typeof item.status === "string" ? item.status : null;
  const cls = diffStatusClass(status);
  const similarity = fmtSimilarity(item.similarity);

  return (
    <li className={`fd-item fd-${cls}`} data-testid={`fd-item-${index}`}>
      <div className="fd-item-head">
        <span className={`badge ${cls}`} data-testid={`fd-item-status-${index}`}>
          {diffStatusText(status, t)}
        </span>
        <DimensionTags item={item} />
        {similarity != null && (
          <span className="fd-sim mono" data-testid={`fd-item-similarity-${index}`}>
            {t(`${similarity} similar`, `相似度 ${similarity}`)}
          </span>
        )}
      </div>

      {/* Rule B — a CHANGED pair is rendered as a pair, always. Verbatim
          server text on both halves (rule D). */}
      {status === "CHANGED" ? (
        <div className="fd-pair">
          <p className="fd-prev" data-testid={`fd-item-previous-${index}`}>
            <span className="fd-marker mono">−</span> {item.previous_text ?? "—"}
          </p>
          <p className="fd-cur" data-testid={`fd-item-current-${index}`}>
            <span className="fd-marker mono">+</span> {item.current_text ?? "—"}
          </p>
        </div>
      ) : status === "REMOVED" ? (
        <p className="fd-prev" data-testid={`fd-item-previous-${index}`}>
          <span className="fd-marker mono">−</span> {item.previous_text ?? "—"}
        </p>
      ) : (
        <p
          className={status === "ADDED" ? "fd-cur" : "fd-same"}
          data-testid={`fd-item-current-${index}`}
        >
          {status === "ADDED" && <span className="fd-marker mono">+</span>}{" "}
          {item.current_text ?? item.previous_text ?? "—"}
        </p>
      )}
    </li>
  );
}

/**
 * The §44 diff.
 *
 * `previousLabel`/`currentLabel` name the two documents being compared, because
 * "previous" and "current" are ambiguous on this tab: the packet diffs the two
 * statements BEFORE the upcoming meeting (the last one against the one before
 * it), and a reader who assumes the right-hand column is the meeting they are
 * looking at would read a stale statement as a fresh one.
 */
export default function StatementDiff({
  diff,
  previousLabel,
  currentLabel,
}: {
  diff: FedStatementDiff | null | undefined;
  previousLabel?: string | null;
  currentLabel?: string | null;
}) {
  const t = useT();
  const moved = changedDiffItems(diff);
  const unchanged = diffItemsWithStatus(diff, "UNCHANGED");
  const total = moved.length + unchanged.length;

  return (
    <div className="fd-wrap" data-testid="fed-diff">
      {/* The counts, first: the reader's opening question is "how much moved
          at all", and four integers answer it before any sentence is read. */}
      <div className="fd-counts" data-testid="fed-diff-counts">
        {DIFF_STATUSES.map((status) => (
          <div key={status} className="fd-count" data-testid={`fed-diff-count-${status}`}>
            <span className={`badge ${diffStatusClass(status)}`}>
              {diffStatusText(status, t)}
            </span>
            <span className="fd-count-v mono">{diffCount(diff, status)}</span>
          </div>
        ))}
      </div>

      {(previousLabel != null || currentLabel != null) && (
        <p className="fd-legend mono" data-testid="fed-diff-legend">
          <span className="fd-marker">−</span> {previousLabel ?? t("earlier statement", "较早的声明")}
          {"   "}
          <span className="fd-marker">+</span> {currentLabel ?? t("later statement", "较晚的声明")}
        </p>
      )}

      {total === 0 ? (
        <p className="empty" data-testid="fed-diff-empty">
          {t(
            "No statement diff is stored. Two consecutive FOMC statements must both be on file for one to be computed — press Backfill to fetch them from the Federal Reserve.",
            "尚未存储声明对比结果。需同时存有连续两次 FOMC 声明方可计算对比 — 点击「回填」以从美联储获取文件。",
          )}
        </p>
      ) : (
        <>
          {moved.length === 0 ? (
            <p className="empty" data-testid="fed-diff-nothing-moved">
              {t(
                "Every sentence carried over unchanged. A statement repeated verbatim is itself a finding — the committee chose to say exactly what it said last time.",
                "所有语句均逐字沿用上次声明。声明完全未作改动本身即是一项发现 — 委员会选择了与上次完全相同的表述。",
              )}
            </p>
          ) : (
            <ul className="fd-list" data-testid="fed-diff-changed">
              {moved.map((item, i) => (
                <DiffRow key={i} item={item} index={i} />
              ))}
            </ul>
          )}

          {/* Rule A — reachable, not on screen by default. */}
          {unchanged.length > 0 && (
            <details className="fd-unchanged" data-testid="fed-diff-unchanged">
              <summary>
                {t(
                  `${unchanged.length} unchanged sentence${unchanged.length === 1 ? "" : "s"}`,
                  `${unchanged.length} 条未变语句`,
                )}
              </summary>
              <ul className="fd-list">
                {unchanged.map((item, i) => (
                  <DiffRow key={i} item={item} index={moved.length + i} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
