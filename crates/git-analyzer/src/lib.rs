use anyhow::{bail, Context, Result};
use repository_model::{
    AuthorContribution, AuthorRecord, ChangeKind, CommitRecord, FileChange, FileRecord,
    RepositoryHistory, RepositoryMeta,
};
use std::{
    collections::BTreeMap,
    path::Path,
    process::Command,
};

const FIELD_SEP: char = '\x1f';
const COMMIT_PREFIX: &str = "@@COMMIT";

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
    authors: BTreeMap<String, AuthorContribution>,
}

pub fn analyze_repository(path: impl AsRef<Path>) -> Result<RepositoryHistory> {
    let path = path.as_ref();

    let inside = run_git(path, &["rev-parse", "--is-inside-work-tree"])
        .context("failed to verify Git repository")?;
    if inside.trim() != "true" {
        bail!("{} is not a Git working tree", path.display());
    }

    let repository_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("repository")
        .to_string();

    let head = run_git(path, &["rev-parse", "HEAD"])
        .context("repository has no readable HEAD commit")?
        .trim()
        .to_string();

    let log = run_git(
        path,
        &[
            "log",
            "--reverse",
            "--find-renames",
            "--format=@@COMMIT%x1f%H%x1f%P%x1f%ae%x1f%an%x1f%at%x1f%s",
            "--name-status",
        ],
    )
    .context("failed to read Git history")?;

    let (commits, authors) = parse_log(&log)?;
    let files = build_file_records(path, &commits);

    Ok(RepositoryHistory {
        repository: RepositoryMeta {
            name: repository_name,
            first_commit_at: commits.first().map(|commit| commit.timestamp),
            last_commit_at: commits.last().map(|commit| commit.timestamp),
            head: Some(head),
        },
        commits,
        files,
        authors,
    })
}

fn parse_log(log: &str) -> Result<(Vec<CommitRecord>, Vec<AuthorRecord>)> {
    let mut commits = Vec::new();
    let mut current: Option<CommitRecord> = None;
    let mut authors: BTreeMap<String, AuthorRecord> = BTreeMap::new();

    for raw_line in log.lines() {
        let line = raw_line.trim_end_matches('\r');

        if line.starts_with(COMMIT_PREFIX) {
            if let Some(commit) = current.take() {
                commits.push(commit);
            }

            let fields = line.split(FIELD_SEP).collect::<Vec<_>>();
            if fields.len() < 7 {
                bail!("malformed commit metadata line: {line}");
            }

            let id = fields[1].to_string();
            let parents = fields[2]
                .split_whitespace()
                .map(str::to_string)
                .collect::<Vec<_>>();
            let email = fields[3].to_string();
            let name = fields[4].to_string();
            let timestamp = fields[5]
                .parse::<i64>()
                .with_context(|| format!("invalid commit timestamp in {id}"))?;
            let message = fields[6..].join(&FIELD_SEP.to_string());

            let author_id = if email.is_empty() {
                name.clone()
            } else {
                email.clone()
            };

            authors
                .entry(author_id.clone())
                .and_modify(|record| {
                    record.commit_count += 1;
                    record.first_commit_at = record.first_commit_at.min(timestamp);
                    record.last_commit_at = record.last_commit_at.max(timestamp);
                })
                .or_insert_with(|| AuthorRecord {
                    id: author_id.clone(),
                    name: name.clone(),
                    email: (!email.is_empty()).then_some(email),
                    commit_count: 1,
                    first_commit_at: timestamp,
                    last_commit_at: timestamp,
                });

            current = Some(CommitRecord {
                id,
                parents,
                author_id,
                author_name: name,
                timestamp,
                message,
                changes: Vec::new(),
            });

            continue;
        }

        if line.is_empty() {
            continue;
        }

        if let Some(commit) = current.as_mut() {
            if let Some(change) = parse_name_status(line) {
                commit.changes.push(change);
            }
        }
    }

    if let Some(commit) = current.take() {
        commits.push(commit);
    }

    Ok((commits, authors.into_values().collect()))
}

fn parse_name_status(line: &str) -> Option<FileChange> {
    let fields = line.split('\t').collect::<Vec<_>>();
    if fields.len() < 2 {
        return None;
    }

    let status = fields[0];
    let code = status.chars().next()?;

    match code {
        'A' => Some(FileChange {
            path: fields[1].to_string(),
            old_path: None,
            kind: ChangeKind::Added,
            additions: 0,
            deletions: 0,
        }),
        'M' | 'T' => Some(FileChange {
            path: fields[1].to_string(),
            old_path: None,
            kind: ChangeKind::Modified,
            additions: 0,
            deletions: 0,
        }),
        'D' => Some(FileChange {
            path: fields[1].to_string(),
            old_path: None,
            kind: ChangeKind::Deleted,
            additions: 0,
            deletions: 0,
        }),
        'R' if fields.len() >= 3 => Some(FileChange {
            path: fields[2].to_string(),
            old_path: Some(fields[1].to_string()),
            kind: ChangeKind::Renamed,
            additions: 0,
            deletions: 0,
        }),
        'C' if fields.len() >= 3 => Some(FileChange {
            path: fields[2].to_string(),
            old_path: Some(fields[1].to_string()),
            kind: ChangeKind::Added,
            additions: 0,
            deletions: 0,
        }),
        _ => None,
    }
}

fn build_file_records(repo_path: &Path, commits: &[CommitRecord]) -> Vec<FileRecord> {
    let mut files: BTreeMap<String, FileAccumulator> = BTreeMap::new();

    for commit in commits {
        for change in &commit.changes {
            match change.kind {
                ChangeKind::Added | ChangeKind::Modified => {
                    let entry = files.entry(change.path.clone()).or_insert_with(|| {
                        FileAccumulator {
                            id: change.path.clone(),
                            path: change.path.clone(),
                            directory: directory_of(&change.path),
                            created_at: commit.timestamp,
                            deleted_at: None,
                            last_modified_at: commit.timestamp,
                            commit_count: 0,
                            additions: 0,
                            deletions: 0,
                            authors: BTreeMap::new(),
                        }
                    });

                    entry.deleted_at = None;
                    entry.last_modified_at = commit.timestamp;
                    entry.commit_count += 1;
                    apply_author(entry, commit);
                }
                ChangeKind::Deleted => {
                    if let Some(entry) = files.get_mut(&change.path) {
                        entry.last_modified_at = commit.timestamp;
                        entry.deleted_at = Some(commit.timestamp);
                        entry.commit_count += 1;
                        apply_author(entry, commit);
                    }
                }
                ChangeKind::Renamed => {
                    let old_path = change.old_path.as_deref().unwrap_or(&change.path);

                    if let Some(mut entry) = files.remove(old_path) {
                        entry.path = change.path.clone();
                        entry.directory = directory_of(&change.path);
                        entry.deleted_at = None;
                        entry.last_modified_at = commit.timestamp;
                        entry.commit_count += 1;
                        apply_author(&mut entry, commit);
                        files.insert(change.path.clone(), entry);
                    } else {
                        let mut entry = FileAccumulator {
                            id: old_path.to_string(),
                            path: change.path.clone(),
                            directory: directory_of(&change.path),
                            created_at: commit.timestamp,
                            deleted_at: None,
                            last_modified_at: commit.timestamp,
                            commit_count: 1,
                            additions: 0,
                            deletions: 0,
                            authors: BTreeMap::new(),
                        };
                        apply_author(&mut entry, commit);
                        files.insert(change.path.clone(), entry);
                    }
                }
            }
        }
    }

    files
        .into_values()
        .map(|file| {
            let current_lines = if file.deleted_at.is_none() {
                lines_at_head(repo_path, &file.path).unwrap_or(0)
            } else {
                0
            };

            FileRecord {
                id: file.id,
                path: file.path,
                directory: file.directory,
                created_at: file.created_at,
                deleted_at: file.deleted_at,
                last_modified_at: file.last_modified_at,
                commit_count: file.commit_count,
                additions: file.additions,
                deletions: file.deletions,
                current_lines,
                authors: file.authors.into_values().collect(),
            }
        })
        .collect()
}

fn apply_author(file: &mut FileAccumulator, commit: &CommitRecord) {
    file.authors
        .entry(commit.author_id.clone())
        .and_modify(|author| {
            author.commits += 1;
        })
        .or_insert_with(|| AuthorContribution {
            author_id: commit.author_id.clone(),
            additions: 0,
            deletions: 0,
            commits: 1,
        });
}

fn lines_at_head(repo_path: &Path, file_path: &str) -> Option<u64> {
    let spec = format!("HEAD:{file_path}");
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(["show", &spec])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    Some(count_lines(&output.stdout))
}

fn count_lines(data: &[u8]) -> u64 {
    if data.is_empty() {
        0
    } else {
        data.iter().filter(|byte| **byte == b'\n').count() as u64
            + u64::from(data.last() != Some(&b'\n'))
    }
}

fn directory_of(path: &str) -> String {
    Path::new(path)
        .parent()
        .and_then(Path::to_str)
        .filter(|directory| !directory.is_empty())
        .unwrap_or("_root")
        .to_string()
}

fn run_git(repo_path: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .with_context(|| format!("failed to execute git {}", args.join(" ")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("git {} failed: {}", args.join(" "), stderr.trim());
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_modified_file() {
        let change = parse_name_status("M\tsrc/main.rs").expect("change");
        assert!(matches!(change.kind, ChangeKind::Modified));
        assert_eq!(change.path, "src/main.rs");
    }

    #[test]
    fn parses_rename() {
        let change = parse_name_status("R100\told.rs\tnew.rs").expect("change");
        assert!(matches!(change.kind, ChangeKind::Renamed));
        assert_eq!(change.old_path.as_deref(), Some("old.rs"));
        assert_eq!(change.path, "new.rs");
    }
}
