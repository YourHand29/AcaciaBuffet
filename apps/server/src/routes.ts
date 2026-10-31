import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { ChangeDto, ConfigFilesDto } from "@acacia/shared";
import { mirrorCourseFiles } from "@acacia/sync";
import type { AppContext } from "./context.ts";
import { env } from "./env.ts";
import { allCourseCtx, coursePage, courseSummary, labelFor, loadCourseCtx } from "./services/courses.ts";
import { buildUpcoming } from "./services/upcoming.ts";
import { analyzeAllCourses, analyzeCourse } from "./services/analyze.ts";
import type { SyncService } from "./services/sync-service.ts";

const DAY = 86400e3;

export function createApi(ctx: AppContext, sync: SyncService) {
  const api = new Hono();
  api.use("*", cors());

  api.onError((err, c) => {
    ctx.log(`error: ${err.message}`);
    const status = err.name === "ZodError" || err.name === "YAMLParseError" ? 400 : 500;
    return c.json({ error: err.message, name: err.name }, status);
  });

  // ---- sync ----
  api.get("/sync/status", (c) => c.json(sync.status()));
  api.post("/sync", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { wait, skipFiles } = z.object({ wait: z.boolean().default(false), skipFiles: z.boolean().default(false) }).parse(body);
    const p = sync.trigger({ skipFiles });
    if (wait) return c.json(await p);
    return c.json({ started: true });
  });

  // ---- dashboard ----
  api.get("/dashboard", (c) => {
    const days = Number(c.req.query("days") ?? 14);
    const courses = allCourseCtx(ctx);
    const now = Date.now();
    return c.json({
      courses: courses.map((cc) => courseSummary(ctx, cc)),
      upcoming: buildUpcoming(ctx.repo, courses, new Date(now - DAY).toISOString(), new Date(now + days * DAY).toISOString()),
      changes: changesDto(ctx, 30),
      sync: sync.status(),
    });
  });

  api.get("/upcoming", (c) => {
    const from = c.req.query("from") ?? new Date().toISOString();
    const to = c.req.query("to") ?? new Date(Date.now() + 30 * DAY).toISOString();
    return c.json(buildUpcoming(ctx.repo, allCourseCtx(ctx), from, to));
  });

  // ---- courses ----
  api.get("/courses", (c) => c.json(allCourseCtx(ctx).map((cc) => courseSummary(ctx, cc))));

  api.get("/courses/:id", (c) => {
    const course = ctx.repo.course(Number(c.req.param("id")));
    if (!course) return c.json({ error: "not found" }, 404);
    return c.json(coursePage(ctx, loadCourseCtx(ctx, course)));
  });

  api.get("/courses/:id/pages", (c) => {
    const id = Number(c.req.param("id"));
    return c.json(ctx.repo.pages(id).map((p) => ({ pageId: p.page_id, url: p.url, title: p.title, frontPage: p.front_page === 1, updatedAt: p.updated_at })));
  });
  api.get("/courses/:id/pages/:url", (c) => {
    const id = Number(c.req.param("id"));
    const page = ctx.repo.pages(id).find((p) => p.url === c.req.param("url"));
    if (!page) return c.json({ error: "not found" }, 404);
    return c.json({ pageId: page.page_id, url: page.url, title: page.title, body: page.body, updatedAt: page.updated_at });
  });

  api.post("/courses/:id/files/mirror", async (c) => {
    const id = Number(c.req.param("id"));
    const course = ctx.repo.course(id);
    if (!course) return c.json({ error: "not found" }, 404);
    const cc = loadCourseCtx(ctx, course);
    const download = cc.workflow.automations.on_new_file.find((a) => a.action === "download");
    const stats = await mirrorCourseFiles(ctx.client, ctx.db, ctx.repo, id, {
      rootDir: env.filesDir,
      courseLabel: labelFor(cc),
      include: download?.include,
      exclude: download?.exclude,
      logger: ctx.log,
    });
    return c.json(stats);
  });

  // ---- config ----
  api.get("/courses/:id/config", (c) => {
    const id = Number(c.req.param("id"));
    const resolved = ctx.configs.resolve(id);
    const dto: ConfigFilesDto = {
      courseId: id,
      infoYaml: ctx.configs.readRaw(id, "info"),
      workflowYaml: ctx.configs.readRaw(id, "workflow"),
      infoResolved: resolved.info,
      workflowResolved: resolved.workflow,
    };
    return c.json(dto);
  });

  api.put("/courses/:id/config/:kind", async (c) => {
    const id = Number(c.req.param("id"));
    const kind = z.enum(["info", "workflow"]).parse(c.req.param("kind"));
    const { yaml } = z.object({ yaml: z.string() }).parse(await c.req.json());
    ctx.configs.writeRaw(id, kind, yaml);
    return c.json({ ok: true, resolved: ctx.configs.resolve(id)[kind] });
  });

  api.patch("/courses/:id/config/:kind", async (c) => {
    const id = Number(c.req.param("id"));
    const kind = z.enum(["info", "workflow"]).parse(c.req.param("kind"));
    const patch = (await c.req.json()) as Record<string, unknown>;
    if (kind === "info") ctx.configs.patchUser(id, "info", patch);
    else ctx.configs.patchUser(id, "workflow", patch);
    return c.json({ ok: true, resolved: ctx.configs.resolve(id)[kind] });
  });

  api.post("/courses/:id/analyze", async (c) => {
    const id = Number(c.req.param("id"));
    const useAi = c.req.query("ai") === "1";
    const result = await analyzeCourse(ctx, id, { useAi });
    if (!result) return c.json({ error: "not found" }, 404);
    return c.json(result);
  });
  api.post("/analyze", async (c) => c.json(await analyzeAllCourses(ctx)));

  // ---- changes ----
  api.get("/changes", (c) => c.json(changesDto(ctx, Number(c.req.query("limit") ?? 100))));
  api.post("/changes/seen", async (c) => {
    const { ids } = z.object({ ids: z.array(z.number()) }).parse(await c.req.json());
    ctx.repo.markChangesSeen(ids);
    return c.json({ ok: true });
  });

  // ---- local item state ----
  api.put("/items/:type/:id/state", async (c) => {
    const { state } = z.object({ state: z.enum(["none", "started", "done"]) }).parse(await c.req.json());
    ctx.repo.setItemState(c.req.param("type"), c.req.param("id"), state);
    return c.json({ ok: true });
  });

  // ---- tasks ----
  api.get("/tasks", (c) => {
    const courseId = c.req.query("courseId");
    return c.json(ctx.repo.tasks(courseId ? Number(courseId) : undefined));
  });
  api.post("/tasks", async (c) => {
    const body = z
      .object({
        title: z.string().min(1),
        course_id: z.number().nullable().optional(),
        parent_id: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
        due_at: z.string().nullable().optional(),
        source_type: z.string().nullable().optional(),
        source_id: z.string().nullable().optional(),
      })
      .parse(await c.req.json());
    return c.json(ctx.repo.createTask(body), 201);
  });
  api.patch("/tasks/:id", async (c) => {
    const patch = z
      .object({
        title: z.string().min(1).optional(),
        notes: z.string().nullable().optional(),
        due_at: z.string().nullable().optional(),
        state: z.enum(["todo", "doing", "done"]).optional(),
      })
      .parse(await c.req.json());
    const t = ctx.repo.updateTask(Number(c.req.param("id")), patch);
    return t ? c.json(t) : c.json({ error: "not found" }, 404);
  });
  api.delete("/tasks/:id", (c) => {
    ctx.repo.deleteTask(Number(c.req.param("id")));
    return c.json({ ok: true });
  });

  return api;
}

function changesDto(ctx: AppContext, limit: number): ChangeDto[] {
  const aliases = new Map(allCourseCtx(ctx).map((cc) => [cc.course.id, labelFor(cc)]));
  return ctx.repo.changes(limit).map((ch) => ({
    id: ch.id,
    kind: ch.kind as ChangeDto["kind"],
    courseId: ch.course_id,
    courseAlias: aliases.get(ch.course_id) ?? String(ch.course_id),
    entityType: ch.entity_type,
    entityId: ch.entity_id,
    title: ch.title,
    detail: ch.detail,
    detectedAt: ch.detected_at,
    seen: ch.seen === 1,
  }));
}
