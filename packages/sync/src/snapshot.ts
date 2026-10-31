import type { CourseSnapshot } from "@acacia/course-config";
import type { Repo } from "@acacia/db";

/** Build the dependency-free snapshot that heuristics / AI proposers consume. */
export function buildCourseSnapshot(repo: Repo, courseId: number): CourseSnapshot | null {
  const course = repo.course(courseId);
  if (!course) return null;

  const groups = repo.assignmentGroups(courseId);
  const assignments = repo.assignments(courseId);
  const modules = repo.modules(courseId);
  const items = repo.moduleItems(courseId);
  const folders = new Map(repo.folders(courseId).map((f) => [f.id, f.full_name]));

  const externalToolUrls = new Set<string>();
  for (const it of items) if (it.external_url) externalToolUrls.add(it.external_url);
  for (const a of assignments) {
    try {
      const raw = JSON.parse(a.raw_json) as { external_tool_tag_attributes?: { url?: string } };
      if (raw.external_tool_tag_attributes?.url) externalToolUrls.add(raw.external_tool_tag_attributes.url);
    } catch {
      /* ignore */
    }
  }
  for (const t of repo.tabs(courseId)) {
    if (t.tab_id.startsWith("context_external_tool")) externalToolUrls.add(t.label);
  }

  const groupCounts = new Map<number, number>();
  for (const a of assignments) if (a.group_id) groupCounts.set(a.group_id, (groupCounts.get(a.group_id) ?? 0) + 1);

  const discussionAssignments = assignments.filter((a) => a.kind === "discussion");

  return {
    courseId,
    name: course.name,
    courseCode: course.course_code,
    termName: course.term_name,
    startAt: course.start_at,
    endAt: course.end_at,
    applyGroupWeights: course.apply_group_weights === 1,
    syllabusBody: course.syllabus_body,
    tabs: repo.tabs(courseId).map((t) => ({ id: t.tab_id, label: t.label, hidden: t.hidden === 1 })),
    assignmentGroups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      weight: g.weight,
      dropLowest: g.drop_lowest,
      dropHighest: g.drop_highest,
      count: groupCounts.get(g.id) ?? 0,
    })),
    assignments: assignments.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      dueAt: a.due_at,
      submissionTypes: JSON.parse(a.submission_types) as string[],
      groupId: a.group_id,
    })),
    announcements: repo.announcements(courseId, 500).map((a) => ({ id: a.id, postedAt: a.posted_at })),
    discussions: { count: discussionAssignments.length, withReplies: 0 },
    modules: modules.map((m) => {
      const mi = items.filter((i) => i.module_id === m.id);
      return { id: m.id, name: m.name, itemTypes: mi.map((i) => i.type), itemCount: mi.length };
    }),
    files: repo.files(courseId).map((f) => ({
      id: f.id,
      displayName: f.display_name,
      folder: f.folder_id ? (folders.get(f.folder_id) ?? null) : null,
      contentType: f.content_type,
    })),
    pages: repo.pages(courseId).map((p) => ({ url: p.url, title: p.title, frontPage: p.front_page === 1 })),
    externalToolUrls: [...externalToolUrls],
  };
}
