import { useState } from "react";
import type { AnnouncementDto } from "@acacia/shared";
import { formatDateTime, relativeTime } from "../../time";

function AnnouncementRow({ a }: { a: AnnouncementDto }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`announcement ${a.read ? "" : "unread"}`}>
      <div className="announcement-head" onClick={() => setOpen((o) => !o)}>
        <span className="muted small">{open ? "▾" : "▸"}</span>
        <span className="title">{a.title}</span>
        {!a.read && <span className="badge unread">unread</span>}
        <span className="announcement-meta" title={formatDateTime(a.postedAt)}>
          {relativeTime(a.postedAt)}
          {a.author && ` · ${a.author}`}
        </span>
      </div>
      {open && (
        <>
          <div className="prose" dangerouslySetInnerHTML={{ __html: a.message }} />
          {a.htmlUrl && (
            <div className="small" style={{ marginTop: 6 }}>
              <a href={a.htmlUrl} target="_blank" rel="noreferrer">
                Open in Canvas
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Announcements({
  announcements,
  options,
}: {
  announcements: AnnouncementDto[];
  options: Record<string, unknown>;
}) {
  const limit = typeof options.limit === "number" ? options.limit : 10;
  const sorted = [...announcements].sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  const shown = sorted.slice(0, limit);
  if (shown.length === 0) return <div className="empty">No announcements</div>;
  return (
    <div>
      {shown.map((a) => (
        <AnnouncementRow key={a.id} a={a} />
      ))}
      {sorted.length > shown.length && (
        <div className="muted small" style={{ marginTop: 8 }}>
          Showing {shown.length} of {sorted.length}
        </div>
      )}
    </div>
  );
}
