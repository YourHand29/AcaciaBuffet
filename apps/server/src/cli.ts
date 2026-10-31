/**
 * Minimal CLI for working without the UI.
 *
 *   pnpm cli sync [--skip-files]        pull everything from Canvas
 *   pnpm cli analyze [courseId]          run heuristics and write info.generated.yaml
 *   pnpm cli courses                     list synced courses
 *   pnpm cli upcoming [days]             print the merged timeline
 *   pnpm cli changes                     print the change feed
 *   pnpm cli mirror <courseId>           download files for a course
 *   pnpm cli whoami                      check the token
 */
import { mirrorCourseFiles, runSync } from "@acacia/sync";
import { createContext } from "./context.ts";
import { env } from "./env.ts";
import { analyzeAllCourses, analyzeCourse } from "./services/analyze.ts";
import { allCourseCtx, labelFor, loadCourseCtx } from "./services/courses.ts";
import { buildUpcoming } from "./services/upcoming.ts";

const [cmd = "help", ...args] = process.argv.slice(2);
const ctx = createContext();

try {
  switch (cmd) {
    case "whoami": {
      console.log(await ctx.client.self());
      break;
    }
    case "sync": {
      const r = await runSync(ctx.client, ctx.db, { skipFiles: args.includes("--skip-files"), logger: ctx.log });
      console.log(`\n${r.courses} courses, ${r.changes} changes`);
      for (const e of r.errors) console.log(`  ! course ${e.courseId} ${e.step}: ${e.error}`);
      break;
    }
    case "analyze": {
      const id = args[0] ? Number(args[0]) : null;
      const results = id ? [await analyzeCourse(ctx, id)] : await analyzeAllCourses(ctx);
      for (const r of results) {
        if (!r) continue;
        console.log(`\n# course ${r.courseId}\n${r.summary}`);
      }
      console.log(`\nwrote info.generated.yaml under ${env.configDir}/courses/<id>/`);
      break;
    }
    case "courses": {
      for (const c of allCourseCtx(ctx)) {
        console.log(`${String(c.course.id).padEnd(8)} ${labelFor(c).padEnd(12)} ${c.course.name}`);
      }
      break;
    }
    case "upcoming": {
      const days = Number(args[0] ?? 14);
      const items = buildUpcoming(ctx.repo, allCourseCtx(ctx), new Date().toISOString(), new Date(Date.now() + days * 86400e3).toISOString());
      for (const it of items) {
        console.log(`${(it.dueAt ?? "").slice(0, 16).padEnd(17)} ${it.kind.padEnd(10)} ${it.courseAlias.padEnd(12)} ${it.title}`);
      }
      break;
    }
    case "changes": {
      for (const ch of ctx.repo.changes(50)) {
        console.log(`${ch.detected_at.slice(0, 16)} ${ch.kind.padEnd(30)} ${ch.title}${ch.detail ? ` (${ch.detail})` : ""}`);
      }
      break;
    }
    case "mirror": {
      const id = Number(args[0]);
      const course = ctx.repo.course(id);
      if (!course) throw new Error(`unknown course ${id}`);
      const cc = loadCourseCtx(ctx, course);
      const stats = await mirrorCourseFiles(ctx.client, ctx.db, ctx.repo, id, { rootDir: env.filesDir, courseLabel: labelFor(cc), logger: ctx.log });
      console.log(stats);
      break;
    }
    default:
      console.log("commands: whoami | sync [--skip-files] | analyze [courseId] | courses | upcoming [days] | changes | mirror <courseId>");
  }
} finally {
  ctx.db.close();
}
