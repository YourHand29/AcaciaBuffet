import { Link } from "react-router-dom";
import type { ChangeDto, ChangeKind } from "@acacia/shared";
import { formatDateTime, relativeTime } from "../time";

export function changeFamily(kind: ChangeKind): string {
  return kind.split(".")[0] ?? kind;
}

export function ChangeItem({ change, linkCourse = true }: { change: ChangeDto; linkCourse?: boolean }) {
  const family = changeFamily(change.kind);
  return (
    <div className={`change-item ${change.seen ? "" : "unseen"}`}>
      <span className={`badge kind-${family}`}>{change.kind.replace(".", " · ").replace(/_/g, " ")}</span>
      <span className="change-alias">
        {linkCourse ? <Link to={`/courses/${change.courseId}`}>{change.courseAlias}</Link> : change.courseAlias}
      </span>
      <span className="change-body">
        <div className="change-title truncate" title={change.title}>
          {change.title}
        </div>
        {change.detail && <div className="change-detail">{change.detail}</div>}
      </span>
      <span className="change-time" title={formatDateTime(change.detectedAt)}>
        {relativeTime(change.detectedAt)}
      </span>
    </div>
  );
}

export function ChangeList({ changes, emptyText = "No changes" }: { changes: ChangeDto[]; emptyText?: string }) {
  if (changes.length === 0) return <div className="empty">{emptyText}</div>;
  return (
    <div className="change-list">
      {changes.map((c) => (
        <ChangeItem key={c.id} change={c} />
      ))}
    </div>
  );
}
