import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { MIGRATIONS, SCHEMA_VERSION } from "./schema.ts";

export type Row = Record<string, SQLInputValue>;

export type UpsertResult<T> = {
  status: "inserted" | "updated" | "unchanged";
  previous: T | null;
};

export class Db {
  readonly sqlite: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec("PRAGMA journal_mode = WAL;");
    this.sqlite.exec("PRAGMA foreign_keys = OFF;"); // sync order is not guaranteed to be parent-first
    this.migrate();
  }

  private migrate() {
    this.sqlite.exec(MIGRATIONS[0]!);
    const row = this.sqlite.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    const current = row ? Number(row.value) : 1;
    for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
      this.sqlite.exec(MIGRATIONS[v - 1]!);
    }
    this.sqlite
      .prepare("INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(String(SCHEMA_VERSION));
  }

  close() {
    this.sqlite.close();
  }

  // ---------- generic helpers ----------

  all<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.sqlite.prepare(sql).all(...params) as T[];
  }

  get<T = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.sqlite.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SQLInputValue[]) {
    return this.sqlite.prepare(sql).run(...params);
  }

  transaction<T>(fn: () => T): T {
    this.sqlite.exec("BEGIN");
    try {
      const out = fn();
      this.sqlite.exec("COMMIT");
      return out;
    } catch (e) {
      this.sqlite.exec("ROLLBACK");
      throw e;
    }
  }

  getMeta(key: string): string | null {
    return this.get<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)?.value ?? null;
  }

  setMeta(key: string, value: string) {
    this.run("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  }

  /**
   * Insert or update a tracked row (one with raw_json/content_hash/first_seen/last_changed/last_seen).
   * `row` must include the primary key column and every tracked column except the bookkeeping ones.
   * Returns whether content changed and the previous row for diffing.
   */
  upsertTracked<T extends object = Record<string, unknown>>(
    table: string,
    pk: string,
    row: Row,
    now: string = new Date().toISOString(),
  ): UpsertResult<T> {
    const hash = row.content_hash as string;
    const previous = this.get<T>(`SELECT * FROM ${table} WHERE ${pk} = ?`, row[pk]!) ?? null;

    if (!previous) {
      const full: Row = { ...row, first_seen: now, last_changed: now, last_seen: now };
      const cols = Object.keys(full);
      this.run(
        `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        ...cols.map((c) => full[c]!),
      );
      return { status: "inserted", previous: null };
    }

    if ((previous as Record<string, unknown>).content_hash === hash) {
      this.run(`UPDATE ${table} SET last_seen = ? WHERE ${pk} = ?`, now, row[pk]!);
      return { status: "unchanged", previous };
    }

    const full: Row = { ...row, last_changed: now, last_seen: now };
    const cols = Object.keys(full).filter((c) => c !== pk);
    this.run(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${pk} = ?`,
      ...cols.map((c) => full[c]!),
      row[pk]!,
    );
    return { status: "updated", previous };
  }
}

/** Stable hash of the fields that matter for change detection. */
export function contentHash(fields: Record<string, unknown>): string {
  const h = createHash("sha1");
  for (const key of Object.keys(fields).sort()) {
    h.update(key);
    h.update("\u0000");
    h.update(JSON.stringify(fields[key] ?? null));
    h.update("\u0001");
  }
  return h.digest("hex");
}
