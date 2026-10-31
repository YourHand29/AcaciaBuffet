import { Link } from "react-router-dom";
import type { CourseSummaryDto } from "@acacia/shared";

export function formatGrade(percent: number | null, letter: string | null): string {
  if (percent === null) return "—";
  return letter ? `${percent.toFixed(1)}% ${letter}` : `${percent.toFixed(1)}%`;
}

export function CourseCard({ course }: { course: CourseSummaryDto }) {
  return (
    <Link
      to={`/courses/${course.id}`}
      className="card course-card"
      style={{ borderTopColor: course.color ?? undefined }}
    >
      <div className="course-alias">{course.alias ?? course.courseCode}</div>
      <div className="course-name" title={course.name}>
        {course.name}
      </div>
      <div className="course-stats">
        <span title="Upcoming items">{course.upcomingCount} upcoming</span>
        {course.unreadAnnouncements > 0 && (
          <span title="Unread announcements">{course.unreadAnnouncements} unread</span>
        )}
        <span className="course-grade">{formatGrade(course.currentGrade, course.currentLetter)}</span>
      </div>
    </Link>
  );
}
