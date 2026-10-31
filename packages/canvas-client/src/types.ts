/**
 * Minimal Canvas REST API shapes — only the fields we actually use.
 * Every raw response is also stored as JSON in the DB, so new fields can be
 * adopted later without re-syncing.
 */

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  workflow_state: "unpublished" | "available" | "completed" | "deleted";
  start_at: string | null;
  end_at: string | null;
  enrollment_term_id: number;
  term?: { id: number; name: string; start_at: string | null; end_at: string | null };
  enrollments?: Array<{
    type: string;
    role: string;
    enrollment_state: string;
    computed_current_score?: number | null;
    computed_final_score?: number | null;
    computed_current_grade?: string | null;
    computed_final_grade?: string | null;
  }>;
  default_view?: string;
  syllabus_body?: string | null;
  apply_assignment_group_weights?: boolean;
  grading_standard_id?: number | null;
}

export interface CanvasTab {
  id: string;
  label: string;
  type: string;
  hidden?: boolean;
  visibility: string;
  position: number;
}

export interface CanvasSubmission {
  id: number;
  assignment_id: number;
  score: number | null;
  grade: string | null;
  submitted_at: string | null;
  graded_at: string | null;
  workflow_state: "submitted" | "unsubmitted" | "graded" | "pending_review";
  late: boolean;
  missing: boolean;
  excused: boolean;
  posted_at?: string | null;
  submission_comments?: Array<{ id: number; comment: string; created_at: string; author_name: string }>;
}

export interface CanvasAssignment {
  id: number;
  course_id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  lock_at: string | null;
  unlock_at: string | null;
  points_possible: number | null;
  assignment_group_id: number;
  submission_types: string[];
  html_url: string;
  published: boolean;
  is_quiz_assignment?: boolean;
  quiz_id?: number;
  discussion_topic?: { id: number };
  updated_at: string;
  submission?: CanvasSubmission;
  omit_from_final_grade?: boolean;
  has_submitted_submissions?: boolean;
  score_statistics?: { min: number; max: number; mean: number };
}

export interface CanvasAssignmentGroup {
  id: number;
  name: string;
  position: number;
  group_weight: number;
  rules?: {
    drop_lowest?: number;
    drop_highest?: number;
    never_drop?: number[];
  };
  assignments?: CanvasAssignment[];
}

export interface CanvasDiscussionTopic {
  id: number;
  title: string;
  message: string | null;
  posted_at: string | null;
  html_url: string;
  author?: { display_name?: string };
  read_state?: "read" | "unread";
  is_announcement?: boolean;
  context_code?: string;
  discussion_subentry_count?: number;
}

export interface CanvasModuleItem {
  id: number;
  module_id: number;
  position: number;
  title: string;
  type: "File" | "Page" | "Discussion" | "Assignment" | "Quiz" | "SubHeader" | "ExternalUrl" | "ExternalTool";
  content_id?: number;
  html_url?: string;
  url?: string;
  external_url?: string;
  page_url?: string;
  published?: boolean;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  unlock_at: string | null;
  state?: string;
  items_count: number;
  items?: CanvasModuleItem[];
  published?: boolean;
}

export interface CanvasFile {
  id: number;
  folder_id: number;
  display_name: string;
  filename: string;
  size: number;
  "content-type": string;
  url: string;
  created_at: string;
  updated_at: string;
  modified_at: string;
  locked: boolean;
  hidden: boolean;
}

export interface CanvasFolder {
  id: number;
  name: string;
  full_name: string;
  parent_folder_id: number | null;
  context_id: number;
  context_type: string;
}

export interface CanvasCalendarEvent {
  id: number;
  title: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  location_name: string | null;
  context_code: string;
  html_url: string;
  type?: "event" | "assignment";
  updated_at: string;
}

export interface CanvasPage {
  page_id: number;
  url: string;
  title: string;
  body?: string | null;
  updated_at: string;
  published: boolean;
  front_page: boolean;
}

export interface CanvasUser {
  id: number;
  name: string;
  short_name: string;
  primary_email?: string;
}
