export default function Placeholder({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle: string;
  phase: string;
}) {
  return (
    <>
      <h1>{title}</h1>
      <p className="subtitle">{subtitle}</p>
      <div className="panel">
        <p className="empty">This section arrives with {phase}.</p>
      </div>
    </>
  );
}
