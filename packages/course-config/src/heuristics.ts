import type { CourseInfoInput } from "./schema.ts";

/**
 * A compact, dependency-free description of a course as synced from Canvas.
 * Built by the server from DB rows; consumed by heuristics and (later) the AI proposer.
 */
export interface CourseSnapshot {
  courseId: number;
  name: string;
  courseCode: string;
  termName: string | null;
  startAt: string | null;
  endAt: string | null;
  applyGroupWeights: boolean;
  syllabusBody: string | null;
  tabs: Array<{ id: string; label: string; hidden: boolean }>;
  assignmentGroups: Array<{ id: number; name: string; weight: number; dropLowest: number; dropHighest: number; count: number }>;
  assignments: Array<{ id: number; name: string; kind: string; dueAt: string | null; submissionTypes: string[]; groupId: number | null }>;
  announcements: Array<{ id: number; postedAt: string | null }>;
  discussions: { count: number; withReplies: number };
  modules: Array<{ id: number; name: string; itemTypes: string[]; itemCount: number }>;
  files: Array<{ id: number; displayName: string; folder: string | null; contentType: string | null }>;
  pages: Array<{ url: string; title: string; frontPage: boolean }>;
  externalToolUrls: string[];
}

const KNOWN_TOOLS: Array<{ pattern: RegExp; name: string; role: NonNullable<CourseInfoInput["external"]>[number]["role"] }> = [
  { pattern: /gradescope\.com/i, name: "Gradescope", role: "homework_submission" },
  { pattern: /piazza\.com/i, name: "Piazza", role: "discussions" },
  { pattern: /edstem\.org|edstem/i, name: "Ed Discussion", role: "discussions" },
  { pattern: /panopto/i, name: "Panopto", role: "lecture_video" },
  { pattern: /kaltura|mediaspace/i, name: "Kaltura", role: "lecture_video" },
  { pattern: /zoom\.us/i, name: "Zoom", role: "lecture_video" },
  { pattern: /webassign|mylab|pearson|cengage|mcgraw|wiley|zybooks|perusall/i, name: "Publisher platform", role: "textbook" },
  { pattern: /github\.com|gitlab/i, name: "GitHub/GitLab", role: "homework_submission" },
  { pattern: /prairielearn/i, name: "PrairieLearn", role: "homework_submission" },
];

/**
 * Deterministic inference from Canvas data. No network, no AI.
 * Returns a partial info.yaml; every value is marked provenance "heuristic" by the store.
 */
export function inferCourseInfo(s: CourseSnapshot): CourseInfoInput {
  const out: CourseInfoInput = {};

  // ---- tabs ----
  const visibleTabs = s.tabs.filter((t) => !t.hidden).map((t) => t.id);
  const hiddenTabs = s.tabs.filter((t) => t.hidden).map((t) => t.id);

  // ---- structure ----
  const weekly = s.modules.filter((m) => /\b(week|wk|lecture|session|day)\s*\d+|\bw\d{1,2}\b/i.test(m.name)).length;
  let module_pattern: "weekly" | "topical" | "none" | "unknown" = "unknown";
  if (s.modules.length === 0) module_pattern = "none";
  else if (weekly >= Math.max(2, s.modules.length / 2)) module_pattern = "weekly";
  else module_pattern = "topical";

  let organized_by: "modules" | "assignments" | "pages" | "files" | "unknown" = "unknown";
  const moduleItems = s.modules.reduce((n, m) => n + m.itemCount, 0);
  if (moduleItems >= 5 && !hiddenTabs.includes("modules")) organized_by = "modules";
  else if (s.files.length >= 5 && !hiddenTabs.includes("files")) organized_by = "files";
  else if (s.pages.length >= 5 && !hiddenTabs.includes("pages")) organized_by = "pages";
  else if (s.assignments.length >= 3) organized_by = "assignments";

  out.structure = { organized_by, module_pattern, tabs_used: visibleTabs, tabs_unused: hiddenTabs };

  // ---- content sources ----
  const moduleFileCount = s.modules.reduce((n, m) => n + m.itemTypes.filter((t) => t === "File").length, 0);
  const slidesFiles = s.files.filter((f) => /slide|lecture|deck|\.pptx?$/i.test(f.displayName) || /pptx|powerpoint|presentation/i.test(f.contentType ?? ""));
  const readingsFiles = s.files.filter((f) => /read|chapter|paper|textbook/i.test(f.displayName) || /read/i.test(f.folder ?? ""));

  const slides = moduleFileCount >= 3 ? "modules" : slidesFiles.length >= 2 ? "files" : s.files.length ? "files" : "unknown";
  const readings = readingsFiles.length >= 2 ? "files" : moduleFileCount >= 3 ? "modules" : "unknown";

  const externalSubmissions = s.assignments.filter((a) => a.submissionTypes.includes("external_tool")).length;
  const onlineSubmissions = s.assignments.filter((a) =>
    a.submissionTypes.some((t) => ["online_upload", "online_text_entry", "online_quiz", "online_url"].includes(t)),
  ).length;
  const homework =
    externalSubmissions > onlineSubmissions ? "external" : onlineSubmissions > 0 ? "assignments" : s.assignments.length ? "assignments" : "unknown";

  const syllabusFile = s.files.find((f) => /syllabus/i.test(f.displayName));
  const syllabusPage = s.pages.find((p) => /syllabus/i.test(p.title));
  out.content_sources = {
    slides,
    readings,
    homework,
    syllabus: {
      file_id: syllabusFile?.id ?? null,
      page_url: syllabusPage?.url ?? null,
      in_syllabus_body: !!(s.syllabusBody && s.syllabusBody.replace(/<[^>]+>/g, "").trim().length > 50),
    },
  };

  // ---- grading ----
  const weighted = s.applyGroupWeights && s.assignmentGroups.some((g) => g.weight > 0);
  const categories: NonNullable<CourseInfoInput["grading"]>["categories"] = {};
  for (const g of s.assignmentGroups) {
    categories[g.name] = {
      weight: weighted ? g.weight : null,
      drop_lowest: g.dropLowest,
      drop_highest: g.dropHighest,
      canvas_group_id: g.id,
    };
  }
  out.grading = {
    weights_in_canvas: weighted,
    weights_from: weighted ? "canvas" : syllabusFile || syllabusPage || out.content_sources.syllabus?.in_syllabus_body ? "syllabus" : "unknown",
    categories,
  };

  // ---- external tools ----
  const seen = new Set<string>();
  const external: NonNullable<CourseInfoInput["external"]> = [];
  for (const url of s.externalToolUrls) {
    for (const tool of KNOWN_TOOLS) {
      if (tool.pattern.test(url) && !seen.has(tool.name)) {
        seen.add(tool.name);
        external.push({ name: tool.name, url: safeOrigin(url), role: tool.role });
      }
    }
  }
  if (external.length) out.external = external;

  // ---- professor habits ----
  const weeks = courseWeeksSoFar(s.startAt);
  const perWeek = weeks > 0 ? s.announcements.length / weeks : s.announcements.length;
  const announcement_frequency = s.announcements.length === 0 ? "none" : perWeek >= 1.5 ? "high" : perWeek >= 0.5 ? "medium" : "low";

  out.professor_habits = {
    announcement_frequency,
    uses_discussions: s.discussions.withReplies > 0,
  };

  return out;
}

function courseWeeksSoFar(startAt: string | null): number {
  if (!startAt) return 0;
  const ms = Date.now() - new Date(startAt).getTime();
  return Math.max(0, Math.floor(ms / (7 * 24 * 3600 * 1000)));
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
