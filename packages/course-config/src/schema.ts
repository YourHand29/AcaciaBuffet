import { z } from "zod";

/**
 * Two config files per course:
 *
 *   info.yaml      — DESCRIPTIVE. What the course *is*: structure, where content lives,
 *                    grading model, syllabus facts, external tools. Authored mostly by
 *                    heuristics + AI, confirmed by the user. Safe to regenerate and diff.
 *
 *   workflow.yaml  — PRESCRIPTIVE. How the user wants to *work* with the course: layout,
 *                    routines, task templates, automations, notifications. Authored by the
 *                    user (AI may suggest). Never auto-overwritten.
 *
 * Every field has a default so a missing/empty file is valid. The zod `input` type is the
 * shape of what may appear in a file (all optional); the `output` type is fully resolved.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const Priority = z.enum(["high", "normal", "low"]);
export const Importance = Priority;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "expected YYYY-MM-DD or ISO datetime");

/** Relative offset like "-3d", "+2h", "-1w". Negative = before the anchor. */
export const Offset = z.string().regex(/^[+-]?\d+[hdw]$/, "expected e.g. -3d, +2h, -1w");

export const Provenance = z.enum(["default", "heuristic", "ai", "user"]);

// ---------------------------------------------------------------------------
// info.yaml
// ---------------------------------------------------------------------------

export const ContentLocation = z.enum(["modules", "files", "pages", "assignments", "external", "none", "unknown"]);

export const ExternalToolRole = z.enum([
  "homework_submission",
  "grades",
  "discussions",
  "lecture_video",
  "textbook",
  "other",
]);

export const GradeCategory = z.object({
  weight: z.number().min(0).max(100).nullable().default(null),
  drop_lowest: z.number().int().min(0).default(0),
  drop_highest: z.number().int().min(0).default(0),
  /** Canvas assignment_group id this category maps to, when known. */
  canvas_group_id: z.number().int().nullable().default(null),
});

export const KeyDate = z.object({
  name: z.string(),
  date: IsoDate,
  end: IsoDate.nullable().default(null),
  location: z.string().nullable().default(null),
  kind: z.enum(["exam", "quiz", "project", "holiday", "deadline", "other"]).default("exam"),
  /** Canvas calendar_event id if this mirrors one, so we don't double-show it. */
  canvas_event_id: z.number().int().nullable().default(null),
});

export const CourseInfoSchema = z.object({
  course_id: z.number().int().optional(),
  alias: z.string().nullable().default(null),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  term: z.string().nullable().default(null),

  structure: z
    .object({
      organized_by: z.enum(["modules", "assignments", "pages", "files", "unknown"]).default("unknown"),
      module_pattern: z.enum(["weekly", "topical", "none", "unknown"]).default("unknown"),
      tabs_used: z.array(z.string()).default([]),
      tabs_unused: z.array(z.string()).default([]),
    })
    .prefault({}),

  content_sources: z
    .object({
      slides: ContentLocation.default("unknown"),
      readings: ContentLocation.default("unknown"),
      homework: ContentLocation.default("unknown"),
      syllabus: z
        .object({
          file_id: z.number().int().nullable().default(null),
          page_url: z.string().nullable().default(null),
          /** True when Canvas's own "Syllabus" tab body has content. */
          in_syllabus_body: z.boolean().default(false),
        })
        .prefault({}),
    })
    .prefault({}),

  grading: z
    .object({
      weights_in_canvas: z.boolean().default(false),
      /** Where the authoritative weights come from. */
      weights_from: z.enum(["canvas", "syllabus", "manual", "unknown"]).default("unknown"),
      categories: z.record(z.string(), GradeCategory).prefault({}),
      /** Letter-grade cutoffs as { "A": 93, "A-": 90, ... }. Empty = use standard scale. */
      scheme: z.record(z.string(), z.number()).prefault({}),
    })
    .prefault({}),

  key_dates: z.array(KeyDate).default([]),

  policies: z
    .object({
      late: z.string().nullable().default(null),
      office_hours: z.string().nullable().default(null),
      attendance: z.string().nullable().default(null),
      notes: z.string().nullable().default(null),
    })
    .prefault({}),

  external: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url().nullable().default(null),
        role: ExternalToolRole.default("other"),
      }),
    )
    .default([]),

  professor_habits: z
    .object({
      announcement_frequency: z.enum(["high", "medium", "low", "none", "unknown"]).default("unknown"),
      posts_slides: z.enum(["before_lecture", "after_lecture", "never", "unknown"]).default("unknown"),
      grades_turnaround: z.enum(["fast", "medium", "slow", "unknown"]).default("unknown"),
      uses_discussions: z.boolean().default(false),
    })
    .prefault({}),

  /** Which layer wrote each dotted path, e.g. { "grading.categories": "ai" }. */
  _provenance: z.record(z.string(), Provenance).prefault({}),
});

export type CourseInfo = z.output<typeof CourseInfoSchema>;
export type CourseInfoInput = z.input<typeof CourseInfoSchema>;

// ---------------------------------------------------------------------------
// workflow.yaml
// ---------------------------------------------------------------------------

export const SegmentType = z.enum([
  "upcoming",
  "announcements",
  "modules",
  "files",
  "pages",
  "discussions",
  "grades",
  "syllabus_card",
  "tasks",
]);
export type SegmentType = z.infer<typeof SegmentType>;

/**
 * A layout entry is either a bare segment name ("upcoming") or a single-key
 * object with options ({ modules: { view: current-week } }).
 */
export const LayoutEntry = z.union([
  SegmentType,
  z.partialRecord(SegmentType, z.record(z.string(), z.unknown())),
]);

export const Routine = z.object({
  what: z.string(),
  /** "Mon 09:00" | "daily 18:00" | "3 days before due" — parsed by the scheduler. */
  when: z.string(),
  enabled: z.boolean().default(true),
});

export const TaskTemplate = z.object({
  match: z
    .object({
      /** Grading category name (from info.grading.categories) */
      group: z.string().nullable().default(null),
      /** assignment | quiz | discussion | key_date */
      type: z.string().nullable().default(null),
      /** Regex on the title */
      title: z.string().nullable().default(null),
    })
    .prefault({}),
  /** Rough effort, e.g. "3h". Used for workload views. */
  estimate: z.string().nullable().default(null),
  subtasks: z
    .array(
      z.object({
        name: z.string(),
        /** Offset relative to the due date, e.g. "-3d". */
        offset: Offset.default("-1d"),
      }),
    )
    .default([]),
});

export const Automation = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("download"),
    include: z.array(z.string()).default(["**/*"]),
    exclude: z.array(z.string()).default([]),
  }),
  z.object({
    action: z.literal("create_task"),
    /** Template string; {{file.name}}, {{announcement.title}} etc. are substituted. */
    name: z.string(),
    due: Offset.default("+3d"),
  }),
  z.object({ action: z.literal("summarize") }),
  z.object({ action: z.literal("extract_action_items") }),
  z.object({ action: z.literal("notify"), channel: z.enum(["push", "digest"]).default("push") }),
  z.object({ action: z.literal("recompute_grade") }),
]);

export const NotificationChannel = z.enum(["push", "digest", "off"]);

export const CourseWorkflowSchema = z.object({
  course_id: z.number().int().optional(),
  importance: Importance.default("normal"),

  layout: z
    .array(LayoutEntry)
    .default(["upcoming", "announcements", "modules", "grades", "syllabus_card"]),

  routines: z.array(Routine).default([]),

  task_templates: z.record(z.string(), TaskTemplate).prefault({}),

  automations: z
    .object({
      on_new_file: z.array(Automation).default([]),
      on_announcement: z.array(Automation).default([]),
      on_grade_posted: z.array(Automation).default([]),
      on_assignment_changed: z.array(Automation).default([]),
    })
    .prefault({}),

  notifications: z
    .object({
      channel: NotificationChannel.default("push"),
      /** Hours before due to remind. */
      due_soon: z.array(z.number().positive()).default([48, 6]),
      quiet_hours: z.string().nullable().default(null),
      announcements: NotificationChannel.default("push"),
      new_files: NotificationChannel.default("digest"),
      grade_posted: NotificationChannel.default("push"),
    })
    .prefault({}),

  focus: z
    .object({
      hide_when_done: z.boolean().default(true),
      show_class_stats: z.boolean().default(true),
      /** Only show modules unlocked within this many days of now; 0 = all. */
      module_window_days: z.number().int().min(0).default(0),
    })
    .prefault({}),

  _provenance: z.record(z.string(), Provenance).prefault({}),
});

export type CourseWorkflow = z.output<typeof CourseWorkflowSchema>;
export type CourseWorkflowInput = z.input<typeof CourseWorkflowSchema>;

/** Normalized layout entry used by renderers. */
export interface LayoutSegment {
  type: SegmentType;
  options: Record<string, unknown>;
}

export function normalizeLayout(layout: CourseWorkflow["layout"]): LayoutSegment[] {
  return layout.map((entry) => {
    if (typeof entry === "string") return { type: entry, options: {} };
    const [type, options] = Object.entries(entry)[0] as [SegmentType, Record<string, unknown>];
    return { type, options: options ?? {} };
  });
}
