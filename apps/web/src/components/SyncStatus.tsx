import { useStartSync, useSyncStatus } from "../queries";
import { relativeTime } from "../time";

export function SyncStatus() {
  const status = useSyncStatus();
  const start = useStartSync();
  const s = status.data;
  const running = s?.running ?? false;

  return (
    <div className="sync-status">
      {running ? (
        <>
          <span className="spinner" />
          <span>Syncing…</span>
        </>
      ) : s ? (
        <span title={s.lastError ?? undefined}>
          {s.lastRunAt ? `Last sync ${relativeTime(s.lastRunAt)}` : "Never synced"}
          {s.lastRunOk === false && <span className="error"> · failed</span>}
          {s.lastRunOk && s.changesLastRun > 0 && ` · ${s.changesLastRun} changes`}
        </span>
      ) : (
        <span>{status.isError ? "Server unreachable" : "…"}</span>
      )}
      {start.isError && <span className="error">{start.error.message}</span>}
      <button className="small" disabled={running || start.isPending} onClick={() => start.mutate({})}>
        Sync now
      </button>
    </div>
  );
}
