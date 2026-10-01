use anyhow::{bail, Context, Result};
use repository_model::{
    AuthorContribution, AuthorRecord, ChangeKind, CommitRecord, FileChange, FileRecord,
    FileSnapshot, ReleaseRecord, RepositoryHistory, RepositoryMeta,
};
use std::{collections::BTreeMap, path::Path, process::Command};

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
    history: Vec<FileSnapshot>,
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

    let (mut commits, authors) = parse_log(&log)?;
    enrich_changes(path, &mut commits)?;
    let files = build_file_records(path, &commits);
    let releases = parse_releases(path, &commits)?;

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
        releases,
    })
}

fn parse_releases(path: &Path, commits: &[CommitRecord]) -> Result<Vec<ReleaseRecord>> {
    let format = format!(
        "%(refname:strip=2){}%(objectname){}%(creatordate:unix)",
        FIELD_SEP, FIELD_SEP
    );
    let args = [
        "for-each-ref",
        "--sort=creatordate",
        "--format",
        format.as_str(),
        "refs/tags",
    ];
    let tags = run_git(path, &args)?;

    let mut releases = Vec::new();

    for line in tags.lines() {
        let fields = line.split(FIELD_SEP).collect::<Vec<_>>();
        if fields.len() < 3 {
            continue;
        }

        let name = fields[0].trim();
        let object = fields[1].trim();
        let timestamp = fields[2].trim().parse::<i64>().unwrap_or(0);

        if name.is_empty() || object.is_empty() {
            continue;
        }

        let commit_id = run_git(path, &["rev-list", "-1", object])
            .unwrap_or_else(|_| object.to_string())
            .trim()
            .to_string();

        let timestamp = commits
            .iter()
            .find(|commit| commit.id == commit_id)
            .map(|commit| commit.timestamp)
            .unwrap_or(timestamp);

        releases.push(ReleaseRecord {
            name: name.to_string(),
            commit_id,
            timestamp,
        });
    }

    releases.sort_by_key(|release| release.timestamp);
    releases.dedup_by(|a, b| a.name == b.name && a.commit_id == b.commit_id);

    Ok(releases)
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
            lines_after: None,
        }),
        'M' | 'T' => Some(FileChange {
            path: fields[1].to_string(),
            old_path: None,
            kind: ChangeKind::Modified,
            additions: 0,
            deletions: 0,
            lines_after: None,
        }),
        'D' => Some(FileChange {
            path: fields[1].to_string(),
            old_path: None,
            kind: ChangeKind::Deleted,
            additions: 0,
            deletions: 0,
            lines_after: Some(0),
        }),
        'R' if fields.len() >= 3 => Some(FileChange {
            path: fields[2].to_string(),
            old_path: Some(fields[1].to_string()),
            kind: ChangeKind::Renamed,
            additions: 0,
            deletions: 0,
            lines_after: None,
        }),
        'C' if fields.len() >= 3 => Some(FileChange {
            path: fields[2].to_string(),
            old_path: Some(fields[1].to_string()),
            kind: ChangeKind::Added,
            additions: 0,
            deletions: 0,
            lines_after: None,
        }),
        _ => None,
    }
}

fn enrich_changes(repo_path: &Path, commits: &mut [CommitRecord]) -> Result<()> {
    for commit in commits.iter_mut() {
        let numstat = run_git(
            repo_path,
            &[
                "diff-tree",
                "--root",
                "--no-commit-id",
                "--numstat",
                "-M",
                "--find-renames",
                commit.id.as_str(),
            ],
        )?;

        let stats = parse_numstat(&numstat);
        for change in &mut commit.changes {
            if let Some((additions, deletions)) = find_numstat(change, &stats) {
                change.additions = additions.min(u32::MAX as u64) as u32;
                change.deletions = deletions.min(u32::MAX as u64) as u32;
            }

            change.lines_after = match change.kind {
                ChangeKind::Deleted => Some(0),
                _ => lines_at_commit(repo_path, &commit.id, &change.path),
            };
        }
    }

    Ok(())
}

fn parse_numstat(output: &str) -> Vec<(u64, u64, String)> {
    output
        .lines()
        .filter_map(|line| {
            let fields = line.split('\t').collect::<Vec<_>>();
            if fields.len() < 3 {
                return None;
            }

            let additions = fields[0].parse::<u64>().ok()?;
            let deletions = fields[1].parse::<u64>().ok()?;
            Some((additions, deletions, fields[2].to_string()))
        })
        .collect()
}

fn find_numstat(change: &FileChange, stats: &[(u64, u64, String)]) -> Option<(u64, u64)> {
    stats.iter().find_map(|(additions, deletions, path)| {
        let normalized = path.replace('{', "").replace('}', "");
        let candidates = normalized.split(" => ").map(str::trim).collect::<Vec<_>>();

        let matches = candidates.iter().any(|candidate| {
            *candidate == change.path
                || change
                    .old_path
                    .as_deref()
                    .is_some_and(|old| *candidate == old)
        });

        matches.then_some((*additions, *deletions))
    })
}

fn build_file_records(repo_path: &Path, commits: &[CommitRecord]) -> Vec<FileRecord> {
    let mut files: BTreeMap<String, FileAccumulator> = BTreeMap::new();

    for (commit_index, commit) in commits.iter().enumerate() {
        for change in &commit.changes {
            let lines = change.lines_after.unwrap_or(0) as u64;
            match change.kind {
                ChangeKind::Added | ChangeKind::Modified => {
                    let entry =
                        files
                            .entry(change.path.clone())
                            .or_insert_with(|| FileAccumulator {
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
                                history: Vec::new(),
                            });

                    if change.kind == ChangeKind::Added && entry.deleted_at.is_some() {
                        entry.created_at = commit.timestamp;
                    }

                    entry.deleted_at = None;
                    entry.last_modified_at = commit.timestamp;
                    entry.commit_count += 1;
                    entry.additions += change.additions as u64;
                    entry.deletions += change.deletions as u64;
                    apply_author(
                        entry,
                        commit,
                        change.additions as u64,
                        change.deletions as u64,
                    );
                    entry.history.push(FileSnapshot {
                        commit_id: commit.id.clone(),
                        commit_index,
                        timestamp: commit.timestamp,
                        path: change.path.clone(),
                        lines,
                        additions: change.additions as u64,
                        deletions: change.deletions as u64,
                        author_id: commit.author_id.clone(),
                        kind: change.kind,
                    });
                }
                ChangeKind::Deleted => {
                    if let Some(entry) = files.get_mut(&change.path) {
                        entry.last_modified_at = commit.timestamp;
                        entry.deleted_at = Some(commit.timestamp);
                        entry.commit_count += 1;
                        entry.additions += change.additions as u64;
                        entry.deletions += change.deletions as u64;
                        apply_author(
                            entry,
                            commit,
                            change.additions as u64,
                            change.deletions as u64,
                        );
                        entry.history.push(FileSnapshot {
                            commit_id: commit.id.clone(),
                            commit_index,
                            timestamp: commit.timestamp,
                            path: change.path.clone(),
                            lines: 0,
                            additions: change.additions as u64,
                            deletions: change.deletions as u64,
                            author_id: commit.author_id.clone(),
                            kind: ChangeKind::Deleted,
                        });
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
                        entry.additions += change.additions as u64;
                        entry.deletions += change.deletions as u64;
                        apply_author(
                            &mut entry,
                            commit,
                            change.additions as u64,
                            change.deletions as u64,
                        );
                        entry.history.push(FileSnapshot {
                            commit_id: commit.id.clone(),
                            commit_index,
                            timestamp: commit.timestamp,
                            path: change.path.clone(),
                            lines,
                            additions: change.additions as u64,
                            deletions: change.deletions as u64,
                            author_id: commit.author_id.clone(),
                            kind: ChangeKind::Renamed,
                        });
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
                            additions: change.additions as u64,
                            deletions: change.deletions as u64,
                            authors: BTreeMap::new(),
                            history: Vec::new(),
                        };
                        apply_author(
                            &mut entry,
                            commit,
                            change.additions as u64,
                            change.deletions as u64,
                        );
                        entry.history.push(FileSnapshot {
                            commit_id: commit.id.clone(),
                            commit_index,
                            timestamp: commit.timestamp,
                            path: change.path.clone(),
                            lines,
                            additions: change.additions as u64,
                            deletions: change.deletions as u64,
                            author_id: commit.author_id.clone(),
                            kind: ChangeKind::Renamed,
                        });
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
            current_lines: if file.deleted_at.is_none() {
                file.history
                    .last()
                    .map(|snapshot| snapshot.lines)
                    .unwrap_or(0)
            } else {
                0
            },
            authors: file.authors.into_values().collect(),
            history: file.history,
        })
        .collect()
}

fn apply_author(file: &mut FileAccumulator, commit: &CommitRecord, additions: u64, deletions: u64) {
    file.authors
        .entry(commit.author_id.clone())
        .and_modify(|author| {
            author.commits += 1;
            author.additions += additions;
            author.deletions += deletions;
        })
        .or_insert_with(|| AuthorContribution {
            author_id: commit.author_id.clone(),
            additions,
            deletions,
            commits: 1,
        });
}

fn lines_at_commit(repo_path: &Path, commit_id: &str, file_path: &str) -> Option<u64> {
    let spec = format!("{commit_id}:{file_path}");
    let output = Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(["show", "--format=", &spec])
        .output()
        .ok()?;

    if !output.status.success() || output.stdout.contains(&0) {
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

    #[test]
    fn parses_numstat() {
        let stats = parse_numstat("4\t2\tsrc/main.rs\n-\t-\timage.png\n");
        assert_eq!(stats.len(), 1);
        assert_eq!(stats[0].0, 4);
        assert_eq!(stats[0].1, 2);
    }
}