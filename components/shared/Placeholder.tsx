"use client";

import { useT } from "@/lib/i18n";

export default function Placeholder({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle: string;
  phase: string;
}) {
  const t = useT();
  return (
    <>
      <h1>{title}</h1>
      <p className="subtitle">{subtitle}</p>
      <div className="panel">
        <p className="empty">
          {t(`This section arrives with ${phase}.`, `本板块将随 ${phase} 一同上线。`)}
        </p>
      </div>
    </>
  );
}
