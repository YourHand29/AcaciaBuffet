import type { GradesDto } from "@acacia/shared";
import { formatDate } from "../../time";

function pct(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)}%`;
}

export function Grades({ grades }: { grades: GradesDto; options: Record<string, unknown> }) {
  const graded = grades.assignments.filter((a) => a.score !== null || a.excused);
  const sorted = [...graded].sort((a, b) => (b.gradedAt ?? "").localeCompare(a.gradedAt ?? ""));

  return (
    <div className="stack">
      <div className="grade-summary">
        <span className="grade-big">{pct(grades.currentPercent)}</span>
        {grades.currentLetter && <span className="grade-letter">{grades.currentLetter}</span>}
        <span className="muted small">
          Canvas reports {pct(grades.canvasCurrentScore)}
          {grades.currentPercent !== null &&
            grades.canvasCurrentScore !== null &&
            Math.abs(grades.currentPercent - grades.canvasCurrentScore) > 0.05 && (
              <span className="warning"> (differs)</span>
            )}
        </span>
      </div>

      {grades.categories.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Weight</th>
              <th className="num">Earned / Possible</th>
              <th className="num">%</th>
            </tr>
          </thead>
          <tbody>
            {grades.categories.map((c) => (
              <tr key={c.name}>
                <td>
                  {c.name}
                  {c.dropLowest > 0 && <span className="muted small"> (drops {c.dropLowest})</span>}
                </td>
                <td className="num">{c.weight === null ? "—" : `${c.weight}%`}</td>
                <td className="num">
                  {c.earned} / {c.possible}
                </td>
                <td className="num">{pct(c.percent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sorted.length === 0 ? (
        <div className="empty">No graded assignments yet</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Assignment</th>
              <th>Group</th>
              <th className="num">Score</th>
              <th>Graded</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="muted">{a.group}</td>
                <td className="num">
                  {a.excused ? (
                    <span className="muted">excused</span>
                  ) : (
                    <>
                      {a.score ?? "—"}
                      {a.pointsPossible !== null && <span className="muted"> / {a.pointsPossible}</span>}
                    </>
                  )}
                </td>
                <td className="muted">{formatDate(a.gradedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
