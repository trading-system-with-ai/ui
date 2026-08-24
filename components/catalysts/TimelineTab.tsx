"use client";

/**
 * Phase J §57 — "Timeline / Since Last Event".
 *
 * The question this tab answers is the one a trader actually asks before a
 * print: "what has happened to this company since the last one?" The window is
 * therefore anchored on the PREVIOUS COMPARABLE EVENT at one end and the as-of
 * instant at the other, and both ends are drawn — a timeline whose bounds are
 * implicit is a list.
 *
 * Rules specific to this tab:
 *
 *  A. THE AS-OF MARKER IS DRAWN, NOT ASSUMED. Every item is stamped at or
 *     before it (§96), so the marker is the line past which the platform
 *     deliberately knows nothing. Drawing it is what makes an empty tail read
 *     as "nothing since" instead of "we stopped looking".
 *  B. FILTERS NARROW, THEY NEVER DELETE. Deselecting every kind means NO
 *     FILTER, not an empty page, and the counts strip always reports the
 *     SERVER's totals beside the visible count — so a reader can always see
 *     that their filter is hiding something.
 *  C. THE CATEGORY FILTER ONLY BINDS ROWS THAT HAVE A CATEGORY. A filing has
 *     no materiality category; hiding filings because the reader narrowed to
 *     GUIDANCE would silently rewrite the record (see `filterItems`).
 *  D. NOTHING IS COMPUTED HERE. Scores, categories, counts and the window all
 *     arrive from the server (§61). This file sorts, filters and draws.
 *  E. TRUNCATION IS ANNOUNCED. `truncated` means the server dropped rows past
 *     its cap. A list that quietly ends is a list a reader will trust as
 *     complete.
 *
 * The GET never fetches from a provider — filling the news window is the
 * explicit action on the News tab, and this tab links there rather than
 * duplicating the button, so there is exactly one place that spends a call.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { EventTimelinePayload, TimelineAnchor, TimelineItem } from "@/lib/types-timeline";
import {
  TIMELINE_KINDS,
  anchorDate,
  anchorPresent,
  categoryText,
  countFor,
  filterItems,
  fmtScore,
  itemKey,
  kindGlyph,
  kindLabel,
  presentCategories,
  presentKinds,
  safeUrl,
  sortItems,
  stampDay,
  stampMinute,
  timelineItems,
} from "./timeline-format";

/** Groups larger than this collapse behind a disclosure (§57). */
const COLLAPSE_AT = 30;

/* ----------------------------------------------------------------- anchors */

/**
 * One end of the window.
 *
 * The ESTIMATED badge rides on the anchor because an anchor IS a date: §7 does
 * not stop applying because the date is drawn as a node on a rail rather than
 * printed in a table.
 */
function AnchorNode({
  anchor,
  label,
  testId,
}: {
  anchor: TimelineAnchor | null | undefined;
  label: string;
  testId: string;
}) {
  const t = useT();
  if (!anchorPresent(anchor)) {
    return (
      <div className="tl-anchor tl-anchor-missing" data-testid={`${testId}-missing`}>
        <span className="tl-anchor-label">{label}</span>
        <span className="tl-anchor-empty">
          {t(
            "No comparable earlier event is stored, so the window falls back to the last 120 days.",
            "尚无可比的历史事件记录,因此窗口回退为最近 120 天。",
          )}
        </span>
      </div>
    );
  }
  const date = anchorDate(anchor);
  return (
    <div className="tl-anchor" data-testid={testId}>
      <span className="tl-anchor-label">{label}</span>
      <span className="tl-anchor-date mono">{date ?? "—"}</span>
      {anchor?.session != null && anchor.session !== "" && (
        <span className="chip">{String(anchor.session).replace(/_/g, " ")}</span>
      )}
      {anchor?.is_estimated === true && (
        <span className="badge amber" data-testid={`${testId}-estimated`}>
          {t("ESTIMATED", "估算")}
        </span>
      )}
      {anchor?.event_key != null && anchor.event_key !== "" && (
        <span className="tl-anchor-key mono">{anchor.event_key}</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- rows */

/**
 * One timeline row.
 *
 * The title links out ONLY through `safeUrl` — these strings arrived from a
 * news feed, so the scheme is checked rather than trusted, and an unusable URL
 * degrades to plain text rather than to a dead or dangerous anchor.
 *
 * Every kind-specific field is printed only if it is there. A NEWS row has no
 * fiscal period and an ANALYSIS row has no publisher, and rendering a label
 * with nothing behind it is how "—" becomes a fact on screen.
 */
function TimelineRow({ item }: { item: TimelineItem }) {
  const t = useT();
  const kind = typeof item.kind === "string" ? item.kind : "";
  const stamp = stampMinute(item.at);
  const url = safeUrl(item.url ?? item.source_url);
  const title =
    typeof item.title === "string" && item.title.trim() !== "" ? item.title : null;
  const score = fmtScore(item.score);

  return (
    <li className="tl-item" data-testid="timeline-item" data-kind={kind}>
      <span className="tl-dot" aria-hidden="true">
        {kindGlyph(kind)}
      </span>
      <div className="tl-body">
        <div className="tl-meta">
          <span className="tl-at mono" data-testid="timeline-item-at">
            {stamp ?? t("time unknown", "时间未知")}
          </span>
          <span className="chip tl-kind" data-testid="timeline-item-kind">
            {kindLabel(kind, t)}
          </span>
          {typeof item.category === "string" && item.category !== "" && (
            <span className="badge dim tl-category" data-testid="timeline-item-category">
              {categoryText(item.category, t)}
            </span>
          )}
          {kind === "EVENT" && typeof item.status === "string" && item.status !== "" && (
            /* Verbatim server token — an unmapped status renders as itself. */
            <span className="badge dim">{item.status}</span>
          )}
          {kind === "ANALYSIS" && typeof item.regime === "string" && item.regime !== "" && (
            <span className="badge dim">{item.regime}</span>
          )}
        </div>

        <p className="tl-title">
          {title == null ? (
            <span className="tl-untitled">{t("(no title)", "（无标题）")}</span>
          ) : url == null ? (
            title
          ) : (
            <a href={url} target="_blank" rel="noopener noreferrer" className="src-link">
              {title}
            </a>
          )}
        </p>

        <div className="tl-sub">
          {typeof item.publisher === "string" && item.publisher !== "" && (
            <span className="tl-publisher">{item.publisher}</span>
          )}
          {score != null && (
            <span className="tl-score mono" data-testid="timeline-item-score">
              {t("score", "评分")} {score}
            </span>
          )}
          {typeof item.article_count === "number" && Number.isFinite(item.article_count) && (
            <span className="tl-count mono">
              {t(`${item.article_count} articles`, `${item.article_count} 篇报道`)}
            </span>
          )}
          {typeof item.fiscal_period === "string" && item.fiscal_period !== "" && (
            <span className="tl-fiscal mono" data-testid="timeline-item-fiscal">
              {item.fiscal_period}
              {typeof item.fiscal_year === "number" ? ` ${item.fiscal_year}` : ""}
              {typeof item.timeframe === "string" && item.timeframe !== ""
                ? ` · ${item.timeframe}`
                : ""}
            </span>
          )}
          {typeof item.event_type === "string" && item.event_type !== "" && (
            <span className="tl-etype mono">{item.event_type.replace(/_/g, " ")}</span>
          )}
          {kind === "ANALYSIS" &&
            typeof item.confidence === "string" &&
            item.confidence !== "" && (
              <span className="tl-conf">
                {t("confidence", "置信度")} {item.confidence}
              </span>
            )}
        </div>
      </div>
    </li>
  );
}

/**
 * A day's worth of rows, collapsed once the whole list is long.
 *
 * `<details>` rather than a "show more" button: the rows stay in the DOM,
 * reachable by keyboard, by find-in-page and by a screen reader, which a
 * conditional render would not be.
 */
function DayGroup({
  day,
  items,
  collapsed,
}: {
  day: string;
  items: TimelineItem[];
  collapsed: boolean;
}) {
  const t = useT();
  const rows = (
    <ul className="tl-list">
      {items.map((item, i) => (
        <TimelineRow key={itemKey(item, i)} item={item} />
      ))}
    </ul>
  );
  if (!collapsed) {
    return (
      <div className="tl-day" data-testid={`timeline-day-${day}`}>
        <div className="tl-day-head mono">{day}</div>
        {rows}
      </div>
    );
  }
  return (
    <details className="tl-day" data-testid={`timeline-day-${day}`}>
      <summary className="tl-day-head mono">
        {day}{" "}
        <span className="tl-day-n">
          {t(`(${items.length})`, `（${items.length}）`)}
        </span>
      </summary>
      {rows}
    </details>
  );
}

/* ------------------------------------------------------------------ filters */

function FilterChip({
  active,
  label,
  count,
  onClick,
  testId,
}: {
  active: boolean;
  label: string;
  count: number | null;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className={`tl-filter${active ? " active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
    >
      {label}
      {count != null && <span className="tl-filter-n mono">{count}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ content */

/**
 * The render half, separated from the query half so the tests can mount it
 * with a fixed payload and no network — the same split AnalysisTab uses.
 */
export function TimelineTabContent({ data }: { data: EventTimelinePayload | null | undefined }) {
  const t = useT();
  const [kinds, setKinds] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const all = useMemo(() => sortItems(timelineItems(data)), [data]);
  const visible = useMemo(
    () => filterItems(all, kinds, categories),
    [all, kinds, categories],
  );

  const kindOptions = useMemo(() => presentKinds(data), [data]);
  const categoryOptions = useMemo(() => presentCategories(data), [data]);

  const byKind = data?.counts?.by_kind ?? null;
  const byCategory = data?.counts?.by_category ?? null;
  // 0 is a finding ("the window really was empty"), so only an ABSENT total
  // suppresses the "of N in window" line.
  const rawTotal = data?.counts?.total;
  const total =
    typeof rawTotal === "number" && Number.isFinite(rawTotal) ? rawTotal : null;

  const toggle = (list: string[], value: string, set: (next: string[]) => void) => {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  // Grouped by ISO day, preserving the sorted order (Map keeps insertion order).
  const days = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const item of visible) {
      const day = stampDay(item.at) ?? t("undated", "无日期");
      const bucket = map.get(day);
      if (bucket == null) map.set(day, [item]);
      else bucket.push(item);
    }
    return [...map.entries()];
  }, [visible, t]);

  const collapsed = visible.length > COLLAPSE_AT;
  const asOf = data?.as_of ?? data?.anchors?.as_of ?? null;

  return (
    <div className="panel" data-testid="timeline-panel">
      <h2>
        {t("Timeline / Since Last Event", "时间线 / 自上次事件以来")}{" "}
        <span className="provenance data-driven">{t("DATA", "数据")}</span>
      </h2>
      <p className="an-note">
        {t(
          "Everything the platform has stored between the previous comparable event and the as-of instant. Nothing here was fetched by opening this tab, and nothing past the as-of marker is shown — this is the record as it stood at that moment, not as it reads with hindsight.",
          "本页展示平台已存储的、介于上一次可比事件与「计算时点」之间的全部内容。打开本标签页不会触发任何数据抓取,计算时点之后的内容也不会显示 — 这是该时刻的真实记录,而非事后回看的版本。",
        )}
      </p>

      {/* The window the server actually measured, printed verbatim. A timeline
          whose bounds are implicit invites the reader to assume they are wider
          than they are. */}
      <div className="tl-window mono" data-testid="timeline-window">
        <span className="k">{t("Window", "窗口")}</span>{" "}
        {stampDay(data?.window?.start) ?? "—"} → {stampDay(data?.window?.end) ?? "—"}
        {data?.window?.basis != null && data.window.basis !== "" && (
          <span className="tl-basis"> · {data.window.basis}</span>
        )}
      </div>

      <div className="tl-counts" data-testid="timeline-counts">
        <span>
          {t(
            `${visible.length} shown`,
            `显示 ${visible.length} 条`,
          )}
        </span>
        {total != null && (
          <span className="tl-total">
            {t(`of ${total} in window`, `／窗口内共 ${total} 条`)}
          </span>
        )}
        {TIMELINE_KINDS.map((kind) => {
          const n = countFor(byKind, kind);
          if (n == null) return null;
          return (
            <span key={kind} className="tl-count-kind" data-testid={`timeline-count-${kind}`}>
              {kindLabel(kind, t)} {n}
            </span>
          );
        })}
      </div>

      {data?.truncated === true && (
        <p className="tl-truncated" role="status" data-testid="timeline-truncated">
          <span className="badge amber">{t("TRUNCATED", "已截断")}</span>{" "}
          {t(
            "The window held more items than the server returns at once, so the lowest-scoring news was dropped. What is missing is the tail, not the top — but this list is not complete.",
            "该窗口内的条目数超过服务端单次返回上限,因此评分最低的新闻被舍弃。缺失的是尾部而非头部 — 但本列表并不完整。",
          )}
        </p>
      )}

      {/* Rule B — filters narrow; the counts above always show the total. */}
      {kindOptions.length > 0 && (
        <div className="tl-filters" data-testid="timeline-kind-filters">
          <span className="k">{t("Kinds", "类型")}</span>
          {kindOptions.map((kind) => (
            <FilterChip
              key={kind}
              active={kinds.includes(kind)}
              label={kindLabel(kind, t)}
              count={countFor(byKind, kind)}
              onClick={() => toggle(kinds, kind, setKinds)}
              testId={`timeline-filter-kind-${kind}`}
            />
          ))}
          {kinds.length > 0 && (
            <button
              type="button"
              className="linkish"
              onClick={() => setKinds([])}
              data-testid="timeline-clear-kinds"
            >
              {t("clear", "清除")}
            </button>
          )}
        </div>
      )}

      {categoryOptions.length > 0 && (
        <div className="tl-filters" data-testid="timeline-category-filters">
          <span className="k">{t("News categories", "新闻类别")}</span>
          {categoryOptions.map((category) => (
            <FilterChip
              key={category}
              active={categories.includes(category)}
              label={categoryText(category, t)}
              count={countFor(byCategory, category)}
              onClick={() => toggle(categories, category, setCategories)}
              testId={`timeline-filter-category-${category}`}
            />
          ))}
          {categories.length > 0 && (
            <button
              type="button"
              className="linkish"
              onClick={() => setCategories([])}
              data-testid="timeline-clear-categories"
            >
              {t("clear", "清除")}
            </button>
          )}
        </div>
      )}

      <div className="tl-rail" data-testid="timeline-rail">
        <AnchorNode
          anchor={data?.anchors?.previous_event}
          label={t("LAST EVENT", "上次事件")}
          testId="timeline-anchor-previous"
        />

        {days.length === 0 ? (
          <p className="empty" data-testid="timeline-empty">
            {kinds.length > 0 || categories.length > 0
              ? t(
                  "No item in this window matches the current filters. Clearing them shows the whole window again.",
                  "该窗口内没有符合当前筛选条件的条目。清除筛选即可重新查看整个窗口。",
                )
              : t(
                  "Nothing is stored for this window. That is a state, not a gap: no material news, filing, event or analysis has been recorded between the previous event and the as-of instant. The News tab is where a news window gets filled — this tab never fetches.",
                  "该窗口内没有任何已存储的内容。这是一种状态,而非数据缺口:在上一次事件与计算时点之间,没有记录到任何重大新闻、财务申报、事件或分析。新闻窗口需在「新闻」标签页中填充 — 本标签页从不抓取数据。",
                )}
          </p>
        ) : (
          days.map(([day, items]) => (
            <DayGroup key={day} day={day} items={items} collapsed={collapsed} />
          ))
        )}

        {/* Rule A — the line past which the platform deliberately knows nothing. */}
        <div className="tl-asof" data-testid="timeline-as-of">
          <span className="tl-asof-label">{t("AS OF", "计算时点")}</span>
          <span className="tl-asof-date mono">{stampMinute(asOf) ?? "—"}</span>
          <span className="tl-asof-note">
            {t(
              "Nothing after this instant is shown, by design.",
              "此时点之后的内容不予显示,此为设计如此。",
            )}
          </span>
        </div>

        <AnchorNode
          anchor={data?.anchors?.next_event}
          label={t("THIS EVENT", "本次事件")}
          testId="timeline-anchor-next"
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- tab */

export default function TimelineTab({
  eventId,
  asOf,
}: {
  eventId: number;
  asOf?: string;
}) {
  const t = useT();
  const query = useQuery({
    queryKey: ["event-timeline", eventId, asOf ?? null],
    queryFn: () => api.events.timeline(eventId, asOf),
    enabled: Number.isFinite(eventId),
  });

  if (query.isLoading) {
    return (
      <div className="panel">
        <h2>{t("Timeline / Since Last Event", "时间线 / 自上次事件以来")}</h2>
        <p className="empty">{t("Loading…", "加载中…")}</p>
      </div>
    );
  }

  if (query.error != null) {
    return (
      <div className="panel">
        <h2>{t("Timeline / Since Last Event", "时间线 / 自上次事件以来")}</h2>
        {/* Verbatim server message — a paraphrased error is an error that
            cannot be matched against the logs. */}
        <p className="error" data-testid="timeline-error">
          {t(
            `Could not load the timeline: ${query.error.message}`,
            `无法加载时间线：${query.error.message}`,
          )}
        </p>
      </div>
    );
  }

  return <TimelineTabContent data={query.data} />;
}
