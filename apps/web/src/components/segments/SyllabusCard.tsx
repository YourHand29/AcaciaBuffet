import { formatDate } from "../../time";

interface KeyDate {
  name: string;
  date: string;
  end: string | null;
  location: string | null;
  kind: string;
}

interface ExternalTool {
  name: string;
  url: string | null;
  role: string;
}

interface SyllabusInfo {
  key_dates: KeyDate[];
  policies: { late: string | null; office_hours: string | null; attendance: string | null; notes: string | null };
  external: ExternalTool[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function toSyllabusInfo(info: unknown): SyllabusInfo {
  const root = isRecord(info) ? info : {};
  const policies = isRecord(root.policies) ? root.policies : {};
  const keyDates: KeyDate[] = Array.isArray(root.key_dates)
    ? root.key_dates.filter(isRecord).flatMap((d) => {
        const name = str(d.name);
        const date = str(d.date);
        if (!name || !date) return [];
        return [{ name, date, end: str(d.end), location: str(d.location), kind: str(d.kind) ?? "other" }];
      })
    : [];
  const external: ExternalTool[] = Array.isArray(root.external)
    ? root.external.filter(isRecord).flatMap((t) => {
        const name = str(t.name);
        if (!name) return [];
        return [{ name, url: str(t.url), role: str(t.role) ?? "other" }];
      })
    : [];
  return {
    key_dates: keyDates,
    policies: {
      late: str(policies.late),
      office_hours: str(policies.office_hours),
      attendance: str(policies.attendance),
      notes: str(policies.notes),
    },
    external,
  };
}

export function SyllabusCard({ info }: { info: unknown; options: Record<string, unknown> }) {
  const s = toSyllabusInfo(info);
  const today = new Date().toISOString().slice(0, 10);
  const dates = [...s.key_dates].sort((a, b) => a.date.localeCompare(b.date));
  const hasPolicies = s.policies.late || s.policies.office_hours || s.policies.attendance;
  const empty = dates.length === 0 && !hasPolicies && s.external.length === 0;

  if (empty) {
    return <div className="empty">No syllabus facts yet — edit info.yaml or run Analyze course.</div>;
  }

  return (
    <div className="stack">
      {dates.length > 0 && (
        <div>
          <h3>Key dates</h3>
          <ul className="key-dates">
            {dates.map((d, i) => (
              <li key={`${d.date}-${i}`} style={{ opacity: d.date < today ? 0.55 : 1 }}>
                <span className="date">{formatDate(d.date)}</span>
                <span className={`badge kind-${d.kind === "exam" || d.kind === "quiz" ? "event" : "key_date"}`}>
                  {d.kind}
                </span>
                <span>{d.name}</span>
                {d.location && <span className="muted small">@ {d.location}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasPolicies && (
        <dl className="kv">
          {s.policies.late && (
            <>
              <dt>Late policy</dt>
              <dd>{s.policies.late}</dd>
            </>
          )}
          {s.policies.office_hours && (
            <>
              <dt>Office hours</dt>
              <dd>{s.policies.office_hours}</dd>
            </>
          )}
          {s.policies.attendance && (
            <>
              <dt>Attendance</dt>
              <dd>{s.policies.attendance}</dd>
            </>
          )}
        </dl>
      )}
      {s.external.length > 0 && (
        <div className="row wrap">
          <span className="muted small">Tools:</span>
          {s.external.map((t) => (
            <span key={t.name} className="badge" title={t.role}>
              {t.url ? (
                <a href={t.url} target="_blank" rel="noreferrer">
                  {t.name}
                </a>
              ) : (
                t.name
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
