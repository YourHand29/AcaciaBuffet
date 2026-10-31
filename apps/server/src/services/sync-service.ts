import { runSync, type SyncResult } from "@acacia/sync";
import type { SyncStatusDto } from "@acacia/shared";
import type { AppContext } from "../context.ts";

/** Serializes sync runs and exposes status; also owns the interval scheduler. */
export class SyncService {
  private running: Promise<SyncResult> | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly ctx: AppContext) {}

  trigger(opts: { courseIds?: number[]; skipFiles?: boolean } = {}): Promise<SyncResult> {
    if (this.running) return this.running;
    this.ctx.log("sync started");
    this.running = runSync(this.ctx.client, this.ctx.db, { ...opts, logger: this.ctx.log })
      .then((r) => {
        this.ctx.log(`sync finished: ${r.courses} courses, ${r.changes} changes, ${r.errors.length} errors`);
        return r;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  status(): SyncStatusDto {
    const last = this.ctx.repo.lastSyncRun();
    return {
      running: this.running !== null,
      lastRunAt: last?.finished_at ?? last?.started_at ?? null,
      lastRunOk: last?.ok == null ? null : last.ok === 1,
      lastError: last?.error ?? null,
      changesLastRun: last?.changes_count ?? 0,
    };
  }

  startScheduler(intervalMinutes: number) {
    if (intervalMinutes <= 0) return;
    this.timer = setInterval(() => void this.trigger().catch((e) => this.ctx.log(`scheduled sync failed: ${e}`)), intervalMinutes * 60_000);
    this.ctx.log(`scheduler: syncing every ${intervalMinutes} min`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
