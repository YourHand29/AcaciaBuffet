# AcaciaBuffet

A local, fast, configurable front-end for Canvas LMS. It syncs your Canvas courses into a
SQLite database and shows them the way *you* want: one merged due-date timeline, accurate
weighted grades, a change feed for things Canvas never tells you about (moved due dates,
silently added files, posted grades), local file mirroring, and per-course config files that
adapt the UI to how each professor actually uses Canvas.

## Quick start

```bash
pnpm install
cp .env.example .env     # fill in CANVAS_BASE_URL and CANVAS_TOKEN
pnpm dev                 # API on :4800, UI on http://localhost:5173
```

Get a token at Canvas → Account → Settings → **New Access Token**.

The first server start runs an initial sync, then re-syncs every `SYNC_INTERVAL_MINUTES`.
You can also drive it from the CLI:

```bash
pnpm --filter @acacia/server cli sync        # pull everything
pnpm --filter @acacia/server cli analyze     # infer per-course info → config/courses/<id>/info.generated.yaml
pnpm --filter @acacia/server cli upcoming 14 # print the merged timeline
pnpm --filter @acacia/server cli changes     # what changed since last sync
```

## Configuring a course

Each course has two optional files under `config/courses/<canvas course id>/`:

| File | What it holds | Who writes it |
|---|---|---|
| `info.yaml` | What the course *is*: grading weights, exam dates, policies, where content lives | You (overrides); heuristics/AI write `info.generated.yaml` next to it |
| `workflow.yaml` | How you want to work: page layout, routines, task templates, automations, notifications | You |

App-wide defaults live in `config/defaults/`. See `config/courses/_example/` for annotated
examples and `packages/course-config/src/schema.ts` for the full schema. Both files can also
be edited in the UI under a course's **Configure** page.

## Development

See [AGENTS.md](./AGENTS.md) for architecture, package boundaries, and the roadmap.

```bash
pnpm typecheck
pnpm test
```
