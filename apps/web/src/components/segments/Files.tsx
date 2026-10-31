import { Fragment } from "react";
import type { FileDto } from "@acacia/shared";
import { useMirrorFiles } from "../../queries";
import { formatDate, relativeTime } from "../../time";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function Files({
  files,
  courseId,
  options,
}: {
  files: FileDto[];
  courseId: number;
  options: Record<string, unknown>;
}) {
  const mirror = useMirrorFiles(courseId);
  const limit = typeof options.limit === "number" ? options.limit : undefined;

  const folders = new Map<string, FileDto[]>();
  for (const f of files) {
    const key = f.folderPath ?? "/";
    const list = folders.get(key);
    if (list) list.push(f);
    else folders.set(key, [f]);
  }
  const folderNames = [...folders.keys()].sort();
  const mirrored = files.filter((f) => f.localPath).length;

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="muted small">
          {files.length} files · {mirrored} mirrored locally
        </span>
        <span className="spacer" />
        {mirror.isSuccess && (
          <span className="small muted">
            Downloaded {mirror.data.downloaded}, skipped {mirror.data.skipped}, failed {mirror.data.failed}
          </span>
        )}
        {mirror.isError && <span className="small error">{mirror.error.message}</span>}
        <button className="small" disabled={mirror.isPending} onClick={() => mirror.mutate()}>
          {mirror.isPending ? "Mirroring…" : "Mirror files"}
        </button>
      </div>
      {files.length === 0 ? (
        <div className="empty">No files</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th className="num">Size</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {folderNames.map((folder) => {
              const list = folders.get(folder) ?? [];
              const shown = limit !== undefined ? list.slice(0, limit) : list;
              return (
                <Fragment key={folder}>
                  <tr className="group-row">
                    <td colSpan={3}>{folder}</td>
                  </tr>
                  {shown.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className="file-name">
                          {f.localPath && (
                            <span className="check" title={f.localPath}>
                              ✓
                            </span>
                          )}
                          <span>{f.displayName}</span>
                          {f.isNew && <span className="badge new">new</span>}
                        </span>
                      </td>
                      <td className="num muted">{formatSize(f.size)}</td>
                      <td className="muted" title={formatDate(f.updatedAt)}>
                        {relativeTime(f.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
