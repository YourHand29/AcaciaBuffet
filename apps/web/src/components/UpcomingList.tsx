import type { UpcomingItemDto } from "@acacia/shared";
import { useSetItemState, type ItemState } from "../queries";
import { formatDateTime, groupByDay, relativeTime } from "../time";

const NEXT_STATE: Record<ItemState, ItemState> = { none: "started", started: "done", done: "none" };
const STATE_GLYPH: Record<ItemState, string> = { none: "", started: "◐", done: "✓" };
const STATE_LABEL: Record<ItemState, string> = { none: "Not started", started: "Started", done: "Done" };

function hasLocalState(item: UpcomingItemDto): boolean {
  return item.id.startsWith("assignment:");
}

export function UpcomingItem({ item, showCourse = true }: { item: UpcomingItemDto; showCourse?: boolean }) {
  const setState = useSetItemState();
  const overdue = item.dueAt !== null && new Date(item.dueAt).getTime() < Date.now() && !item.submitted;
  const [type, rawId] = item.id.split(":");

  const toggle = () => {
    if (!type || !rawId) return;
    setState.mutate({ type, id: rawId, state: NEXT_STATE[item.localState] });
  };

  return (
    <div className={`upcoming-item ${item.localState === "done" ? "done" : ""}`}>
      {showCourse && (
        <>
          <span className="dot" style={{ background: item.courseColor ?? "var(--muted)" }} />
          <span className="upcoming-alias">{item.courseAlias}</span>
        </>
      )}
      <span className={`badge kind-${item.kind}`}>{item.kind.replace("_", " ")}</span>
      <span className="upcoming-title" title={item.title}>
        {item.htmlUrl ? (
          <a href={item.htmlUrl} target="_blank" rel="noreferrer">
            {item.title}
          </a>
        ) : (
          item.title
        )}
        {item.pointsPossible !== null && <span className="muted small"> · {item.pointsPossible} pts</span>}
      </span>
      {item.submitted && <span className="badge">submitted</span>}
      <span className={`upcoming-due ${overdue ? "overdue" : ""}`} title={formatDateTime(item.dueAt)}>
        {relativeTime(item.dueAt)}
      </span>
      {hasLocalState(item) && (
        <button
          className={`state-toggle ${item.localState}`}
          title={`${STATE_LABEL[item.localState]} — click to mark ${STATE_LABEL[NEXT_STATE[item.localState]].toLowerCase()}`}
          disabled={setState.isPending}
          onClick={toggle}
        >
          {STATE_GLYPH[item.localState]}
        </button>
      )}
    </div>
  );
}

export function UpcomingList({
  items,
  showCourse = true,
  emptyText = "Nothing upcoming",
}: {
  items: UpcomingItemDto[];
  showCourse?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0) return <div className="empty">{emptyText}</div>;
  const groups = groupByDay(items);
  return (
    <div>
      {groups.map((g) => (
        <div key={g.key} className="upcoming-day">
          <div className="upcoming-day-label">{g.label}</div>
          {g.items.map((item) => (
            <UpcomingItem key={item.id} item={item} showCourse={showCourse} />
          ))}
        </div>
      ))}
    </div>
  );
}
