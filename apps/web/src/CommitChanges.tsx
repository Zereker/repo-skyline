import type { TimelineCommit } from "./types";

export default function CommitChanges({
  commit,
}: {
  commit: TimelineCommit | null;
}) {
  return (
    <section className="commit-changes">
      <p className="panel-label">Current commit changes</p>

      {!commit || commit.changes.length === 0 ? (
        <p className="empty">No file changes for this commit.</p>
      ) : (
        <div className="change-list">
          {commit.changes.slice(0, 80).map((change, index) => (
            <div className="change-row" key={`${change.path}-${index}`}>
              <span className={`change-badge ${change.kind}`}>
                {change.kind.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{change.path}</strong>
                <small>
                  +{change.additions} / -{change.deletions}
                  {change.lines_after != null ? ` · ${change.lines_after} LOC` : ""}
                </small>
                {change.old_path ? (
                  <small>from {change.old_path}</small>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
