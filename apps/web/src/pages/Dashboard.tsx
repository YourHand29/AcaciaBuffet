import { Link } from "react-router-dom";
import { useDashboard } from "../queries";
import { UpcomingList } from "../components/UpcomingList";
import { CourseCard } from "../components/CourseCard";
import { ChangeList } from "../components/ChangeList";

export function Dashboard() {
  const dash = useDashboard(14);

  if (dash.isLoading) return <div className="muted">Loading dashboard…</div>;
  if (dash.isError) return <div className="notice error">Failed to load dashboard: {dash.error.message}</div>;
  if (!dash.data) return null;

  const { courses, upcoming, changes } = dash.data;
  const unseen = changes.filter((c) => !c.seen).length;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <span className="subtitle">Next 14 days</span>
      </div>
      <div className="two-col">
        <div className="card">
          <div className="card-header">
            <h2>Upcoming</h2>
            <span className="muted small">{upcoming.length} items</span>
          </div>
          <UpcomingList items={upcoming} />
        </div>
        <div className="stack">
          <div className="course-grid">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
            {courses.length === 0 && <div className="empty">No courses synced yet</div>}
          </div>
          <div className="card">
            <div className="card-header">
              <h2>Recent changes</h2>
              <Link to="/changes" className="small">
                {unseen > 0 ? `${unseen} unseen · ` : ""}View all
              </Link>
            </div>
            <ChangeList changes={changes.slice(0, 10)} emptyText="No recent changes" />
          </div>
        </div>
      </div>
    </div>
  );
}
