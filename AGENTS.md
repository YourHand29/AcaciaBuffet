# AcaciaBuffet — Agent Guide

A local, fast, configurable front-end for Canvas LMS. It syncs a student's Canvas data into
SQLite and renders it through **per-course config files** that describe (a) what the course
*is* and (b) how the user wants to *work* with it. This document is the shared map for anyone
— human or agent — working on the codebase. Read it fully before changing anything.

## 1. Product principles

1. **Local-first.** Everything is cached in SQLite; the UI never waits on Canvas.
2. **Config-driven rendering.** Course pages are a loop over `workflow.layout`; there is no
   per-course code. New behaviour = new config field + renderer, not special cases.
3. **Two config files, two lifecycles.**
   - `info.yaml` is *descriptive* (facts about the course). Mostly generated; safe to regenerate.
   - `workflow.yaml` is *prescriptive* (user habits). User-owned; never auto-overwritten.
4. **AI proposes, user decides.** Any AI output is written to a *generated* layer and shown as a
   diff. Nothing AI-produced becomes authoritative without an explicit user action.
5. **Change detection is a first-class feature.** Every synced table carries a `content_hash`;
   anything a student would want to know about lands in the `changes` table.

## 2. Repository layout

```
apps/
  server/      Hono API + background sync scheduler + CLI       (@acacia/server)
  web/         React + Vite UI                                   (@acacia/web)
packages/
  shared/      Browser-safe DTO types + pure grade math          (@acacia/shared)
  canvas-client/  Typed Canvas REST client, pagination, rate-limit (@acacia/canvas-client)
  db/          node:sqlite wrapper, schema/migrations, Repo       (@acacia/db)
  course-config/  Zod schemas for info/workflow, layered store, heuristics, AI interface
  sync/        Canvas → SQLite sync engine, change detection, snapshot builder, file mirror
config/
  defaults/    App-wide info.yaml / workflow.yaml (user-editable, committed)
  courses/<canvasCourseId>/
      info.yaml             user overrides (descriptive)
      workflow.yaml         user overrides (prescriptive)
      info.generated.yaml   heuristic/AI proposal — written by code, never by hand
  courses/_example/         documented examples of both files
data/          SQLite DB + mirrored files (gitignored)
```

Dependency direction (never reverse these):

```
shared ← canvas-client ← db ← course-config ← sync ← server
  ↑                                                    │
  └──────────────────── web ◄── (HTTP only) ───────────┘
```

- `shared` has **zero** deps and must stay browser-safe.
- `web` imports **only** `@acacia/shared`. It talks to the server over `/api`.
- `course-config` must not import `db`; it consumes a plain `CourseSnapshot`.

## 3. Runtime & tooling

- Node ≥ 22.5 (uses built-in `node:sqlite`), pnpm workspaces, TypeScript strict,
  `moduleResolution: bundler`, `verbatimModuleSyntax` (use `import type`).
- Packages export TS source directly (`"exports": { ".": "./src/index.ts" }`); no build step
  for packages. Server runs with `tsx`; web with Vite.
- Tests: `node:test` via `tsx --test` (`pnpm test`). Node's strip-only TS mode is **not**
  sufficient (parameter properties are used).
- Zod **v4**: use `.prefault({})` (not `.default({})`) on nested objects so inner defaults apply.
- Style: 2-space, double quotes, semicolons, trailing commas. Comments only where behaviour is
  non-obvious. Match surrounding code.

Commands:

```
pnpm install
cp .env.example .env            # set CANVAS_BASE_URL and CANVAS_TOKEN
pnpm dev                        # server :4800 + web :5173 (Vite proxies /api)
pnpm cli whoami|sync|analyze|courses|upcoming|changes|mirror <id>   (from apps/server, or `pnpm --filter @acacia/server cli …`)
pnpm typecheck && pnpm test
```

## 4. Data flow

```
Canvas REST ──► canvas-client ──► sync.runSync ──► SQLite (tracked tables + changes)
                                                        │
                      course-config.ConfigStore ◄───────┤  (server builds CourseSnapshot
                      defaults ← generated ← user        │   → heuristics → info.generated.yaml)
                                                        ▼
                                   server services (upcoming / grades / coursePage)
                                                        ▼
                                             /api JSON (DTOs from @acacia/shared)
                                                        ▼
                                      web: SegmentRenderer loops over workflow.layout
```

### 4.1 Sync (`packages/sync/src/sync.ts`)
- One `runSync` call = one `sync_runs` row. Per-course steps are isolated; one failing step
  is recorded in `result.errors` and the rest continue.
- All writes go through `Db.upsertTracked(table, pk, row)`, which compares `content_hash`
  and returns `{ status: inserted|updated|unchanged, previous }`. The sync decides which
  transitions become `changes` rows (see `ChangeKind` in `shared`).
- First sync suppresses "new file / module item / event" noise via `meta.first_sync_at`.
- Rows that disappear from Canvas are **not** deleted; `last_seen` goes stale.

### 4.2 Config resolution (`packages/course-config/src/store.ts`)
```
resolve(courseId) = parse( deepMerge( defaults/<kind>.yaml,
                                      courses/<id>/info.generated.yaml   (info only),
                                      courses/<id>/<kind>.yaml ) )
```
- Objects merge recursively; arrays and scalars replace.
- `_provenance: { "dotted.path": default|heuristic|ai|user }` is rebuilt on every merge and
  included in the resolved object. `writeGenerated` strips any path the user layer owns, so
  re-analysis never clobbers manual choices.
- `writeRaw` validates with Zod before saving a user-edited YAML string.

### 4.3 Course page (`apps/server/src/services/courses.ts`)
`coursePage()` returns everything a course page could need plus `layout` (normalized
`workflow.layout`). The web `SegmentRenderer` renders the segments in order and passes
`segment.options`. Segment types: `upcoming | announcements | modules | files | pages |
discussions | grades | syllabus_card | tasks` (`SegmentType` in `course-config/schema.ts`
and `LayoutSegmentDto.type` in `shared` — keep in sync).

### 4.4 Grades (`packages/shared/src/grades.ts`, `apps/server/src/services/grades.ts`)
Pure `computeGrade()` replicates Canvas: weighted categories, drop lowest/highest by
percentage, renormalization over categories with graded items, excused/omitted ignored.
Categories come from `info.grading.categories` when present (so syllabus weights can
override Canvas), else from Canvas assignment groups.

## 5. The config schema (source of truth: `packages/course-config/src/schema.ts`)

**info.yaml** — `alias, color, term, structure{organized_by, module_pattern, tabs_used/unused},
content_sources{slides, readings, homework, syllabus{file_id,page_url,in_syllabus_body}},
grading{weights_in_canvas, weights_from, categories{name→{weight,drop_lowest,drop_highest,canvas_group_id}}, scheme},
key_dates[], policies{late, office_hours, attendance, notes}, external[{name,url,role}],
professor_habits{…}, _provenance`

**workflow.yaml** — `importance, layout[], routines[], task_templates{name→{match,estimate,subtasks[]}},
automations{on_new_file, on_announcement, on_grade_posted, on_assignment_changed}[Automation],
notifications{channel, due_soon[], quiet_hours, announcements, new_files, grade_posted},
focus{hide_when_done, show_class_stats, module_window_days}, _provenance`

When adding a field: add it to the Zod schema with a default → it is automatically valid in
files, present in resolved output, and editable in the raw YAML editor. Then wire a consumer.

## 6. HTTP API (`apps/server/src/routes.ts`, base `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard?days=` | courses + merged upcoming + recent changes + sync status |
| GET | `/upcoming?from&to` | merged timeline (assignments, events, key_dates, tasks) |
| GET | `/courses` · `/courses/:id` | summaries · full `CoursePageDto` |
| GET | `/courses/:id/pages` · `/pages/:url` | Canvas pages list / body |
| POST | `/courses/:id/files/mirror` | download files per `on_new_file: download` include/exclude |
| GET/PUT/PATCH | `/courses/:id/config[/:kind]` | raw YAML + resolved; PUT body `{yaml}`; PATCH deep-merges into user file |
| POST | `/courses/:id/analyze?ai=1` · `/analyze` | run heuristics (+AI if configured) → `info.generated.yaml` |
| GET/POST | `/changes` · `/changes/seen` | change feed |
| PUT | `/items/:type/:id/state` | local started/done state on Canvas items |
| CRUD | `/tasks` | local tasks |
| GET/POST | `/sync/status` · `/sync` | scheduler status / trigger |

DTOs live in `packages/shared/src/index.ts`. Change the DTO first, then server, then web.

## 7. Working concurrently — ownership boundaries

To avoid conflicts, treat these as separate work areas. Within an area, make changes freely;
across areas, touch only the declared contract (DTOs in `shared`, Zod schema in
`course-config`, SQL in `db/schema.ts`).

| Area | Owns | Contract it exposes |
|---|---|---|
| **Canvas client** | `packages/canvas-client` | typed endpoint methods |
| **Storage** | `packages/db` | `schema.ts` (append-only migrations), `Repo` queries, row types |
| **Sync & detection** | `packages/sync` | `runSync`, `ChangeKind` semantics, `buildCourseSnapshot` |
| **Config model** | `packages/course-config` | Zod schemas, `ConfigStore`, `inferCourseInfo`, `Proposer` |
| **Server services** | `apps/server/src/services/*` | DTO builders |
| **API** | `apps/server/src/routes.ts` | HTTP surface |
| **Web** | `apps/web` | consumes DTOs only |

Rules:
- **Schema changes**: append a new entry to `MIGRATIONS` and bump `SCHEMA_VERSION`. Never edit
  an existing migration. Add the matching row type in `rows.ts`.
- **New change kind**: add to `ChangeKind` (shared), emit in `sync.ts`, render in web
  `ChangeList`.
- **New segment**: add to `SegmentType` (course-config) *and* `LayoutSegmentDto.type` (shared),
  add data to `CoursePageDto` if needed, add a renderer under `web/src/components/segments/`.
- **New Canvas endpoint**: add a typed method to `CanvasClient` and a shape in `types.ts`;
  store `raw_json` so fields can be adopted later without re-sync.
- Keep `shared` dependency-free. Keep `course-config` free of `db` imports.
- Don't commit `.env`, `data/`, or `config/courses/<id>/`.

## 8. Current status (v0.1) and open work

Implemented:
- Full sync of courses, tabs, assignment groups, assignments+submissions, announcements,
  modules+items, folders+files, pages, calendar events, grade snapshots; change feed.
- Layered config store with provenance; heuristics → `info.generated.yaml`; `NoopProposer`.
- Upcoming timeline merging assignments / events / syllabus key dates / local tasks.
- Weighted grade computation with drops; letter schemes.
- File mirroring with include/exclude globs.
- API + CLI; web dashboard, course page (layout-driven), config editor, changes feed.

Not yet implemented (good next tasks, roughly independent):
- **AI proposer** implementing `Proposer` (Vercel AI SDK, structured output against the Zod
  schemas; syllabus PDF → text extraction; Ollama option). Wire via `createContext()`.
- **Automations engine**: evaluate `workflow.automations` after each sync (download, create
  tasks from templates, notify). Hook point: end of `runSync` or a post-sync step in
  `SyncService.trigger`.
- **Task templates → tasks**: expand `task_templates` into `tasks` rows with subtask offsets;
  idempotent via `source_type/source_id`.
- **Routines scheduler**: parse `routines[].when` and surface reminders.
- **Notifications**: push (ntfy/Discord/Telegram webhook) and daily digest channels.
- **ICS feed** endpoint for the upcoming timeline.
- **Full-text search** (SQLite FTS5) over announcements, pages, and extracted file text.
- **Segments**: `pages`, `discussions`, `tasks` renderers; "what do I need on the final" solver
  in `grades`.
- **Inline config UI**: `⋯` menus on segments writing via `PATCH /config/workflow`; a diff view
  for `info.generated.yaml` vs user file with accept/reject per field.
- **Canvas read-state write-back** (mark announcements read) and planner notes.
- Tests for heuristics and the HTTP layer; a recorded Canvas fixture for realistic sync tests.
