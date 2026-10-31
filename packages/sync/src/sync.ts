import type { CanvasAssignment, CanvasClient, CanvasCourse } from "@acacia/canvas-client";
import { contentHash, Repo, type AssignmentRow, type Db, type FileRow, type SubmissionRow } from "@acacia/db";

export interface SyncOptions {
  /** Restrict to these course ids (default: all active). */
  courseIds?: number[];
  /** Skip the file listing step (it is the slowest). */
  skipFiles?: boolean;
  logger?: (msg: string) => void;
}

export interface SyncResult {
  runId: number;
  courses: number;
  changes: number;
  errors: Array<{ courseId: number | null; step: string; error: string }>;
}

/**
 * Pulls Canvas data into SQLite and records a change-feed entry for anything a
 * student would want to know about. Idempotent; safe to run on a schedule.
 */
export async function runSync(client: CanvasClient, db: Db, opts: SyncOptions = {}): Promise<SyncResult> {
  const log = opts.logger ?? (() => {});
  const repo = new Repo(db);
  const runId = repo.startSyncRun();
  const now = new Date().toISOString();
  const result: SyncResult = { runId, courses: 0, changes: 0, errors: [] };

  const change = (c: { kind: string; course_id: number; entity_type: string; entity_id: string | number; title: string; detail?: string | null }) => {
    repo.insertChange({ ...c, entity_id: String(c.entity_id), detail: c.detail ?? null, detected_at: now });
    result.changes++;
  };

  try {
    log("fetching courses");
    let courses = await client.activeCourses();
    if (opts.courseIds) courses = courses.filter((c) => opts.courseIds!.includes(c.id));

    db.transaction(() => {
      db.run("UPDATE courses SET active = 0");
      for (const c of courses) upsertCourse(db, c, now);
    });

    for (const course of courses) {
      result.courses++;
      log(`syncing ${course.course_code} (${course.id})`);
      const step = async (name: string, fn: () => Promise<void>) => {
        try {
          await fn();
        } catch (e) {
          result.errors.push({ courseId: course.id, step: name, error: (e as Error).message });
          log(`  ! ${name} failed: ${(e as Error).message}`);
        }
      };

      await step("tabs", async () => {
        const tabs = await client.tabs(course.id);
        db.transaction(() => {
          db.run("DELETE FROM course_tabs WHERE course_id = ?", course.id);
          for (const t of tabs) {
            db.run(
              "INSERT INTO course_tabs (course_id, tab_id, label, hidden, position) VALUES (?, ?, ?, ?, ?)",
              course.id, t.id, t.label, t.hidden ? 1 : 0, t.position,
            );
          }
        });
      });

      await step("assignment_groups", async () => {
        const groups = await client.assignmentGroups(course.id);
        db.transaction(() => {
          for (const g of groups) {
            const fields = { name: g.name, position: g.position, weight: g.group_weight, rules: g.rules ?? {} };
            db.upsertTracked("assignment_groups", "id", {
              id: g.id,
              course_id: course.id,
              name: g.name,
              position: g.position,
              weight: g.group_weight ?? 0,
              drop_lowest: g.rules?.drop_lowest ?? 0,
              drop_highest: g.rules?.drop_highest ?? 0,
              never_drop: JSON.stringify(g.rules?.never_drop ?? []),
              raw_json: JSON.stringify(g),
              content_hash: contentHash(fields),
            }, now);
          }
        });
      });

      await step("assignments", async () => {
        const assignments = await client.assignments(course.id);
        db.transaction(() => {
          for (const a of assignments) {
            const res = upsertAssignment(db, course.id, a, now);
            if (res.status === "inserted") {
              if (a.published && !isPastDue(a.due_at)) {
                change({ kind: "assignment.new", course_id: course.id, entity_type: "assignment", entity_id: a.id, title: a.name, detail: a.due_at ? `Due ${a.due_at}` : null });
              }
            } else if (res.status === "updated" && res.previous) {
              const p = res.previous;
              if (p.due_at !== (a.due_at ?? null)) {
                change({ kind: "assignment.due_changed", course_id: course.id, entity_type: "assignment", entity_id: a.id, title: a.name, detail: `${p.due_at ?? "none"} → ${a.due_at ?? "none"}` });
              }
              if ((p.points_possible ?? null) !== (a.points_possible ?? null)) {
                change({ kind: "assignment.points_changed", course_id: course.id, entity_type: "assignment", entity_id: a.id, title: a.name, detail: `${p.points_possible ?? "?"} → ${a.points_possible ?? "?"} pts` });
              }
              if (p.description !== (a.description ?? null)) {
                change({ kind: "assignment.description_changed", course_id: course.id, entity_type: "assignment", entity_id: a.id, title: a.name });
              }
            }

            if (a.submission) {
              const s = a.submission;
              const sres = db.upsertTracked<SubmissionRow>("submissions", "assignment_id", {
                assignment_id: a.id,
                course_id: course.id,
                score: s.score,
                grade: s.grade,
                submitted_at: s.submitted_at,
                graded_at: s.graded_at,
                workflow_state: s.workflow_state,
                late: s.late ? 1 : 0,
                missing: s.missing ? 1 : 0,
                excused: s.excused ? 1 : 0,
                posted_at: s.posted_at ?? null,
                raw_json: JSON.stringify(s),
                content_hash: contentHash({ score: s.score, grade: s.grade, graded_at: s.graded_at, state: s.workflow_state, excused: s.excused, posted: s.posted_at }),
              }, now);
              const nowGraded = s.score !== null && s.workflow_state === "graded" && (s.posted_at ?? s.graded_at);
              if (sres.status === "inserted" && nowGraded && isRecent(s.graded_at, 14)) {
                change({ kind: "grade.posted", course_id: course.id, entity_type: "assignment", entity_id: a.id, title: a.name, detail: `${s.score}/${a.points_possible ?? "?"}` });
              } else if (sres.status === "updated" && sres.previous) {
                const p = sres.previous;
                if (p.score === null && s.score !== null) {
                  change({ kind: "grade.posted", course_id: course.id, entity_type: "assignment", entity_id: a.id, title: a.name, detail: `${s.score}/${a.points_possible ?? "?"}` });
                } else if (p.score !== null && s.score !== null && p.score !== s.score) {
                  change({ kind: "grade.changed", course_id: course.id, entity_type: "assignment", entity_id: a.id, title: a.name, detail: `${p.score} → ${s.score}` });
                }
              }
            }
          }
        });
      });

      await step("announcements", async () => {
        const list = await client.announcements(course.id);
        db.transaction(() => {
          for (const t of list) {
            const res = db.upsertTracked("announcements", "id", {
              id: t.id,
              course_id: course.id,
              title: t.title,
              message: t.message,
              posted_at: t.posted_at,
              author: t.author?.display_name ?? null,
              html_url: t.html_url,
              read_state: t.read_state ?? null,
              raw_json: JSON.stringify(t),
              content_hash: contentHash({ title: t.title, message: t.message, posted_at: t.posted_at }),
            }, now);
            if (res.status === "inserted" && isRecent(t.posted_at, 14)) {
              change({ kind: "announcement.new", course_id: course.id, entity_type: "announcement", entity_id: t.id, title: t.title });
            }
          }
        });
      });

      await step("modules", async () => {
        const modules = await client.modules(course.id);
        db.transaction(() => {
          for (const m of modules) {
            db.upsertTracked("modules", "id", {
              id: m.id,
              course_id: course.id,
              name: m.name,
              position: m.position,
              unlock_at: m.unlock_at,
              raw_json: JSON.stringify({ ...m, items: undefined }),
              content_hash: contentHash({ name: m.name, position: m.position, unlock_at: m.unlock_at }),
            }, now);
            for (const it of m.items ?? []) {
              const res = db.upsertTracked("module_items", "id", {
                id: it.id,
                module_id: m.id,
                course_id: course.id,
                title: it.title,
                type: it.type,
                position: it.position,
                content_id: it.content_id ?? null,
                html_url: it.html_url ?? null,
                external_url: it.external_url ?? null,
                page_url: it.page_url ?? null,
                raw_json: JSON.stringify(it),
                content_hash: contentHash({ title: it.title, type: it.type, content_id: it.content_id, position: it.position }),
              }, now);
              if (res.status === "inserted" && it.type !== "SubHeader" && !isFirstSync(db)) {
                change({ kind: "module_item.new", course_id: course.id, entity_type: "module_item", entity_id: it.id, title: it.title, detail: m.name });
              }
            }
          }
        });
      });

      if (!opts.skipFiles) {
        await step("files", async () => {
          const [folders, files] = await Promise.all([client.folders(course.id), client.files(course.id)]);
          db.transaction(() => {
            for (const f of folders) {
              db.run(
                `INSERT INTO folders (id, course_id, name, full_name, parent_folder_id) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, full_name = excluded.full_name, parent_folder_id = excluded.parent_folder_id`,
                f.id, course.id, f.name, f.full_name, f.parent_folder_id,
              );
            }
            for (const f of files) {
              const res = db.upsertTracked<FileRow>("files", "id", {
                id: f.id,
                course_id: course.id,
                folder_id: f.folder_id,
                display_name: f.display_name,
                filename: f.filename,
                size: f.size,
                content_type: f["content-type"],
                url: f.url,
                updated_at: f.updated_at,
                modified_at: f.modified_at,
                raw_json: JSON.stringify(f),
                content_hash: contentHash({ name: f.display_name, size: f.size, modified: f.modified_at, folder: f.folder_id }),
              }, now);
              if (res.status === "inserted" && !isFirstSync(db) ) {
                change({ kind: "file.new", course_id: course.id, entity_type: "file", entity_id: f.id, title: f.display_name });
              } else if (res.status === "updated") {
                change({ kind: "file.updated", course_id: course.id, entity_type: "file", entity_id: f.id, title: f.display_name });
              }
            }
          });
        });
      }

      await step("pages", async () => {
        const pages = await client.pages(course.id);
        db.transaction(() => {
          for (const p of pages) {
            db.upsertTracked("pages", "page_id", {
              page_id: p.page_id,
              course_id: course.id,
              url: p.url,
              title: p.title,
              body: p.body ?? null,
              front_page: p.front_page ? 1 : 0,
              updated_at: p.updated_at,
              raw_json: JSON.stringify(p),
              content_hash: contentHash({ title: p.title, updated_at: p.updated_at }),
            }, now);
          }
        });
      });

      // grade snapshot (only when the canvas score changed)
      const enrollment = course.enrollments?.find((e) => e.type === "student" || e.type === "StudentEnrollment");
      const last = repo.gradeSnapshots(course.id).at(-1);
      const score = enrollment?.computed_current_score ?? null;
      if (!last || last.canvas_score !== score) {
        db.run(
          "INSERT INTO grade_snapshots (course_id, taken_at, canvas_score, canvas_grade, computed_pct) VALUES (?, ?, ?, ?, NULL)",
          course.id, now, score, enrollment?.computed_current_grade ?? null,
        );
      }
    }

    // calendar events across all courses, ±120 days
    if (courses.length) {
      try {
        const start = new Date(Date.now() - 120 * 86400e3).toISOString();
        const end = new Date(Date.now() + 120 * 86400e3).toISOString();
        const events = await client.calendarEvents(courses.map((c) => c.id), start, end);
        db.transaction(() => {
          for (const ev of events) {
            const courseId = Number(ev.context_code.replace("course_", ""));
            if (!Number.isFinite(courseId)) continue;
            const res = db.upsertTracked("calendar_events", "id", {
              id: ev.id,
              course_id: courseId,
              title: ev.title,
              description: ev.description,
              start_at: ev.start_at,
              end_at: ev.end_at,
              location: ev.location_name,
              html_url: ev.html_url,
              raw_json: JSON.stringify(ev),
              content_hash: contentHash({ title: ev.title, start: ev.start_at, end: ev.end_at, loc: ev.location_name }),
            }, now);
            if (res.status === "inserted" && !isFirstSync(db)) {
              change({ kind: "event.new", course_id: courseId, entity_type: "calendar_event", entity_id: ev.id, title: ev.title, detail: ev.start_at });
            }
          }
        });
      } catch (e) {
        result.errors.push({ courseId: null, step: "calendar_events", error: (e as Error).message });
      }
    }

    db.setMeta("last_sync_at", now);
    if (!db.getMeta("first_sync_at")) db.setMeta("first_sync_at", now);
    repo.finishSyncRun(runId, result.errors.length === 0, result.errors.length ? JSON.stringify(result.errors) : null, result.changes);
  } catch (e) {
    repo.finishSyncRun(runId, false, (e as Error).message, result.changes);
    throw e;
  }
  return result;
}

// ---------------------------------------------------------------------------

function upsertCourse(db: Db, c: CanvasCourse, now: string) {
  const enrollment = c.enrollments?.find((e) => e.type === "student" || e.type === "StudentEnrollment") ?? c.enrollments?.[0];
  db.upsertTracked("courses", "id", {
    id: c.id,
    name: c.name,
    course_code: c.course_code,
    workflow_state: c.workflow_state,
    term_name: c.term?.name ?? null,
    start_at: c.start_at ?? c.term?.start_at ?? null,
    end_at: c.end_at ?? c.term?.end_at ?? null,
    apply_group_weights: c.apply_assignment_group_weights ? 1 : 0,
    grading_standard_id: c.grading_standard_id ?? null,
    current_score: enrollment?.computed_current_score ?? null,
    current_grade: enrollment?.computed_current_grade ?? null,
    syllabus_body: c.syllabus_body ?? null,
    active: 1,
    raw_json: JSON.stringify(c),
    content_hash: contentHash({ name: c.name, code: c.course_code, score: enrollment?.computed_current_score, syllabus: c.syllabus_body }),
  }, now);
}

function upsertAssignment(db: Db, courseId: number, a: CanvasAssignment, now: string) {
  const kind = a.is_quiz_assignment || a.submission_types.includes("online_quiz") ? "quiz" : a.submission_types.includes("discussion_topic") ? "discussion" : "assignment";
  return db.upsertTracked<AssignmentRow>("assignments", "id", {
    id: a.id,
    course_id: courseId,
    group_id: a.assignment_group_id ?? null,
    name: a.name,
    description: a.description,
    due_at: a.due_at,
    lock_at: a.lock_at,
    unlock_at: a.unlock_at,
    points_possible: a.points_possible,
    submission_types: JSON.stringify(a.submission_types),
    kind,
    html_url: a.html_url,
    published: a.published ? 1 : 0,
    omit_from_final: a.omit_from_final_grade ? 1 : 0,
    canvas_updated_at: a.updated_at,
    raw_json: JSON.stringify({ ...a, submission: undefined }),
    content_hash: contentHash({ name: a.name, description: a.description, due_at: a.due_at, points: a.points_possible, published: a.published, group: a.assignment_group_id }),
  }, now);
}

function isPastDue(dueAt: string | null): boolean {
  return !!dueAt && new Date(dueAt).getTime() < Date.now();
}

function isRecent(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < days * 86400e3;
}

/** During the very first sync everything is "new"; suppress noise for file/module/event inserts. */
function isFirstSync(db: Db): boolean {
  return db.getMeta("first_sync_at") === null;
}
