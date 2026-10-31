import type { CourseInfo } from "@acacia/course-config";
import type { Repo } from "@acacia/db";
import { computeGrade, letterFor, STANDARD_SCHEME, type GradesDto } from "@acacia/shared";

export function buildGrades(repo: Repo, courseId: number, info: CourseInfo): GradesDto {
  const course = repo.course(courseId);
  const groups = repo.assignmentGroups(courseId);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const subs = new Map(repo.submissions(courseId).map((s) => [s.assignment_id, s]));

  // Categories: info.yaml wins (it may carry syllabus weights); fall back to Canvas groups.
  const categories =
    Object.keys(info.grading.categories).length > 0
      ? Object.entries(info.grading.categories).map(([name, c]) => ({
          name,
          weight: c.weight,
          dropLowest: c.drop_lowest,
          dropHighest: c.drop_highest,
          canvasGroupId: c.canvas_group_id,
        }))
      : groups.map((g) => ({
          name: g.name,
          weight: course?.apply_group_weights ? g.weight : null,
          dropLowest: g.drop_lowest,
          dropHighest: g.drop_highest,
          canvasGroupId: g.id as number | null,
        }));

  // Map each assignment to a category: by canvas_group_id when set, else by group name.
  const byGroupId = new Map(categories.filter((c) => c.canvasGroupId != null).map((c) => [c.canvasGroupId!, c.name]));

  const assignments = repo.assignments(courseId).map((a) => {
    const s = subs.get(a.id);
    const group = (a.group_id && (byGroupId.get(a.group_id) ?? groupName.get(a.group_id))) || "Other";
    return {
      id: a.id,
      name: a.name,
      group,
      score: s?.score ?? null,
      pointsPossible: a.points_possible,
      gradedAt: s?.graded_at ?? null,
      excused: s?.excused === 1,
      omitFromFinal: a.omit_from_final === 1,
    };
  });

  const result = computeGrade(assignments, categories);
  const scheme = Object.keys(info.grading.scheme).length ? info.grading.scheme : STANDARD_SCHEME;

  return {
    courseId,
    currentPercent: result.percent,
    currentLetter: letterFor(result.percent, scheme),
    canvasCurrentScore: course?.current_score ?? null,
    categories: result.categories.map((c) => ({
      name: c.name,
      weight: c.weight,
      dropLowest: c.dropLowest,
      earned: c.earned,
      possible: c.possible,
      percent: c.percent,
    })),
    assignments: assignments.map(({ omitFromFinal: _o, ...rest }) => rest),
  };
}
