import { inferCourseInfo, type CourseInfoInput } from "@acacia/course-config";
import { buildCourseSnapshot } from "@acacia/sync";
import type { AppContext } from "../context.ts";

export interface AnalysisResult {
  courseId: number;
  heuristic: CourseInfoInput;
  proposal: CourseInfoInput;
  summary: string;
  proposer: string;
}

/**
 * Run heuristics (and the AI proposer if configured) for a course and persist the
 * result as the generated layer. The user layer is never touched.
 */
export async function analyzeCourse(ctx: AppContext, courseId: number, opts: { useAi?: boolean } = {}): Promise<AnalysisResult | null> {
  const snapshot = buildCourseSnapshot(ctx.repo, courseId);
  if (!snapshot) return null;

  const heuristic = inferCourseInfo(snapshot);
  let proposal = heuristic;
  let summary = describeHeuristic(heuristic);
  let proposer = "heuristic";

  if (opts.useAi && ctx.proposer.name !== "noop") {
    const res = await ctx.proposer.proposeInfo({ snapshot, syllabusText: null, heuristic });
    proposal = res.info;
    summary = res.summary;
    proposer = ctx.proposer.name;
  }

  ctx.configs.writeGenerated(courseId, proposal, proposer === "heuristic" ? "heuristic" : "ai");
  return { courseId, heuristic, proposal, summary, proposer };
}

export async function analyzeAllCourses(ctx: AppContext) {
  const out: AnalysisResult[] = [];
  for (const c of ctx.repo.activeCourses()) {
    const r = await analyzeCourse(ctx, c.id);
    if (r) out.push(r);
  }
  return out;
}

function describeHeuristic(h: CourseInfoInput): string {
  const parts: string[] = [];
  const s = h.structure;
  if (s?.organized_by && s.organized_by !== "unknown") {
    parts.push(`Organized by ${s.organized_by}${s.module_pattern === "weekly" ? " (weekly modules)" : ""}.`);
  }
  if (s?.tabs_unused?.length) parts.push(`Hidden tabs: ${s.tabs_unused.join(", ")}.`);
  const g = h.grading;
  if (g) {
    parts.push(
      g.weights_in_canvas
        ? "Grade weights are set in Canvas."
        : g.weights_from === "syllabus"
          ? "Grade weights are NOT in Canvas; a syllabus was found — weights should be confirmed from it."
          : "Grade weights are not in Canvas and no syllabus was found.",
    );
  }
  if (h.external?.length) parts.push(`External tools: ${h.external.map((e) => e.name).join(", ")}.`);
  const ph = h.professor_habits;
  if (ph?.announcement_frequency && ph.announcement_frequency !== "unknown") {
    parts.push(`Announcement frequency: ${ph.announcement_frequency}.`);
  }
  return parts.join(" ") || "Not enough data yet — run a sync first.";
}
