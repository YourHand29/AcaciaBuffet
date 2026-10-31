import type { Db } from "./db.ts";
import type {
  AnnouncementRow,
  AssignmentGroupRow,
  AssignmentRow,
  CalendarEventRow,
  ChangeRow,
  CourseRow,
  CourseTabRow,
  FileRow,
  FolderRow,
  GradeSnapshotRow,
  ItemStateRow,
  ModuleItemRow,
  ModuleRow,
  PageRow,
  SubmissionRow,
  SyncRunRow,
  TaskRow,
} from "./rows.ts";

/**
 * Read-side queries used by the server. Write-side upserts live in @acacia/sync
 * (they go through Db.upsertTracked so change detection stays in one place).
 */
export class Repo {
  constructor(private readonly db: Db) {}

  // ---- courses ----
  activeCourses(): CourseRow[] {
    return this.db.all<CourseRow>("SELECT * FROM courses WHERE active = 1 ORDER BY name");
  }
  course(id: number): CourseRow | undefined {
    return this.db.get<CourseRow>("SELECT * FROM courses WHERE id = ?", id);
  }
  tabs(courseId: number): CourseTabRow[] {
    return this.db.all<CourseTabRow>("SELECT * FROM course_tabs WHERE course_id = ? ORDER BY position", courseId);
  }

  // ---- assignments & grades ----
  assignmentGroups(courseId: number): AssignmentGroupRow[] {
    return this.db.all<AssignmentGroupRow>("SELECT * FROM assignment_groups WHERE course_id = ? ORDER BY position", courseId);
  }
  assignments(courseId: number): AssignmentRow[] {
    return this.db.all<AssignmentRow>(
      "SELECT * FROM assignments WHERE course_id = ? AND published = 1 ORDER BY due_at IS NULL, due_at",
      courseId,
    );
  }
  submissions(courseId: number): SubmissionRow[] {
    return this.db.all<SubmissionRow>("SELECT * FROM submissions WHERE course_id = ?", courseId);
  }
  submission(assignmentId: number): SubmissionRow | undefined {
    return this.db.get<SubmissionRow>("SELECT * FROM submissions WHERE assignment_id = ?", assignmentId);
  }
  upcomingAssignments(fromIso: string, toIso: string, courseId?: number): AssignmentRow[] {
    return courseId === undefined
      ? this.db.all<AssignmentRow>(
          `SELECT a.* FROM assignments a JOIN courses c ON c.id = a.course_id
           WHERE c.active = 1 AND a.published = 1 AND a.due_at >= ? AND a.due_at <= ? ORDER BY a.due_at`,
          fromIso,
          toIso,
        )
      : this.db.all<AssignmentRow>(
          `SELECT * FROM assignments WHERE course_id = ? AND published = 1 AND due_at >= ? AND due_at <= ? ORDER BY due_at`,
          courseId,
          fromIso,
          toIso,
        );
  }
  gradeSnapshots(courseId: number): GradeSnapshotRow[] {
    return this.db.all<GradeSnapshotRow>("SELECT * FROM grade_snapshots WHERE course_id = ? ORDER BY taken_at", courseId);
  }

  // ---- content ----
  announcements(courseId: number, limit = 50): AnnouncementRow[] {
    return this.db.all<AnnouncementRow>(
      "SELECT * FROM announcements WHERE course_id = ? ORDER BY posted_at DESC LIMIT ?",
      courseId,
      limit,
    );
  }
  modules(courseId: number): ModuleRow[] {
    return this.db.all<ModuleRow>("SELECT * FROM modules WHERE course_id = ? ORDER BY position", courseId);
  }
  moduleItems(courseId: number): ModuleItemRow[] {
    return this.db.all<ModuleItemRow>("SELECT * FROM module_items WHERE course_id = ? ORDER BY module_id, position", courseId);
  }
  folders(courseId: number): FolderRow[] {
    return this.db.all<FolderRow>("SELECT * FROM folders WHERE course_id = ?", courseId);
  }
  files(courseId: number): FileRow[] {
    return this.db.all<FileRow>("SELECT * FROM files WHERE course_id = ? ORDER BY updated_at DESC", courseId);
  }
  pages(courseId: number): PageRow[] {
    return this.db.all<PageRow>("SELECT * FROM pages WHERE course_id = ? ORDER BY title", courseId);
  }
  calendarEvents(fromIso: string, toIso: string, courseId?: number): CalendarEventRow[] {
    return courseId === undefined
      ? this.db.all<CalendarEventRow>(
          "SELECT * FROM calendar_events WHERE start_at >= ? AND start_at <= ? ORDER BY start_at",
          fromIso,
          toIso,
        )
      : this.db.all<CalendarEventRow>(
          "SELECT * FROM calendar_events WHERE course_id = ? AND start_at >= ? AND start_at <= ? ORDER BY start_at",
          courseId,
          fromIso,
          toIso,
        );
  }

  // ---- change feed ----
  changes(limit = 100, courseId?: number): ChangeRow[] {
    return courseId === undefined
      ? this.db.all<ChangeRow>("SELECT * FROM changes ORDER BY detected_at DESC, id DESC LIMIT ?", limit)
      : this.db.all<ChangeRow>(
          "SELECT * FROM changes WHERE course_id = ? ORDER BY detected_at DESC, id DESC LIMIT ?",
          courseId,
          limit,
        );
  }
  markChangesSeen(ids: number[]) {
    if (ids.length === 0) return;
    this.db.run(`UPDATE changes SET seen = 1 WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  }
  insertChange(c: Omit<ChangeRow, "id" | "seen">) {
    this.db.run(
      `INSERT INTO changes (kind, course_id, entity_type, entity_id, title, detail, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      c.kind,
      c.course_id,
      c.entity_type,
      c.entity_id,
      c.title,
      c.detail,
      c.detected_at,
    );
  }

  // ---- local state ----
  itemStates(entityType: string): Map<string, string> {
    const rows = this.db.all<ItemStateRow>("SELECT * FROM item_state WHERE entity_type = ?", entityType);
    return new Map(rows.map((r) => [r.entity_id, r.state]));
  }
  setItemState(entityType: string, entityId: string, state: string) {
    this.db.run(
      `INSERT INTO item_state (entity_type, entity_id, state, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      entityType,
      entityId,
      state,
      new Date().toISOString(),
    );
  }

  // ---- tasks ----
  tasks(courseId?: number): TaskRow[] {
    return courseId === undefined
      ? this.db.all<TaskRow>("SELECT * FROM tasks ORDER BY due_at IS NULL, due_at")
      : this.db.all<TaskRow>("SELECT * FROM tasks WHERE course_id = ? ORDER BY due_at IS NULL, due_at", courseId);
  }
  createTask(t: Pick<TaskRow, "title"> & Partial<Omit<TaskRow, "id" | "created_at" | "updated_at">>): TaskRow {
    const now = new Date().toISOString();
    const result = this.db.run(
      `INSERT INTO tasks (course_id, parent_id, title, notes, due_at, state, source_type, source_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      t.course_id ?? null,
      t.parent_id ?? null,
      t.title,
      t.notes ?? null,
      t.due_at ?? null,
      t.state ?? "todo",
      t.source_type ?? null,
      t.source_id ?? null,
      now,
      now,
    );
    return this.db.get<TaskRow>("SELECT * FROM tasks WHERE id = ?", Number(result.lastInsertRowid))!;
  }
  updateTask(id: number, patch: Partial<Pick<TaskRow, "title" | "notes" | "due_at" | "state">>): TaskRow | undefined {
    const sets: string[] = [];
    const vals: (string | null)[] = [];
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = ?`);
      vals.push(v as string | null);
    }
    if (sets.length) {
      sets.push("updated_at = ?");
      vals.push(new Date().toISOString());
      this.db.run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, ...vals, id);
    }
    return this.db.get<TaskRow>("SELECT * FROM tasks WHERE id = ?", id);
  }
  deleteTask(id: number) {
    this.db.run("DELETE FROM tasks WHERE id = ? OR parent_id = ?", id, id);
  }
  taskExistsForSource(sourceType: string, sourceId: string): boolean {
    return !!this.db.get("SELECT 1 FROM tasks WHERE source_type = ? AND source_id = ?", sourceType, sourceId);
  }

  // ---- sync runs ----
  startSyncRun(): number {
    const r = this.db.run("INSERT INTO sync_runs (started_at) VALUES (?)", new Date().toISOString());
    return Number(r.lastInsertRowid);
  }
  finishSyncRun(id: number, ok: boolean, error: string | null, changesCount: number) {
    this.db.run(
      "UPDATE sync_runs SET finished_at = ?, ok = ?, error = ?, changes_count = ? WHERE id = ?",
      new Date().toISOString(),
      ok ? 1 : 0,
      error,
      changesCount,
      id,
    );
  }
  lastSyncRun(): SyncRunRow | undefined {
    return this.db.get<SyncRunRow>("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1");
  }
}
