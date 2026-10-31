import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CanvasClient } from "@acacia/canvas-client";
import type { Db, FileRow, Repo } from "@acacia/db";

export interface MirrorOptions {
  /** Root directory for downloads; files land in <root>/<course alias or code>/<folder path>/<name>. */
  rootDir: string;
  courseLabel: string;
  include?: string[];
  exclude?: string[];
  logger?: (msg: string) => void;
}

/**
 * Download files for a course that are new or changed since last download.
 * Glob matching is intentionally simple (supports `**`, `*`, and extension suffixes).
 */
export async function mirrorCourseFiles(
  client: CanvasClient,
  db: Db,
  repo: Repo,
  courseId: number,
  opts: MirrorOptions,
): Promise<{ downloaded: number; skipped: number; failed: number }> {
  const log = opts.logger ?? (() => {});
  const folders = new Map(repo.folders(courseId).map((f) => [f.id, f.full_name]));
  const stats = { downloaded: 0, skipped: 0, failed: 0 };

  for (const f of repo.files(courseId)) {
    const folderPath = relativeFolder(f.folder_id ? folders.get(f.folder_id) : undefined);
    const relPath = folderPath ? `${folderPath}/${f.display_name}` : f.display_name;

    if (!matches(relPath, opts.include ?? ["**/*"]) || matches(relPath, opts.exclude ?? [])) {
      stats.skipped++;
      continue;
    }
    if (f.downloaded_at && f.local_path && f.last_changed <= f.downloaded_at) {
      stats.skipped++;
      continue;
    }

    try {
      const fresh = await client.file(f.id); // refresh the short-lived download URL
      const bytes = await client.downloadFile(fresh.url);
      const dest = join(opts.rootDir, sanitize(opts.courseLabel), ...relPath.split("/").map(sanitize));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, bytes);
      db.run("UPDATE files SET local_path = ?, downloaded_at = ? WHERE id = ?", dest, new Date().toISOString(), f.id);
      stats.downloaded++;
      log(`downloaded ${relPath}`);
    } catch (e) {
      stats.failed++;
      log(`failed ${relPath}: ${(e as Error).message}`);
    }
  }
  return stats;
}

/** Canvas root folder is "course files"; strip it. */
function relativeFolder(fullName: string | undefined): string {
  if (!fullName) return "";
  return fullName.replace(/^course files\/?/, "");
}

function sanitize(segment: string): string {
  return segment.replace(/[<>:"\\|?*\u0000-\u001f]/g, "_").trim() || "_";
}

export function matches(path: string, globs: string[]): boolean {
  return globs.some((g) => globToRegex(g).test(path));
}

function globToRegex(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

export type { FileRow };
