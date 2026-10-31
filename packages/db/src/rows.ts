/** Row types mirror the tables in schema.ts. SQLite booleans are 0/1 integers. */

interface Tracked {
  raw_json: string;
  content_hash: string;
  first_seen: string;
  last_changed: string;
  last_seen: string;
}

export interface CourseRow extends Tracked {
  id: number;
  name: string;
  course_code: string;
  workflow_state: string;
  term_name: string | null;
  start_at: string | null;
  end_at: string | null;
  apply_group_weights: number;
  grading_standard_id: number | null;
  current_score: number | null;
  current_grade: string | null;
  syllabus_body: string | null;
  active: number;
}

export interface CourseTabRow {
  course_id: number;
  tab_id: string;
  label: string;
  hidden: number;
  position: number;
}

export interface AssignmentGroupRow extends Tracked {
  id: number;
  course_id: number;
  name: string;
  position: number;
  weight: number;
  drop_lowest: number;
  drop_highest: number;
  never_drop: string;
}

export type AssignmentKind = "assignment" | "quiz" | "discussion";

export interface AssignmentRow extends Tracked {
  id: number;
  course_id: number;
  group_id: number | null;
  name: string;
  description: string | null;
  due_at: string | null;
  lock_at: string | null;
  unlock_at: string | null;
  points_possible: number | null;
  submission_types: string;
  kind: AssignmentKind;
  html_url: string | null;
  published: number;
  omit_from_final: number;
  canvas_updated_at: string | null;
}

export interface SubmissionRow extends Tracked {
  assignment_id: number;
  course_id: number;
  score: number | null;
  grade: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  workflow_state: string;
  late: number;
  missing: number;
  excused: number;
  posted_at: string | null;
}

export interface AnnouncementRow extends Tracked {
  id: number;
  course_id: number;
  title: string;
  message: string | null;
  posted_at: string | null;
  author: string | null;
  html_url: string | null;
  read_state: string | null;
}

export interface ModuleRow extends Tracked {
  id: number;
  course_id: number;
  name: string;
  position: number;
  unlock_at: string | null;
}

export interface ModuleItemRow extends Tracked {
  id: number;
  module_id: number;
  course_id: number;
  title: string;
  type: string;
  position: number;
  content_id: number | null;
  html_url: string | null;
  external_url: string | null;
  page_url: string | null;
}

export interface FolderRow {
  id: number;
  course_id: number;
  name: string;
  full_name: string;
  parent_folder_id: number | null;
}

export interface FileRow extends Tracked {
  id: number;
  course_id: number;
  folder_id: number | null;
  display_name: string;
  filename: string;
  size: number;
  content_type: string | null;
  url: string | null;
  updated_at: string | null;
  modified_at: string | null;
  local_path: string | null;
  downloaded_at: string | null;
}

export interface PageRow extends Tracked {
  page_id: number;
  course_id: number;
  url: string;
  title: string;
  body: string | null;
  front_page: number;
  updated_at: string | null;
}

export interface CalendarEventRow extends Tracked {
  id: number;
  course_id: number;
  title: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  html_url: string | null;
}

export interface ChangeRow {
  id: number;
  kind: string;
  course_id: number;
  entity_type: string;
  entity_id: string;
  title: string;
  detail: string | null;
  detected_at: string;
  seen: number;
}

export interface ItemStateRow {
  entity_type: string;
  entity_id: string;
  state: string;
  updated_at: string;
}

export interface TaskRow {
  id: number;
  course_id: number | null;
  parent_id: number | null;
  title: string;
  notes: string | null;
  due_at: string | null;
  state: "todo" | "doing" | "done";
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GradeSnapshotRow {
  id: number;
  course_id: number;
  taken_at: string;
  canvas_score: number | null;
  canvas_grade: string | null;
  computed_pct: number | null;
}

export interface SyncRunRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  ok: number | null;
  error: string | null;
  changes_count: number;
}
