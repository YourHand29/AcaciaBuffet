import { test } from "node:test";
import assert from "node:assert/strict";
import { CanvasClient } from "@acacia/canvas-client";
import { Db, Repo } from "@acacia/db";
import { runSync } from "./sync.ts";

/** Fake Canvas: routes by pathname, returns whatever is in `data`. */
function fakeCanvas(data: Record<string, unknown>) {
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : (input as Request).url);
    const key = url.pathname.replace("/api/v1", "");
    const body = data[key] ?? [];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return new CanvasClient({ baseUrl: "https://canvas.test", token: "t", fetch: fetchImpl });
}

const course = {
  id: 1,
  name: "Biology 201",
  course_code: "BIO201",
  workflow_state: "available",
  start_at: "2026-09-01T00:00:00Z",
  end_at: null,
  enrollment_term_id: 1,
  enrollments: [{ type: "student", role: "StudentEnrollment", enrollment_state: "active", computed_current_score: 91.5, computed_current_grade: "A-" }],
  apply_assignment_group_weights: true,
};

const future = new Date(Date.now() + 5 * 86400e3).toISOString();

function baseData() {
  return {
    "/courses": [course],
    "/courses/1/tabs": [{ id: "home", label: "Home", type: "internal", position: 1, visibility: "public" }],
    "/courses/1/assignment_groups": [{ id: 10, name: "Homework", position: 1, group_weight: 40, rules: { drop_lowest: 1 } }],
    "/courses/1/assignments": [
      {
        id: 100,
        course_id: 1,
        name: "HW 1",
        description: "<p>do it</p>",
        due_at: future,
        lock_at: null,
        unlock_at: null,
        points_possible: 10,
        assignment_group_id: 10,
        submission_types: ["online_upload"],
        html_url: "https://canvas.test/courses/1/assignments/100",
        published: true,
        updated_at: "2026-09-02T00:00:00Z",
        submission: { id: 1, assignment_id: 100, score: null, grade: null, submitted_at: null, graded_at: null, workflow_state: "unsubmitted", late: false, missing: false, excused: false },
      },
    ],
    "/announcements": [],
    "/courses/1/modules": [{ id: 5, name: "Week 1", position: 1, unlock_at: null, items_count: 1, items: [{ id: 50, module_id: 5, position: 1, title: "Slides 1", type: "File", content_id: 900 }] }],
    "/courses/1/folders": [{ id: 1, name: "course files", full_name: "course files", parent_folder_id: null, context_id: 1, context_type: "Course" }],
    "/courses/1/files": [{ id: 900, folder_id: 1, display_name: "slides1.pdf", filename: "slides1.pdf", size: 100, "content-type": "application/pdf", url: "https://x", created_at: "", updated_at: "2026-09-01T00:00:00Z", modified_at: "2026-09-01T00:00:00Z", locked: false, hidden: false }],
    "/courses/1/pages": [],
    "/calendar_events": [],
  };
}

test("first sync populates tables; second sync detects due-date, grade and new-file changes", async () => {
  const db = new Db(":memory:");
  const repo = new Repo(db);
  const data = baseData();

  const r1 = await runSync(fakeCanvas(data), db);
  assert.equal(r1.courses, 1);
  assert.equal(r1.errors.length, 0, JSON.stringify(r1.errors));
  assert.equal(repo.activeCourses().length, 1);
  assert.equal(repo.assignments(1).length, 1);
  assert.equal(repo.files(1).length, 1);
  assert.equal(repo.moduleItems(1).length, 1);
  // new upcoming assignment is reported even on first sync
  assert.deepEqual(repo.changes().map((c) => c.kind), ["assignment.new"]);

  // mutate: due date moves, grade gets posted, a new file appears
  const assignments = data["/courses/1/assignments"] as Array<Record<string, unknown>>;
  const newDue = new Date(Date.now() + 7 * 86400e3).toISOString();
  assignments[0]!.due_at = newDue;
  assignments[0]!.submission = { id: 1, assignment_id: 100, score: 9, grade: "9", submitted_at: future, graded_at: new Date().toISOString(), workflow_state: "graded", late: false, missing: false, excused: false };
  (data["/courses/1/files"] as unknown[]).push({ id: 901, folder_id: 1, display_name: "slides2.pdf", filename: "slides2.pdf", size: 120, "content-type": "application/pdf", url: "https://y", created_at: "", updated_at: "2026-09-08T00:00:00Z", modified_at: "2026-09-08T00:00:00Z", locked: false, hidden: false });

  const r2 = await runSync(fakeCanvas(data), db);
  assert.equal(r2.errors.length, 0, JSON.stringify(r2.errors));
  const kinds = repo.changes().map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["assignment.due_changed", "assignment.new", "file.new", "grade.posted"]);
  assert.equal(repo.assignments(1)[0]!.due_at, newDue);
  assert.equal(repo.submission(100)!.score, 9);

  // unchanged third sync produces no new changes
  const before = repo.changes().length;
  await runSync(fakeCanvas(data), db);
  assert.equal(repo.changes().length, before);
  db.close();
});
