use anyhow::{Context, Result};
use gix::diff::tree_with_rewrites::Change as TreeChange;
use repository_model::{
    AuthorContribution, AuthorRecord, ChangeKind, CommitRecord, FileChange, FileRecord,
    RepositoryHistory, RepositoryMeta,
};
use std::{collections::BTreeMap, path::Path};

#[derive(Debug, Clone)]
struct FileAccumulator {
    id: String,
    path: String,
    directory: String,
    created_at: i64,
    deleted_at: Option<i64>,
    last_modified_at: i64,
    commit_count: u32,
    additions: u64,
    deletions: u64,
    current_lines: u64,
    authors: BTreeMap<String, AuthorContribution>,
}

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

        let parent_ids = commit.parent_ids().collect::<Vec<_>>();
        let parents = parent_ids.iter().map(ToString::to_string).collect::<Vec<_>>();

        let new_tree = commit.tree().context("failed to load commit tree")?;
        let old_tree = if let Some(parent_id) = parent_ids.first() {
            Some(
                repo.find_commit(*parent_id)
                    .context("failed to load parent commit")?
                    .tree()
                    .context("failed to load parent tree")?,
            )
        } else {
            None
        };

        let changes = repo
            .diff_tree_to_tree(old_tree.as_ref(), Some(&new_tree), None)
            .context("failed to diff commit tree against parent")?
            .into_iter()
            .filter_map(|change| tree_change_to_file_change(change))
            .collect::<Vec<_>>();

        commits.push(CommitRecord {
            id: commit.id().to_string(),
            parents,
            author_id: author_id.clone(),
            author_name: author_name.clone(),
            timestamp,
            message,
            changes,
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

    let files = build_file_records(&repo, &commits);

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
        files,
        authors: authors.into_values().collect(),
    })
}

fn tree_change_to_file_change(change: TreeChange) -> Option<FileChange> {
    match change {
        TreeChange::Addition { location, .. } => Some(FileChange {
            path: path_to_string(&location),
            old_path: None,
            kind: ChangeKind::Added,
            additions: 0,
            deletions: 0,
        }),
        TreeChange::Deletion { location, .. } => Some(FileChange {
            path: path_to_string(&location),
            old_path: None,
            kind: ChangeKind::Deleted,
            additions: 0,
            deletions: 0,
        }),
        TreeChange::Modification { location, .. } => Some(FileChange {
            path: path_to_string(&location),
            old_path: None,
            kind: ChangeKind::Modified,
            additions: 0,
            deletions: 0,
        }),
        TreeChange::Rewrite {
            source_location,
            location,
            copy,
            ..
        } => Some(FileChange {
            path: path_to_string(&location),
            old_path: Some(path_to_string(&source_location)),
            kind: if copy {
                ChangeKind::Added
            } else {
                ChangeKind::Renamed
            },
            additions: 0,
            deletions: 0,
        }),
    }
}

fn build_file_records(repo: &gix::Repository, commits: &[CommitRecord]) -> Vec<FileRecord> {
    let mut files: BTreeMap<String, FileAccumulator> = BTreeMap::new();

    for commit in commits {
        for change in &commit.changes {
            match change.kind {
                ChangeKind::Added => {
                    let lines = lines_at_commit(repo, &commit.id, &change.path).unwrap_or(0);
                    let entry = files.entry(change.path.clone()).or_insert_with(|| FileAccumulator {
                        id: change.path.clone(),
                        path: change.path.clone(),
                        directory: directory_of(&change.path),
                        created_at: commit.timestamp,
                        deleted_at: None,
                        last_modified_at: commit.timestamp,
                        commit_count: 0,
                        additions: 0,
                        deletions: 0,
                        current_lines: 0,
                        authors: BTreeMap::new(),
                    });
                    apply_change(entry, commit, lines);
                }
                ChangeKind::Modified => {
                    let lines = lines_at_commit(repo, &commit.id, &change.path).unwrap_or(0);
                    let entry = files.entry(change.path.clone()).or_insert_with(|| FileAccumulator {
                        id: change.path.clone(),
                        path: change.path.clone(),
                        directory: directory_of(&change.path),
                        created_at: commit.timestamp,
                        deleted_at: None,
                        last_modified_at: commit.timestamp,
                        commit_count: 0,
                        additions: 0,
                        deletions: 0,
                        current_lines: 0,
                        authors: BTreeMap::new(),
                    });
                    apply_change(entry, commit, lines);
                }
                ChangeKind::Deleted => {
                    if let Some(entry) = files.get_mut(&change.path) {
                        entry.commit_count += 1;
                        entry.last_modified_at = commit.timestamp;
                        entry.deleted_at = Some(commit.timestamp);
                        entry.current_lines = 0;
                        apply_author(entry, commit, 0, 0);
                    }
                }
                ChangeKind::Renamed => {
                    let old_path = change.old_path.as_deref().unwrap_or(&change.path);
                    let lines = lines_at_commit(repo, &commit.id, &change.path).unwrap_or(0);

                    if let Some(mut entry) = files.remove(old_path) {
                        entry.path = change.path.clone();
                        entry.directory = directory_of(&change.path);
                        entry.deleted_at = None;
                        apply_change(&mut entry, commit, lines);
                        files.insert(change.path.clone(), entry);
                    } else {
                        let mut entry = FileAccumulator {
                            id: old_path.to_string(),
                            path: change.path.clone(),
                            directory: directory_of(&change.path),
                            created_at: commit.timestamp,
                            deleted_at: None,
                            last_modified_at: commit.timestamp,
                            commit_count: 0,
                            additions: 0,
                            deletions: 0,
                            current_lines: 0,
                            authors: BTreeMap::new(),
                        };
                        apply_change(&mut entry, commit, lines);
                        files.insert(change.path.clone(), entry);
                    }
                }
            }
        }
    }

    files
        .into_values()
        .map(|file| FileRecord {
            id: file.id,
            path: file.path,
            directory: file.directory,
            created_at: file.created_at,
            deleted_at: file.deleted_at,
            last_modified_at: file.last_modified_at,
            commit_count: file.commit_count,
            additions: file.additions,
            deletions: file.deletions,
            current_lines: file.current_lines,
            authors: file.authors.into_values().collect(),
        })
        .collect()
}

fn apply_change(file: &mut FileAccumulator, commit: &CommitRecord, new_lines: u64) {
    let previous_lines = file.current_lines;
    let additions = new_lines.saturating_sub(previous_lines);
    let deletions = previous_lines.saturating_sub(new_lines);

    file.commit_count += 1;
    file.last_modified_at = commit.timestamp;
    file.deleted_at = None;
    file.additions += additions;
    file.deletions += deletions;
    file.current_lines = new_lines;

    apply_author(file, commit, additions, deletions);
}

fn apply_author(
    file: &mut FileAccumulator,
    commit: &CommitRecord,
    additions: u64,
    deletions: u64,
) {
    file.authors
        .entry(commit.author_id.clone())
        .and_modify(|author| {
            author.additions += additions;
            author.deletions += deletions;
            author.commits += 1;
        })
        .or_insert_with(|| AuthorContribution {
            author_id: commit.author_id.clone(),
            additions,
            deletions,
            commits: 1,
        });
}

fn lines_at_commit(repo: &gix::Repository, commit_id: &str, path: &str) -> Option<u64> {
    let object_id = gix::ObjectId::from_hex(commit_id.as_bytes()).ok()?;
    let commit = repo.find_commit(object_id).ok()?;
    let mut tree = commit.tree().ok()?;
    let entry = tree.lookup_entry_by_path(path).ok()??;
    let blob = repo.find_blob(entry.object_id()).ok()?;
    Some(count_lines(&blob.data))
}

fn count_lines(data: &[u8]) -> u64 {
    if data.is_empty() {
        return 0;
    }
    data.iter().filter(|byte| **byte == b'\n').count() as u64
        + u64::from(data.last() != Some(&b'\n'))
}

fn directory_of(path: &str) -> String {
    Path::new(path)
        .parent()
        .and_then(Path::to_str)
        .filter(|directory| !directory.is_empty())
        .unwrap_or("_root")
        .to_string()
}

fn path_to_string(path: &[u8]) -> String {
    String::from_utf8_lossy(path).into_owned()
}
