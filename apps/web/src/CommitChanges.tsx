import type { TimelineCommit } from "./types";

export default function CommitChanges({
  commit,
}: {
  commit: TimelineCommit | null;
}) {
  return (
    <section className="commit-changes">
      <p className="panel-label">本次提交的文件变更</p>

      {!commit || commit.changes.length === 0 ? (
        <p className="empty">本次提交没有文件变更。</p>
      ) : (
        <div className="change-list">
          {commit.changes.slice(0, 80).map((change, index) => (
            <div className="change-row" key={`${change.path}-${index}`}>
              <span className={`change-badge ${change.kind}`}>
                {change.kind === "added"
                  ? "增"
                  : change.kind === "modified"
                    ? "改"
                    : change.kind === "deleted"
                      ? "删"
                      : "移"}
              </span>
              <div>
                <strong>{change.path}</strong>
                <small>
                  +{change.additions} / -{change.deletions}
                  {change.lines_after != null
                    ? ` · ${change.lines_after} 行`
                    : ""}
                </small>
                {change.old_path ? (
                  <small>原路径 {change.old_path}</small>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
