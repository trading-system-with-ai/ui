"use client";

/**
 * "Confirm date…" — the only path by which an ESTIMATED date becomes a fact
 * (§7, §78). Built on the platform Modal (focus trap, ESC, focus return).
 * Never use browser-native dialogs here: they are CI-blocked, and would be
 * the wrong shape anyway, since the user supplies three fields plus a cite.
 *
 * The source URL field is not decoration: a user-confirmed date outranks
 * every automated source (rank 0), so the platform records WHERE the human
 * read it. It stays optional — refusing the confirmation for a missing
 * citation would push the user back to trusting the estimate.
 *
 * The datetime is submitted WITHOUT an offset and the server reads an
 * offsetless string as America/New_York, which is what the field's own label
 * promises. Sending the browser's zone instead would silently relabel a
 * before-market release for any user outside ET.
 */
import { useState, type FormEvent } from "react";
import Modal from "@/components/shared/Modal";
import { useLang, useT } from "@/lib/i18n";
import type { EventConfirmRequest, EventRow, EventSession } from "@/lib/types";
import { SESSION_LABEL, formatLocalDateTime } from "./event-format";

const SESSION_OPTIONS: EventSession[] = [
  "BEFORE_MARKET",
  "DURING_MARKET",
  "AFTER_MARKET",
  "UNKNOWN",
];

/** ISO-with-offset → the "YYYY-MM-DDTHH:MM" a datetime-local input wants,
 *  keeping the event's OWN wall clock rather than shifting to the browser's. */
function toDatetimeLocalValue(isoWithOffset: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(isoWithOffset);
  return match == null ? "" : `${match[1]}T${match[2]}`;
}

export default function ConfirmDateDialog({
  event,
  onClose,
  onSubmit,
  pending,
  error,
}: {
  event: EventRow;
  onClose: () => void;
  onSubmit: (body: EventConfirmRequest) => void;
  pending: boolean;
  /** Server message, rendered verbatim — never paraphrased. */
  error: string | null;
}) {
  const t = useT();
  const { lang } = useLang();
  const [scheduledAt, setScheduledAt] = useState(() =>
    toDatetimeLocalValue(event.scheduled_at_local),
  );
  const [session, setSession] = useState<EventSession>(event.session);
  const [sourceUrl, setSourceUrl] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (scheduledAt === "") return;
    onSubmit({
      scheduled_at: scheduledAt,
      session,
      source_url: sourceUrl.trim() === "" ? undefined : sourceUrl.trim(),
    });
  };

  return (
    <Modal title={t("Confirm event date", "确认事件日期")} onClose={onClose}>
      <form onSubmit={submit} className="confirm-date-form">
        <p className="cd-context">
          <strong>{event.ticker ?? event.event_type.replace(/_/g, " ")}</strong>{" "}
          — {event.title}
        </p>
        <p className="cd-current">
          {t(
            `Currently ESTIMATED for ${formatLocalDateTime(event.scheduled_at_local, lang)}. Enter the date published by the company's IR page or an SEC filing.`,
            `当前为估算日期:${formatLocalDateTime(event.scheduled_at_local, lang)}。请填写公司投资者关系页面或 SEC 申报文件公布的日期。`,
          )}
        </p>

        <label className="cd-field">
          <span className="cd-label">
            {t(
              "Scheduled date & time (America/New_York)",
              "预定日期与时间（美东时间 America/New_York）",
            )}
          </span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
          />
        </label>

        <label className="cd-field">
          <span className="cd-label">{t("Session", "交易时段")}</span>
          <select
            value={session}
            onChange={(e) => setSession(e.target.value as EventSession)}
          >
            {SESSION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(SESSION_LABEL[option].en, SESSION_LABEL[option].zh)}
              </option>
            ))}
          </select>
        </label>

        <label className="cd-field">
          <span className="cd-label">
            {t("Source URL (optional)", "来源链接（可选）")}
          </span>
          <input
            type="text"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://investor.example.com/events"
          />
          <span className="cd-hint">
            {t(
              "Recorded with the confirmation: a user-confirmed date outranks every automated source, so the platform keeps where it came from.",
              "将与确认记录一同保存:用户确认的日期优先级高于任何自动来源,因此平台会保留其出处。",
            )}
          </span>
        </label>

        {error != null && <p className="error">{error}</p>}

        <div className="cd-actions">
          <button type="button" onClick={onClose} disabled={pending}>
            {t("Cancel", "取消")}
          </button>
          <button
            type="submit"
            className="primary"
            disabled={pending || scheduledAt === ""}
          >
            {pending
              ? t("Confirming…", "确认中…")
              : t("Confirm date", "确认日期")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
