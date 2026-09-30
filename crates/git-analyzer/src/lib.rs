use anyhow::{Context, Result};
use repository_model::{
    AuthorRecord, CommitRecord, RepositoryHistory, RepositoryMeta,
};
use std::{collections::BTreeMap, path::Path};

pub fn analyze_repository(path: impl AsRef<Path>) -> Result<RepositoryHistory> {
    let path = path.as_ref();
    let repo = gix::open(path)
        .with_context(|| format!("failed to open Git repository at {}", path.display()))?;

    let repository_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("repository")
        .to_string();

    let head_id = repo
        .head_id()
        .context("repository has no readable HEAD commit")?;

    let head = head_id.to_string();
    let walk = repo
        .rev_walk([head_id])
        .all()
        .context("failed to walk commit history")?;

    let mut commits = Vec::new();
    let mut authors: BTreeMap<String, AuthorRecord> = BTreeMap::new();

    for info in walk {
        let info = info.context("failed while traversing commit history")?;
        let commit = info.object().context("failed to load commit object")?;
        let author = commit.author().context("failed to decode commit author")?;
        let timestamp = author.time().map(|time| time.seconds).unwrap_or(0);

        let author_name = author.name.to_string();
        let author_email = author.email.to_string();
        let author_id = if author_email.is_empty() {
            author_name.clone()
        } else {
            author_email.clone()
        };

        let message = commit
            .message_raw()
            .context("failed to decode commit message")?
            .to_string();

        let parents = commit
            .parent_ids()
            .map(|id| id.to_string())
            .collect::<Vec<_>>();

        commits.push(CommitRecord {
            id: commit.id().to_string(),
            parents,
            author_id: author_id.clone(),
            author_name: author_name.clone(),
            timestamp,
            message,
            changes: Vec::new(),
        });

        authors
            .entry(author_id.clone())
            .and_modify(|record| {
                record.commit_count += 1;
                record.first_commit_at = record.first_commit_at.min(timestamp);
                record.last_commit_at = record.last_commit_at.max(timestamp);
            })
            .or_insert_with(|| AuthorRecord {
                id: author_id,
                name: author_name,
                email: (!author_email.is_empty()).then_some(author_email),
                commit_count: 1,
                first_commit_at: timestamp,
                last_commit_at: timestamp,
            });
    }

    commits.sort_by_key(|commit| commit.timestamp);

    let first_commit_at = commits.first().map(|commit| commit.timestamp);
    let last_commit_at = commits.last().map(|commit| commit.timestamp);

    Ok(RepositoryHistory {
        repository: RepositoryMeta {
            name: repository_name,
            first_commit_at,
            last_commit_at,
            head: Some(head),
        },
        commits,
        files: Vec::new(),
        authors: authors.into_values().collect(),
    })
}
