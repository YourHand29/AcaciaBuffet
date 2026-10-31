import { useChanges, useMarkChangesSeen } from "../queries";
import { ChangeList } from "../components/ChangeList";

export function Changes() {
  const changes = useChanges(100);
  const markSeen = useMarkChangesSeen();

  if (changes.isLoading) return <div className="muted">Loading changes…</div>;
  if (changes.isError) return <div className="notice error">Failed to load changes: {changes.error.message}</div>;
  if (!changes.data) return null;

  const unseen = changes.data.filter((c) => !c.seen).map((c) => c.id);

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <h1>Changes</h1>
          <span className="subtitle">
            {changes.data.length} recent · {unseen.length} unseen
          </span>
        </div>
        <button
          className="small"
          disabled={unseen.length === 0 || markSeen.isPending}
          onClick={() => markSeen.mutate(unseen)}
        >
          Mark all seen
        </button>
      </div>
      {markSeen.isError && <div className="notice error">{markSeen.error.message}</div>}
      <div className="card">
        <ChangeList changes={changes.data} emptyText="No changes detected yet" />
      </div>
    </div>
  );
}
