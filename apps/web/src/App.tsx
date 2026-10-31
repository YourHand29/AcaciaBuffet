import { NavLink, Outlet } from "react-router-dom";
import { useCourses } from "./queries";
import { SyncStatus } from "./components/SyncStatus";

export function App() {
  const courses = useCourses();

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">AcaciaBuffet</div>
        <nav>
          <NavLink to="/" end className="nav-link">
            Dashboard
          </NavLink>
          <div className="nav-section">Courses</div>
          {courses.data?.map((c) => (
            <NavLink key={c.id} to={`/courses/${c.id}`} className="nav-link nav-course">
              <span className="dot" style={{ background: c.color ?? "var(--muted)" }} />
              <span className="truncate">{c.alias ?? c.courseCode}</span>
              {c.upcomingCount > 0 && <span className="nav-count">{c.upcomingCount}</span>}
            </NavLink>
          ))}
          {courses.isLoading && <div className="nav-muted">Loading…</div>}
          {courses.isError && <div className="nav-muted error">Failed to load courses</div>}
          <div className="nav-section">More</div>
          <NavLink to="/changes" className="nav-link">
            Changes
          </NavLink>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <SyncStatus />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
