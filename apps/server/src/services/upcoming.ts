import type { CourseInfo, CourseWorkflow } from "@acacia/course-config";
import type { CourseRow, Repo } from "@acacia/db";
import type { UpcomingItemDto } from "@acacia/shared";

export interface CourseCtx {
  course: CourseRow;
  info: CourseInfo;
  workflow: CourseWorkflow;
}

export function labelFor(c: CourseCtx): string {
  return c.info.alias ?? c.course.course_code;
}

/**
 * Merge Canvas assignments, calendar events, syllabus key dates and local tasks
 * into one sorted timeline for the given window.
 */
export function buildUpcoming(repo: Repo, courses: CourseCtx[], fromIso: string, toIso: string): UpcomingItemDto[] {
  const items: UpcomingItemDto[] = [];
  const states = repo.itemStates("assignment");
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();

  for (const c of courses) {
    const subs = new Map(repo.submissions(c.course.id).map((s) => [s.assignment_id, s]));

    for (const a of repo.upcomingAssignments(fromIso, toIso, c.course.id)) {
      const s = subs.get(a.id);
      const state = (states.get(String(a.id)) ?? "none") as UpcomingItemDto["localState"];
      const submitted = !!s?.submitted_at || s?.workflow_state === "submitted" || s?.workflow_state === "graded";
      if (c.workflow.focus.hide_when_done && (submitted || state === "done")) continue;
      items.push({
        id: `assignment:${a.id}`,
        kind: a.kind,
        courseId: c.course.id,
        courseAlias: labelFor(c),
        courseColor: c.info.color,
        title: a.name,
        dueAt: a.due_at,
        pointsPossible: a.points_possible,
        submitted,
        graded: s?.score != null,
        localState: state,
        htmlUrl: a.html_url,
      });
    }

    for (const ev of repo.calendarEvents(fromIso, toIso, c.course.id)) {
      items.push({
        id: `event:${ev.id}`,
        kind: "event",
        courseId: c.course.id,
        courseAlias: labelFor(c),
        courseColor: c.info.color,
        title: ev.title,
        dueAt: ev.start_at,
        pointsPossible: null,
        submitted: false,
        graded: false,
        localState: "none",
        htmlUrl: ev.html_url,
      });
    }

    for (const kd of c.info.key_dates) {
      if (kd.canvas_event_id) continue; // already represented by the calendar event
      const t = new Date(kd.date).getTime();
      if (t < from || t > to) continue;
      items.push({
        id: `key_date:${c.course.id}:${kd.name}`,
        kind: "key_date",
        courseId: c.course.id,
        courseAlias: labelFor(c),
        courseColor: c.info.color,
        title: kd.location ? `${kd.name} — ${kd.location}` : kd.name,
        dueAt: new Date(kd.date).toISOString(),
        pointsPossible: null,
        submitted: false,
        graded: false,
        localState: "none",
        htmlUrl: null,
      });
    }
  }

  const courseById = new Map(courses.map((c) => [c.course.id, c]));
  for (const t of repo.tasks()) {
    if (t.state === "done" || !t.due_at) continue;
    const ts = new Date(t.due_at).getTime();
    if (ts < from || ts > to) continue;
    const c = t.course_id ? courseById.get(t.course_id) : undefined;
    items.push({
      id: `task:${t.id}`,
      kind: "task",
      courseId: t.course_id ?? 0,
      courseAlias: c ? labelFor(c) : "Personal",
      courseColor: c?.info.color ?? null,
      title: t.title,
      dueAt: t.due_at,
      pointsPossible: null,
      submitted: false,
      graded: false,
      localState: t.state === "doing" ? "started" : "none",
      htmlUrl: null,
    });
  }

  return items.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
}
