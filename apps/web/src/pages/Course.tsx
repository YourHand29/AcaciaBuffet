import { Link, useParams } from "react-router-dom";
import { useCourse } from "../queries";
import { SegmentRenderer } from "../components/SegmentRenderer";
import { formatGrade } from "../components/CourseCard";

export function Course() {
  const params = useParams();
  const id = Number(params.id);
  const course = useCourse(id);

  if (!Number.isFinite(id)) return <div className="notice error">Invalid course id</div>;
  if (course.isLoading) return <div className="muted">Loading course…</div>;
  if (course.isError) return <div className="notice error">Failed to load course: {course.error.message}</div>;
  if (!course.data) return null;

  const page = course.data;
  const c = page.course;

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <span className="dot" style={{ background: c.color ?? "var(--muted)", width: 12, height: 12 }} />
          <h1>{c.alias ?? c.courseCode}</h1>
          <span className="subtitle">{c.name}</span>
          {c.term && <span className="badge">{c.term}</span>}
        </div>
        <div className="row">
          <span className="grade-letter" title="Computed current grade">
            {formatGrade(c.currentGrade, c.currentLetter)}
          </span>
          <Link to={`/courses/${c.id}/config`} className="small">
            Configure
          </Link>
        </div>
      </div>
      {page.layout.length === 0 && (
        <div className="notice">
          This course has an empty layout. <Link to={`/courses/${c.id}/config`}>Edit workflow.yaml</Link> to add
          segments.
        </div>
      )}
      {page.layout.map((segment, i) => (
        <SegmentRenderer key={`${segment.type}-${i}`} segment={segment} page={page} />
      ))}
    </div>
  );
}
