import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ConfigFilesDto } from "@acacia/shared";
import { useAnalyzeCourse, useCourse, useCourseConfig, useSaveCourseConfig, type ConfigKind } from "../queries";

const PLACEHOLDER = "# No overrides yet — defaults apply";

function ConfigTab({ courseId, kind, config }: { courseId: number; kind: ConfigKind; config: ConfigFilesDto }) {
  const serverYaml = kind === "info" ? config.infoYaml : config.workflowYaml;
  const resolved = kind === "info" ? config.infoResolved : config.workflowResolved;
  const [yaml, setYaml] = useState(serverYaml);
  const save = useSaveCourseConfig(courseId);
  const analyze = useAnalyzeCourse(courseId);

  useEffect(() => {
    setYaml(serverYaml);
  }, [serverYaml]);

  const dirty = yaml !== serverYaml;

  return (
    <div className="stack">
      {kind === "info" && (
        <div className="card">
          <div className="row wrap">
            <div>
              <strong>Analyze course</strong>
              <div className="muted small">
                Runs heuristics (and the AI proposer when configured) over synced data and writes a proposal to{" "}
                <code>info.generated.yaml</code>. Your <code>info.yaml</code> always overrides it.
              </div>
            </div>
            <span className="spacer" />
            <button disabled={analyze.isPending} onClick={() => analyze.mutate()}>
              {analyze.isPending ? "Analyzing…" : "Analyze course"}
            </button>
          </div>
          {analyze.isError && (
            <div className="notice error" style={{ marginTop: 10 }}>
              {analyze.error.message}
            </div>
          )}
          {analyze.isSuccess && (
            <div className="stack" style={{ marginTop: 10 }}>
              <div className="notice info">
                <div className="muted small" style={{ marginBottom: 4 }}>
                  Proposer: {analyze.data.proposer}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{analyze.data.summary}</div>
              </div>
              <details>
                <summary className="small">Proposal written to info.generated.yaml</summary>
                <p className="muted small">
                  These values are merged beneath your overrides; any field you set in info.yaml wins. The resolved
                  view on the right reflects the merge.
                </p>
                <pre className="json">{JSON.stringify(analyze.data.proposal, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      )}

      <div className="config-grid">
        <div className="stack">
          <div className="row">
            <h3>
              config/courses/{courseId}/{kind}.yaml
            </h3>
            <span className="spacer" />
            {dirty && <span className="muted small">unsaved</span>}
            <button className="small" disabled={!dirty || save.isPending} onClick={() => setYaml(serverYaml)}>
              Revert
            </button>
            <button
              className="small primary"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate({ kind, yaml })}
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </div>
          <textarea
            className="config-editor"
            value={yaml}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            onChange={(e) => setYaml(e.target.value)}
          />
          {save.isError && <div className="notice error">{save.error.message}</div>}
          {save.isSuccess && !dirty && <div className="notice success">Saved.</div>}
        </div>
        <div className="stack">
          <h3>Resolved</h3>
          <pre className="json">{JSON.stringify(resolved, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

export function CourseConfig() {
  const params = useParams();
  const id = Number(params.id);
  const config = useCourseConfig(id);
  const course = useCourse(id);
  const [tab, setTab] = useState<ConfigKind>("workflow");

  if (!Number.isFinite(id)) return <div className="notice error">Invalid course id</div>;
  if (config.isLoading) return <div className="muted">Loading config…</div>;
  if (config.isError) return <div className="notice error">Failed to load config: {config.error.message}</div>;
  if (!config.data) return null;

  const c = course.data?.course;

  return (
    <div>
      <div className="page-header">
        <div className="row">
          <h1>Configure</h1>
          <Link to={`/courses/${id}`} className="subtitle">
            {c ? (c.alias ?? c.courseCode) : `Course ${id}`}
          </Link>
        </div>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === "workflow" ? "active" : ""}`} onClick={() => setTab("workflow")}>
          workflow.yaml
        </button>
        <button className={`tab ${tab === "info" ? "active" : ""}`} onClick={() => setTab("info")}>
          info.yaml
        </button>
      </div>
      <ConfigTab key={tab} courseId={id} kind={tab} config={config.data} />
    </div>
  );
}
