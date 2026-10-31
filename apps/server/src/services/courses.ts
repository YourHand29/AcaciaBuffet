import { normalizeLayout } from "@acacia/course-config";
import type { CourseRow } from "@acacia/db";
import type { AnnouncementDto, CoursePageDto, CourseSummaryDto, FileDto, ModuleDto } from "@acacia/shared";
import type { AppContext } from "../context.ts";
import { buildGrades } from "./grades.ts";
import { buildUpcoming, labelFor, type CourseCtx } from "./upcoming.ts";

const DAY = 86400e3;
const NEW_WINDOW_DAYS = 7;

export function loadCourseCtx(ctx: AppContext, course: CourseRow): CourseCtx {
  const { info, workflow } = ctx.configs.resolve(course.id);
  return { course, info, workflow };
}

export function allCourseCtx(ctx: AppContext): CourseCtx[] {
  return ctx.repo.activeCourses().map((c) => loadCourseCtx(ctx, c));
}

export function courseSummary(ctx: AppContext, c: CourseCtx): CourseSummaryDto {
  const now = Date.now();
  const upcoming = buildUpcoming(ctx.repo, [c], new Date(now).toISOString(), new Date(now + 7 * DAY).toISOString());
  const unread = ctx.repo.announcements(c.course.id, 50).filter((a) => a.read_state !== "read").length;
  const grades = buildGrades(ctx.repo, c.course.id, c.info);
  return {
    id: c.course.id,
    name: c.course.name,
    courseCode: c.course.course_code,
    alias: c.info.alias,
    color: c.info.color,
    importance: c.workflow.importance,
    term: c.info.term ?? c.course.term_name,
    upcomingCount: upcoming.length,
    unreadAnnouncements: unread,
    currentGrade: grades.currentPercent ?? grades.canvasCurrentScore,
    currentLetter: grades.currentLetter,
  };
}

export function coursePage(ctx: AppContext, c: CourseCtx): CoursePageDto {
  const now = Date.now();
  const newCutoff = new Date(now - NEW_WINDOW_DAYS * DAY).toISOString();
  const firstSync = ctx.db.getMeta("first_sync_at") ?? "";
  const isNew = (firstSeen: string) => firstSeen > newCutoff && firstSeen > firstSync;

  const announcements: AnnouncementDto[] = ctx.repo.announcements(c.course.id).map((a) => ({
    id: a.id,
    courseId: a.course_id,
    title: a.title,
    message: a.message ?? "",
    postedAt: a.posted_at,
    author: a.author,
    read: a.read_state === "read",
    htmlUrl: a.html_url,
  }));

  const items = ctx.repo.moduleItems(c.course.id);
  const modules: ModuleDto[] = ctx.repo.modules(c.course.id).map((m) => ({
    id: m.id,
    name: m.name,
    position: m.position,
    unlockAt: m.unlock_at,
    isCurrent: false,
    items: items
      .filter((i) => i.module_id === m.id)
      .map((i) => ({
        id: i.id,
        title: i.title,
        type: i.type,
        position: i.position,
        contentId: i.content_id,
        htmlUrl: i.html_url,
        externalUrl: i.external_url,
        isNew: isNew(i.first_seen),
      })),
  }));
  markCurrentModule(modules, c.info.structure.module_pattern, c.course.start_at);

  const folders = new Map(ctx.repo.folders(c.course.id).map((f) => [f.id, f.full_name.replace(/^course files\/?/, "")]));
  const files: FileDto[] = ctx.repo.files(c.course.id).map((f) => ({
    id: f.id,
    courseId: f.course_id,
    displayName: f.display_name,
    folderPath: f.folder_id ? (folders.get(f.folder_id) ?? null) : null,
    size: f.size,
    contentType: f.content_type,
    updatedAt: f.updated_at,
    isNew: isNew(f.first_seen),
    localPath: f.local_path,
  }));

  return {
    course: courseSummary(ctx, c),
    layout: normalizeLayout(c.workflow.layout),
    upcoming: buildUpcoming(ctx.repo, [c], new Date(now - DAY).toISOString(), new Date(now + 30 * DAY).toISOString()),
    announcements,
    modules,
    files,
    grades: buildGrades(ctx.repo, c.course.id, c.info),
    info: c.info,
    workflow: c.workflow,
  };
}

/**
 * Pick the module most likely to be "this week": the last one whose unlock date has
 * passed, else (weekly pattern) index by weeks since course start, else the last one
 * containing an item due within ±7 days.
 */
function markCurrentModule(modules: ModuleDto[], pattern: string, startAt: string | null) {
  if (modules.length === 0) return;
  const now = Date.now();
  const unlocked = modules.filter((m) => m.unlockAt && new Date(m.unlockAt).getTime() <= now);
  if (unlocked.length && unlocked.length < modules.length) {
    unlocked.at(-1)!.isCurrent = true;
    return;
  }
  if (pattern === "weekly" && startAt) {
    const week = Math.floor((now - new Date(startAt).getTime()) / (7 * DAY));
    const m = modules[Math.min(Math.max(week, 0), modules.length - 1)];
    if (m) m.isCurrent = true;
    return;
  }
  modules[Math.min(modules.length - 1, Math.max(0, modules.length - 1))]!.isCurrent = true;
}

export { labelFor };
