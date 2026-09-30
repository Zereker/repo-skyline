use anyhow::{Context, Result};
use repository_model::{RepositoryHistory, RepositoryMeta};
use std::path::Path;

pub fn analyze_repository(path: impl AsRef<Path>) -> Result<RepositoryHistory> {
    let path = path.as_ref();
    let repo = gix::open(path)
        .with_context(|| format!("failed to open Git repository at {}", path.display()))?;

    let repository_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("repository")
        .to_string();

    let head = repo
        .head_id()
        .ok()
        .map(|id| id.to_string());

    Ok(RepositoryHistory {
        repository: RepositoryMeta {
            name: repository_name,
            first_commit_at: None,
            last_commit_at: None,
            head,
        },
        commits: Vec::new(),
        files: Vec::new(),
        authors: Vec::new(),
    })
}
