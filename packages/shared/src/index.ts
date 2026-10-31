/**
 * DTO types exchanged between apps/server and apps/web, plus pure helpers
 * (grade math) both sides need. Keep this package dependency-free and browser-safe.
 */

export * from "./grades.ts";

export type ISODate = string;

export interface CourseSummaryDto {
  id: number;
  name: string;
  courseCode: string;
  alias: string | null;
  color: string | null;
  importance: "high" | "normal" | "low";
  term: string | null;
  upcomingCount: number;
  unreadAnnouncements: number;
  currentGrade: number | null;
  currentLetter: string | null;
}

export type ItemKind = "assignment" | "quiz" | "discussion" | "event" | "key_date" | "task";

export interface UpcomingItemDto {
  id: string;
  kind: ItemKind;
  courseId: number;
  courseAlias: string;
  courseColor: string | null;
  title: string;
  dueAt: ISODate | null;
  pointsPossible: number | null;
  submitted: boolean;
  graded: boolean;
  localState: "none" | "started" | "done";
  htmlUrl: string | null;
}

export interface AnnouncementDto {
  id: number;
  courseId: number;
  title: string;
  message: string;
  postedAt: ISODate | null;
  author: string | null;
  read: boolean;
  htmlUrl: string | null;
}

export interface ModuleItemDto {
  id: number;
  title: string;
  type: string;
  position: number;
  contentId: number | null;
  htmlUrl: string | null;
  externalUrl: string | null;
  isNew: boolean;
}

export interface ModuleDto {
  id: number;
  name: string;
  position: number;
  unlockAt: ISODate | null;
  items: ModuleItemDto[];
  isCurrent: boolean;
}

export interface FileDto {
  id: number;
  courseId: number;
  displayName: string;
  folderPath: string | null;
  size: number;
  contentType: string | null;
  updatedAt: ISODate | null;
  isNew: boolean;
  localPath: string | null;
}

export interface GradeCategoryDto {
  name: string;
  weight: number | null;
  dropLowest: number;
  earned: number;
  possible: number;
  percent: number | null;
}

export interface GradesDto {
  courseId: number;
  currentPercent: number | null;
  currentLetter: string | null;
  canvasCurrentScore: number | null;
  categories: GradeCategoryDto[];
  assignments: Array<{
    id: number;
    name: string;
    group: string;
    score: number | null;
    pointsPossible: number | null;
    gradedAt: ISODate | null;
    excused: boolean;
  }>;
}

export type ChangeKind =
  | "assignment.new"
  | "assignment.due_changed"
  | "assignment.description_changed"
  | "assignment.points_changed"
  | "announcement.new"
  | "file.new"
  | "file.updated"
  | "module_item.new"
  | "grade.posted"
  | "grade.changed"
  | "event.new";

export interface ChangeDto {
  id: number;
  kind: ChangeKind;
  courseId: number;
  courseAlias: string;
  entityType: string;
  entityId: string;
  title: string;
  detail: string | null;
  detectedAt: ISODate;
  seen: boolean;
}

export interface CoursePageDto {
  course: CourseSummaryDto;
  layout: LayoutSegmentDto[];
  upcoming: UpcomingItemDto[];
  announcements: AnnouncementDto[];
  modules: ModuleDto[];
  files: FileDto[];
  grades: GradesDto;
  info: unknown; // CourseInfo (from @acacia/course-config), kept opaque here
  workflow: unknown; // CourseWorkflow
}

export interface LayoutSegmentDto {
  type: "upcoming" | "announcements" | "modules" | "files" | "pages" | "discussions" | "grades" | "syllabus_card" | "tasks";
  options: Record<string, unknown>;
}

export interface SyncStatusDto {
  running: boolean;
  lastRunAt: ISODate | null;
  lastRunOk: boolean | null;
  lastError: string | null;
  changesLastRun: number;
}

export interface ConfigFilesDto {
  courseId: number;
  infoYaml: string;
  workflowYaml: string;
  infoResolved: unknown;
  workflowResolved: unknown;
}
