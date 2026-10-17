use anyhow::{bail, Context, Result};
use repository_model::{
    AuthorContribution, AuthorRecord, ChangeKind, CommitRecord, FileChange, FileRecord,
    FileSnapshot, ReleaseRecord, RepositoryHistory, RepositoryMeta,
};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
};

/// One author identity: a canonical id plus the display name to show.
struct Identity {
    id: String,
    name: String,
}

/// Resolves author identities through `.mailmap`, then case-insensitive email.
/// Keeps one person as one contributor instead of one per spelling.
struct IdentityResolver {
    by_pair: HashMap<(String, String), Identity>,
    by_email: HashMap<String, Identity>,
    names: HashMap<String, BTreeMap<String, u32>>,
}

impl IdentityResolver {
    fn load(path: &Path) -> Self {
        let mut resolver = Self {
            by_pair: HashMap::new(),
            by_email: HashMap::new(),
            names: HashMap::new(),
        };
        let Ok(content) = std::fs::read_to_string(path.join(".mailmap")) else {
            return resolver;
        };
        for line in content.lines() {
            let line = line.split('#').next().unwrap_or("").trim();
            if line.is_empty() {
                continue;
            }
            // Formats: "Proper <proper@x> <commit@x>" or "Proper <proper@x> Commit <commit@x>"
            let open = match line.find('<') {
                Some(index) => index,
                None => continue,
            };
            let name = line[..open].trim();
            let rest = &line[open..];
            let (proper, commit) = match (
                rest.find('<'),
                rest.find('>'),
                rest.rfind('<'),
                rest.rfind('>'),
            ) {
                (Some(first), Some(first_end), Some(last), Some(last_end))
                    if first < first_end && first_end < last && last < last_end =>
                {
                    (
                        rest[first + 1..first_end].to_string(),
                        rest[last + 1..last_end].to_string(),
                    )
                }
                _ => continue,
            };
            if proper.is_empty() || commit.is_empty() {
                continue;
            }
            let identity = Identity {
                id: proper.to_lowercase(),
                name: if name.is_empty() { proper.clone() } else { name.to_string() },
            };
            if name.is_empty() {
                resolver.by_email.insert(commit.to_lowercase(), identity);
            } else {
                resolver
                    .by_pair
                    .insert((commit.to_lowercase(), name.to_lowercase()), identity);
            }
        }
        resolver
    }

    fn resolve(&mut self, name: &str, email: &str) -> Identity {
        let key = email.trim().to_lowercase();
        if let Some(identity) = self.by_pair.get(&(key.clone(), name.trim().to_lowercase())) {
            return Identity {
                id: identity.id.clone(),
                name: identity.name.clone(),
            };
        }
        if let Some(identity) = self.by_email.get(&key) {
            return Identity {
                id: identity.id.clone(),
                name: identity.name.clone(),
            };
        }
        if !email.trim().is_empty() {
            Identity {
                id: key.clone(),
                name: name.to_string(),
            }
        } else {
            Identity {
                id: format!("name:{name}"),
                name: name.to_string(),
            }
        }
    }

    /// Picks the most frequent spelling, then the lexicographically first, so output is stable.
    fn display_name(&self, id: &str) -> String {
        self.names
            .get(id)
            .and_then(|counts| {
                counts
                    .iter()
                    .max_by(|(a, count_a), (b, count_b)| count_a.cmp(count_b).then_with(|| b.cmp(a)))
                    .map(|(name, _)| name.clone())
            })
            .unwrap_or_else(|| id.to_string())
    }

    fn record(&mut self, id: &str, name: &str) {
        *self
            .names
            .entry(id.to_string())
            .or_default()
            .entry(name.to_string())
            .or_default() += 1;
    }
}

/// Replay HEAD's first-parent lineage. Side-branch work enters at the merge,
/// whose diff is measured against its first parent, so no work is counted twice.
pub fn analyze_repository(path: impl AsRef<Path>) -> Result<RepositoryHistory> {
    let canonical_path = path
        .as_ref()
        .canonicalize()
        .context("repository path does not exist")?;
    let path = canonical_path.as_path();
    run_git(path, &["rev-parse", "--git-dir"]).context("not a Git repository")?;
    let head = run_git(path, &["rev-parse", "--verify", "HEAD"])
        .context("repository has no readable HEAD commit")?
        .trim()
        .to_string();
    if run_git(path, &["rev-parse", "--is-shallow-repository"])?.trim() == "true" {
        bail!("shallow history cannot be replayed accurately; run git fetch --unshallow first");
    }
    let log = run_git(
        path,
        &[
            "log",
            "--first-parent",
            "--topo-order",
            "--reverse",
            "--format=%H%x00%P%x00%ae%x00%an%x00%at%x00%s%x00",
            &head,
        ],
    )?;
    let mut commits = Vec::new();
    let mut authors = BTreeMap::<String, AuthorRecord>::new();
    let mut identities = IdentityResolver::load(path);
    let fields: Vec<_> = log.split('\0').collect();
    let mut blobs = BlobReader::new(path)?;
    for fields in fields.as_chunks::<6>().0 {
        let id = fields[0].trim().to_string();
        let parents: Vec<String> = fields[1].split_whitespace().map(str::to_owned).collect();
        let email = fields[2];
        let identity = identities.resolve(fields[3], email);
        let author_id = identity.id;
        identities.record(&author_id, fields[3]);
        let timestamp = fields[4].parse::<i64>()?;
        let mut changes = read_changes(path, &id, parents.first().map(String::as_str))?;
        for change in &mut changes {
            change.lines_after = if change.kind == ChangeKind::Deleted {
                Some(0)
            } else {
                blobs.lines(&format!("{id}:{}", change.path))?
            };
        }
        authors
            .entry(author_id.clone())
            .and_modify(|author| {
                author.commit_count += 1;
                author.first_commit_at = author.first_commit_at.min(timestamp);
                author.last_commit_at = author.last_commit_at.max(timestamp);
            })
            .or_insert(AuthorRecord {
                id: author_id.clone(),
                name: fields[3].to_string(),
                email: (!email.is_empty()).then(|| email.to_string()),
                commit_count: 1,
                merged_commits: 0,
                first_commit_at: timestamp,
                last_commit_at: timestamp,
            });
        commits.push(CommitRecord {
            id,
            parents,
            author_id,
            author_name: fields[3].to_string(),
            timestamp,
            message: fields[5].to_string(),
            changes,
        });
    }
    // Side-branch authors never appear in the first-parent walk. Their work entered
    // through merge commits, so count them separately instead of dropping them.
    let mainline: HashSet<&str> = commits.iter().map(|commit| commit.id.as_str()).collect();
    let all = run_git(
        path,
        &[
            "log",
            "--topo-order",
            "--reverse",
            "--format=%H%x00%ae%x00%an%x00%at%x00",
            &head,
        ],
    )?;
    for fields in all.split('\0').collect::<Vec<_>>().as_chunks::<4>().0 {
        let id = fields[0].trim();
        if mainline.contains(id) {
            continue;
        }
        let email = fields[1];
        let identity = identities.resolve(fields[2], email);
        identities.record(&identity.id, fields[2]);
        let timestamp = fields[3].parse::<i64>()?;
        authors
            .entry(identity.id.clone())
            .and_modify(|author| {
                author.merged_commits += 1;
                author.first_commit_at = author.first_commit_at.min(timestamp);
                author.last_commit_at = author.last_commit_at.max(timestamp);
            })
            .or_insert(AuthorRecord {
                id: identity.id.clone(),
                name: fields[2].to_string(),
                email: (!email.is_empty()).then(|| email.to_string()),
                commit_count: 0,
                merged_commits: 1,
                first_commit_at: timestamp,
                last_commit_at: timestamp,
            });
    }
    for author in authors.values_mut() {
        author.name = identities.display_name(&author.id);
    }
    let files = build_file_records(&commits);
    let mut releases = Vec::new();
    let tags = run_git(
        path,
        &["for-each-ref", "--format=%(refname:strip=2)", "refs/tags"],
    )?;
    for name in tags.lines() {
        // ^{commit} peels annotated tags and excludes tags pointing at blobs/trees.
        let Ok(commit_id) = run_git(
            path,
            &[
                "rev-parse",
                "--verify",
                &format!("refs/tags/{name}^{{commit}}"),
            ],
        ) else {
            continue;
        };
        if let Some(commit) = commits.iter().find(|commit| commit.id == commit_id.trim()) {
            releases.push(ReleaseRecord {
                name: name.to_string(),
                commit_id: commit.id.clone(),
                timestamp: commit.timestamp,
            });
        }
    }
    releases.sort_by(|a, b| a.timestamp.cmp(&b.timestamp).then(a.name.cmp(&b.name)));
    Ok(RepositoryHistory {
        repository: RepositoryMeta {
            name: path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("repository")
                .trim_end_matches(".git")
                .to_string(),
            first_commit_at: commits.first().map(|c| c.timestamp),
            last_commit_at: commits.last().map(|c| c.timestamp),
            head: Some(head),
        },
        commits,
        files,
        authors: authors.into_values().collect(),
        releases,
    })
}

fn read_changes(path: &Path, id: &str, parent: Option<&str>) -> Result<Vec<FileChange>> {
    let diff = |format: &str| -> Result<Vec<u8>> {
        let mut args = vec![
            "diff-tree",
            "-r",
            "--root",
            "--no-commit-id",
            "-M",
            "-z",
            format,
        ];
        if let Some(parent) = parent {
            args.push(parent);
        }
        args.push(id);
        git_bytes(path, &args)
    };
    let names = diff("--name-status")?;
    let mut fields = names.split(|b| *b == 0).filter(|v| !v.is_empty());
    let mut changes = Vec::new();
    while let Some(status) = fields.next() {
        let Some(first) = fields.next() else {
            bail!("incomplete Git name-status output")
        };
        let renamed = status.first() == Some(&b'R');
        let dest = if renamed {
            fields.next().context("missing rename destination")?
        } else {
            first
        };
        let Ok(dest) = std::str::from_utf8(dest) else {
            eprintln!("warning: skipping non-UTF-8 path in {id}");
            continue;
        };
        let old_path = if renamed {
            let Ok(source) = std::str::from_utf8(first) else {
                eprintln!("warning: skipping non-UTF-8 rename source in {id}");
                continue;
            };
            Some(source.to_string())
        } else {
            None
        };
        let kind = match status.first() {
            Some(b'A') => ChangeKind::Added,
            Some(b'D') => ChangeKind::Deleted,
            Some(b'R') => ChangeKind::Renamed,
            Some(b'M' | b'T') => ChangeKind::Modified,
            _ => continue,
        };
        changes.push(FileChange {
            path: dest.to_string(),
            old_path,
            kind,
            additions: 0,
            deletions: 0,
            lines_after: None,
        });
    }
    let stats = diff("--numstat")?;
    let mut fields = stats.split(|b| *b == 0);
    while let Some(entry) = fields.next() {
        if entry.is_empty() {
            continue;
        }
        let mut parts = entry.splitn(3, |b| *b == b'\t');
        let added = parts.next().unwrap_or_default();
        let deleted = parts.next().unwrap_or_default();
        let Some(mut dest) = parts.next() else {
            continue;
        };
        if dest.is_empty() {
            fields.next(); // old rename path
            dest = fields
                .next()
                .context("missing numstat rename destination")?;
        }
        if let Some(change) = changes.iter_mut().find(|c| c.path.as_bytes() == dest) {
            change.additions = std::str::from_utf8(added)?.parse().unwrap_or(0);
            change.deletions = std::str::from_utf8(deleted)?.parse().unwrap_or(0);
        }
    }
    Ok(changes)
}

fn build_file_records(commits: &[CommitRecord]) -> Vec<FileRecord> {
    let mut files = BTreeMap::<String, FileRecord>::new();
    let mut active = BTreeMap::<String, String>::new();
    for (commit_index, commit) in commits.iter().enumerate() {
        let before = commit
            .changes
            .iter()
            .filter_map(|change| {
                let source = change.old_path.as_deref().unwrap_or(&change.path);
                active
                    .get(source)
                    .map(|id| (source.to_string(), id.clone()))
            })
            .collect::<BTreeMap<_, _>>();
        for change in &commit.changes {
            if matches!(change.kind, ChangeKind::Deleted | ChangeKind::Renamed) {
                active.remove(change.old_path.as_deref().unwrap_or(&change.path));
            }
        }
        for change in &commit.changes {
            let source = change.old_path.as_deref().unwrap_or(&change.path);
            let id = match change.kind {
                ChangeKind::Added => format!("{}:{}", commit.id, change.path),
                _ => before
                    .get(source)
                    .cloned()
                    .unwrap_or_else(|| format!("{}:{}", commit.id, source)),
            };
            if change.kind != ChangeKind::Deleted {
                active.insert(change.path.clone(), id.clone());
            }
            let file = files.entry(id.clone()).or_insert_with(|| FileRecord {
                id,
                path: change.path.clone(),
                directory: directory_of(&change.path),
                created_at: commit.timestamp,
                deleted_at: None,
                last_modified_at: commit.timestamp,
                commit_count: 0,
                additions: 0,
                deletions: 0,
                current_lines: 0,
                authors: Vec::new(),
                history: Vec::new(),
            });
            file.path = change.path.clone();
            file.directory = directory_of(&change.path);
            file.deleted_at = (change.kind == ChangeKind::Deleted).then_some(commit.timestamp);
            file.last_modified_at = commit.timestamp;
            file.commit_count += 1;
            file.additions += u64::from(change.additions);
            file.deletions += u64::from(change.deletions);
            file.current_lines = change.lines_after.unwrap_or(0);
            if let Some(author) = file
                .authors
                .iter_mut()
                .find(|a| a.author_id == commit.author_id)
            {
                author.commits += 1;
                author.additions += u64::from(change.additions);
                author.deletions += u64::from(change.deletions);
            } else {
                file.authors.push(AuthorContribution {
                    author_id: commit.author_id.clone(),
                    additions: u64::from(change.additions),
                    deletions: u64::from(change.deletions),
                    commits: 1,
                });
            }
            file.history.push(FileSnapshot {
                commit_id: commit.id.clone(),
                commit_index,
                timestamp: commit.timestamp,
                path: change.path.clone(),
                lines: file.current_lines,
                additions: u64::from(change.additions),
                deletions: u64::from(change.deletions),
                author_id: commit.author_id.clone(),
                kind: change.kind,
            });
        }
    }
    files.into_values().collect()
}

/// One persistent Git process instead of spawning git show for every file.
struct BlobReader {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}
impl BlobReader {
    fn new(path: &Path) -> Result<Self> {
        let mut child = Command::new("git")
            .arg("-C")
            .arg(path)
            .args(["cat-file", "--batch", "-z"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()?;
        let input = child.stdin.take().context("Git stdin unavailable")?;
        let output = BufReader::new(child.stdout.take().context("Git stdout unavailable")?);
        Ok(Self {
            child,
            input,
            output,
        })
    }
    fn lines(&mut self, spec: &str) -> Result<Option<u64>> {
        self.input.write_all(spec.as_bytes())?;
        self.input.write_all(&[0])?;
        self.input.flush()?;
        let mut header = String::new();
        self.output.read_line(&mut header)?;
        let fields: Vec<_> = header.split_whitespace().collect();
        if fields.last() == Some(&"missing") {
            return Ok(None);
        }
        if fields.len() != 3 {
            bail!("invalid Git blob header");
        }
        let mut remaining = fields[2].parse::<usize>()?;
        let mut buffer = [0; 8192];
        let mut lines = 0;
        let mut binary = false;
        let mut last = None;
        while remaining > 0 {
            let size = remaining.min(buffer.len());
            self.output.read_exact(&mut buffer[..size])?;
            binary |= buffer[..size].contains(&0);
            lines += buffer[..size].iter().filter(|b| **b == b'\n').count() as u64;
            last = Some(buffer[size - 1]);
            remaining -= size;
        }
        self.output.read_exact(&mut buffer[..1])?;
        Ok((!binary).then_some(lines + u64::from(last.is_some() && last != Some(b'\n'))))
    }
}
impl Drop for BlobReader {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
fn directory_of(path: &str) -> String {
    path.rsplit_once('/')
        .map(|(dir, _)| dir)
        .filter(|dir| !dir.is_empty())
        .unwrap_or("_root")
        .to_string()
}
fn git_bytes(path: &Path, args: &[&str]) -> Result<Vec<u8>> {
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .output()
        .context("failed to execute Git")?;
    if !output.status.success() {
        bail!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    Ok(output.stdout)
}
fn run_git(path: &Path, args: &[&str]) -> Result<String> {
    String::from_utf8(git_bytes(path, args)?).context("non-UTF-8 Git metadata")
}
