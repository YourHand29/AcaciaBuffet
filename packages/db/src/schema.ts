/**
 * SQLite schema. Migrations are applied in order; never edit an existing
 * migration — append a new one and bump SCHEMA_VERSION.
 *
 * Conventions for synced tables (mirrors of Canvas data):
 *   raw_json      full Canvas response for the row
 *   content_hash  hash of the fields we care about, used for change detection
 *   first_seen    when we first synced this row
 *   last_changed  when content_hash last changed
 *   last_seen     when we last saw it in a sync (rows not seen are stale, not deleted)
 */

export const SCHEMA_VERSION = 1;

export const MIGRATIONS: string[] = [
  // ---- v1 ----
  `
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS courses (
    id                  INTEGER PRIMARY KEY,
    name                TEXT NOT NULL,
    course_code         TEXT NOT NULL,
    workflow_state      TEXT NOT NULL,
    term_name           TEXT,
    start_at            TEXT,
    end_at              TEXT,
    apply_group_weights INTEGER NOT NULL DEFAULT 0,
    grading_standard_id INTEGER,
    current_score       REAL,
    current_grade       TEXT,
    syllabus_body       TEXT,
    active              INTEGER NOT NULL DEFAULT 1,
    raw_json            TEXT NOT NULL,
    content_hash        TEXT NOT NULL,
    first_seen          TEXT NOT NULL,
    last_changed        TEXT NOT NULL,
    last_seen           TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS course_tabs (
    course_id INTEGER NOT NULL REFERENCES courses(id),
    tab_id    TEXT NOT NULL,
    label     TEXT NOT NULL,
    hidden    INTEGER NOT NULL DEFAULT 0,
    position  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (course_id, tab_id)
  );

  CREATE TABLE IF NOT EXISTS assignment_groups (
    id           INTEGER PRIMARY KEY,
    course_id    INTEGER NOT NULL REFERENCES courses(id),
    name         TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0,
    weight       REAL NOT NULL DEFAULT 0,
    drop_lowest  INTEGER NOT NULL DEFAULT 0,
    drop_highest INTEGER NOT NULL DEFAULT 0,
    never_drop   TEXT NOT NULL DEFAULT '[]',
    raw_json     TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    first_seen   TEXT NOT NULL,
    last_changed TEXT NOT NULL,
    last_seen    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id                INTEGER PRIMARY KEY,
    course_id         INTEGER NOT NULL REFERENCES courses(id),
    group_id          INTEGER,
    name              TEXT NOT NULL,
    description       TEXT,
    due_at            TEXT,
    lock_at           TEXT,
    unlock_at         TEXT,
    points_possible   REAL,
    submission_types  TEXT NOT NULL DEFAULT '[]',
    kind              TEXT NOT NULL DEFAULT 'assignment',
    html_url          TEXT,
    published         INTEGER NOT NULL DEFAULT 1,
    omit_from_final   INTEGER NOT NULL DEFAULT 0,
    canvas_updated_at TEXT,
    raw_json          TEXT NOT NULL,
    content_hash      TEXT NOT NULL,
    first_seen        TEXT NOT NULL,
    last_changed      TEXT NOT NULL,
    last_seen         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_assignments_course_due ON assignments(course_id, due_at);

  CREATE TABLE IF NOT EXISTS submissions (
    assignment_id  INTEGER PRIMARY KEY REFERENCES assignments(id),
    course_id      INTEGER NOT NULL REFERENCES courses(id),
    score          REAL,
    grade          TEXT,
    submitted_at   TEXT,
    graded_at      TEXT,
    workflow_state TEXT NOT NULL,
    late           INTEGER NOT NULL DEFAULT 0,
    missing        INTEGER NOT NULL DEFAULT 0,
    excused        INTEGER NOT NULL DEFAULT 0,
    posted_at      TEXT,
    raw_json       TEXT NOT NULL,
    content_hash   TEXT NOT NULL,
    first_seen     TEXT NOT NULL,
    last_changed   TEXT NOT NULL,
    last_seen      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id           INTEGER PRIMARY KEY,
    course_id    INTEGER NOT NULL REFERENCES courses(id),
    title        TEXT NOT NULL,
    message      TEXT,
    posted_at    TEXT,
    author       TEXT,
    html_url     TEXT,
    read_state   TEXT,
    raw_json     TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    first_seen   TEXT NOT NULL,
    last_changed TEXT NOT NULL,
    last_seen    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_announcements_course_posted ON announcements(course_id, posted_at);

  CREATE TABLE IF NOT EXISTS modules (
    id           INTEGER PRIMARY KEY,
    course_id    INTEGER NOT NULL REFERENCES courses(id),
    name         TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0,
    unlock_at    TEXT,
    raw_json     TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    first_seen   TEXT NOT NULL,
    last_changed TEXT NOT NULL,
    last_seen    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS module_items (
    id           INTEGER PRIMARY KEY,
    module_id    INTEGER NOT NULL REFERENCES modules(id),
    course_id    INTEGER NOT NULL REFERENCES courses(id),
    title        TEXT NOT NULL,
    type         TEXT NOT NULL,
    position     INTEGER NOT NULL DEFAULT 0,
    content_id   INTEGER,
    html_url     TEXT,
    external_url TEXT,
    page_url     TEXT,
    raw_json     TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    first_seen   TEXT NOT NULL,
    last_changed TEXT NOT NULL,
    last_seen    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_module_items_module ON module_items(module_id, position);

  CREATE TABLE IF NOT EXISTS folders (
    id               INTEGER PRIMARY KEY,
    course_id        INTEGER NOT NULL REFERENCES courses(id),
    name             TEXT NOT NULL,
    full_name        TEXT NOT NULL,
    parent_folder_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS files (
    id            INTEGER PRIMARY KEY,
    course_id     INTEGER NOT NULL REFERENCES courses(id),
    folder_id     INTEGER,
    display_name  TEXT NOT NULL,
    filename      TEXT NOT NULL,
    size          INTEGER NOT NULL DEFAULT 0,
    content_type  TEXT,
    url           TEXT,
    updated_at    TEXT,
    modified_at   TEXT,
    local_path    TEXT,
    downloaded_at TEXT,
    raw_json      TEXT NOT NULL,
    content_hash  TEXT NOT NULL,
    first_seen    TEXT NOT NULL,
    last_changed  TEXT NOT NULL,
    last_seen     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_files_course ON files(course_id, updated_at);

  CREATE TABLE IF NOT EXISTS pages (
    page_id      INTEGER PRIMARY KEY,
    course_id    INTEGER NOT NULL REFERENCES courses(id),
    url          TEXT NOT NULL,
    title        TEXT NOT NULL,
    body         TEXT,
    front_page   INTEGER NOT NULL DEFAULT 0,
    updated_at   TEXT,
    raw_json     TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    first_seen   TEXT NOT NULL,
    last_changed TEXT NOT NULL,
    last_seen    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id           INTEGER PRIMARY KEY,
    course_id    INTEGER NOT NULL REFERENCES courses(id),
    title        TEXT NOT NULL,
    description  TEXT,
    start_at     TEXT,
    end_at       TEXT,
    location     TEXT,
    html_url     TEXT,
    raw_json     TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    first_seen   TEXT NOT NULL,
    last_changed TEXT NOT NULL,
    last_seen    TEXT NOT NULL
  );

  -- Change feed: things the sync noticed that the user may care about.
  CREATE TABLE IF NOT EXISTS changes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL,
    course_id   INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    title       TEXT NOT NULL,
    detail      TEXT,
    detected_at TEXT NOT NULL,
    seen        INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_changes_detected ON changes(detected_at DESC);

  -- Local-only user state on Canvas items (started/done, read).
  CREATE TABLE IF NOT EXISTS item_state (
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    state       TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
  );

  -- Local tasks (user-created or generated from workflow task_templates).
  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER,
    parent_id   INTEGER REFERENCES tasks(id),
    title       TEXT NOT NULL,
    notes       TEXT,
    due_at      TEXT,
    state       TEXT NOT NULL DEFAULT 'todo',
    source_type TEXT,
    source_id   TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);

  -- Grade history for trend charts; one row per course per sync when changed.
  CREATE TABLE IF NOT EXISTS grade_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id     INTEGER NOT NULL,
    taken_at      TEXT NOT NULL,
    canvas_score  REAL,
    canvas_grade  TEXT,
    computed_pct  REAL
  );

  CREATE TABLE IF NOT EXISTS sync_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at    TEXT NOT NULL,
    finished_at   TEXT,
    ok            INTEGER,
    error         TEXT,
    changes_count INTEGER NOT NULL DEFAULT 0
  );
  `,
];
