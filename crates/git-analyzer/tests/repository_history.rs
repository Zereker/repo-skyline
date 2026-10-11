use git_analyzer::analyze_repository;
use repository_model::ChangeKind;
use std::{fs, path::Path, process::Command};
use tempfile::TempDir;

fn git(repo: &Path, args: &[&str]) {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .expect("git should execute");

    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
}

fn commit(repo: &Path, message: &str) {
    git(repo, &["add", "-A"]);
    git(repo, &["commit", "-m", message]);
}

#[test]
fn analyzes_create_modify_rename_and_delete() {
    let temp = TempDir::new().expect("temp repo");
    let repo = temp.path();

    git(repo, &["init"]);
    git(repo, &["config", "user.name", "Repo Skyline Test"]);
    git(repo, &["config", "user.email", "skyline@example.test"]);

    fs::create_dir_all(repo.join("src")).expect("src dir");
    fs::write(repo.join("src/main.rs"), "fn main() {}\n").expect("create main");
    commit(repo, "create main");
    git(repo, &["tag", "v0.1.0"]);

    fs::write(
        repo.join("src/main.rs"),
        "fn main() {\n    println!(\"hello\");\n}\n",
    )
    .expect("modify main");
    commit(repo, "modify main");

    fs::rename(repo.join("src/main.rs"), repo.join("src/app.rs")).expect("rename main");
    commit(repo, "rename main");

    fs::write(repo.join("README.md"), "# Demo\n").expect("create readme");
    commit(repo, "create readme");

    fs::remove_file(repo.join("README.md")).expect("delete readme");
    commit(repo, "delete readme");

    let history = analyze_repository(repo).expect("history should parse");

    assert_eq!(history.commits.len(), 5);
    assert_eq!(history.authors.len(), 1);
    assert_eq!(history.releases.len(), 1);
    assert_eq!(history.releases[0].name, "v0.1.0");
    assert_eq!(history.releases[0].commit_id, history.commits[0].id);

    let rename_commit = history
        .commits
        .iter()
        .find(|commit| commit.message == "rename main")
        .expect("rename commit");
    assert!(rename_commit.changes.iter().any(|change| {
        change.kind == ChangeKind::Renamed
            && change.old_path.as_deref() == Some("src/main.rs")
            && change.path == "src/app.rs"
    }));

    let app = history
        .files
        .iter()
        .find(|file| file.path == "src/app.rs")
        .expect("renamed file");
    assert!(app.deleted_at.is_none());
    assert!(app.commit_count >= 3);
    assert!(app.current_lines >= 3);

    let readme = history
        .files
        .iter()
        .find(|file| file.path == "README.md")
        .expect("deleted readme");
    assert!(readme.deleted_at.is_some());
    assert_eq!(readme.current_lines, 0);
}

fn fixture() -> TempDir {
    let temp = TempDir::new().unwrap();
    git(temp.path(), &["init", "-b", "main"]);
    git(temp.path(), &["config", "user.name", "Alice"]);
    git(temp.path(), &["config", "user.email", "alice@example.test"]);
    git(temp.path(), &["config", "commit.gpgsign", "false"]);
    temp
}

#[test]
fn preserves_utf8_whitespace_rename_stats_and_recreated_lifetimes() {
    let temp = fixture();
    let repo = temp.path();
    fs::create_dir(repo.join("old")).unwrap();
    fs::create_dir(repo.join("new")).unwrap();
    let source = "old/你好\tfile\nname.rs";
    let dest = "new/你好\tfile\nname.rs";
    fs::write(
        repo.join(source),
        "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n",
    )
    .unwrap();
    commit(repo, "create unusual path");
    fs::rename(repo.join(source), repo.join(dest)).unwrap();
    fs::write(
        repo.join(dest),
        "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven",
    )
    .unwrap();
    commit(repo, "rename and edit");
    fs::remove_file(repo.join(dest)).unwrap();
    commit(repo, "delete");
    fs::write(repo.join(dest), "reborn\n").unwrap();
    commit(repo, "recreate");
    let history = analyze_repository(repo).unwrap();
    let change = &history.commits[1].changes[0];
    assert_eq!(change.kind, ChangeKind::Renamed);
    assert_eq!(change.path, dest);
    assert_eq!(change.old_path.as_deref(), Some(source));
    assert_eq!(change.additions, 1);
    assert_eq!(change.deletions, 0);
    assert_eq!(change.lines_after, Some(11));
    assert_eq!(history.files.len(), 2);
    assert_ne!(history.files[0].id, history.files[1].id);
    assert_eq!(
        history
            .files
            .iter()
            .find(|f| f.deleted_at.is_some())
            .unwrap()
            .history
            .len(),
        3
    );
    assert_eq!(
        history
            .files
            .iter()
            .find(|f| f.deleted_at.is_none())
            .unwrap()
            .current_lines,
        1
    );
}

#[test]
fn merge_replays_first_parent_without_double_counting() {
    let temp = fixture();
    let repo = temp.path();
    fs::write(repo.join("base"), "base\n").unwrap();
    commit(repo, "base");
    git(repo, &["checkout", "-b", "feature"]);
    fs::write(repo.join("feature"), "feature\n").unwrap();
    commit(repo, "feature work");
    git(repo, &["tag", "side-branch-tag"]);
    git(repo, &["checkout", "main"]);
    fs::write(repo.join("main"), "main\n").unwrap();
    commit(repo, "main work");
    git(
        repo,
        &["merge", "--no-ff", "feature", "-m", "merge feature"],
    );
    git(repo, &["tag", "-a", "v1.0", "-m", "annotated release"]);
    let history = analyze_repository(repo).unwrap();
    assert_eq!(history.commits.len(), 3);
    assert_eq!(history.commits[2].parents.len(), 2);
    assert_eq!(history.commits[2].changes.len(), 1);
    assert_eq!(history.commits[2].changes[0].path, "feature");
    assert_eq!(history.commits[2].changes[0].additions, 1);
    assert_eq!(history.files.len(), 3);
    assert_eq!(history.releases.len(), 1);
    assert_eq!(history.releases[0].name, "v1.0");
}

#[test]
fn handles_binary_empty_unterminated_and_detached_head() {
    let temp = fixture();
    let repo = temp.path();
    fs::write(repo.join("binary"), [0, 1, 2, 3]).unwrap();
    fs::write(repo.join("empty"), "").unwrap();
    fs::write(repo.join("text"), "unterminated").unwrap();
    commit(repo, "files");
    git(repo, &["checkout", "--detach"]);
    let history = analyze_repository(repo).unwrap();
    let lines = |path: &str| {
        history.commits[0]
            .changes
            .iter()
            .find(|c| c.path == path)
            .unwrap()
            .lines_after
    };
    assert_eq!(lines("binary"), None);
    assert_eq!(lines("empty"), Some(0));
    assert_eq!(lines("text"), Some(1));
}

#[test]
fn supports_bare_and_reports_empty_and_shallow_repositories() {
    let temp = fixture();
    let repo = temp.path();
    assert!(analyze_repository(repo)
        .unwrap_err()
        .to_string()
        .contains("HEAD"));
    fs::write(repo.join("one"), "one\n").unwrap();
    commit(repo, "one");
    let clones = TempDir::new().unwrap();
    let bare = clones.path().join("bare.git");
    git(
        clones.path(),
        &[
            "clone",
            "--bare",
            repo.to_str().unwrap(),
            bare.to_str().unwrap(),
        ],
    );
    assert_eq!(analyze_repository(&bare).unwrap().commits.len(), 1);
    let shallow = clones.path().join("shallow");
    let url = format!("file://{}", repo.display());
    git(
        clones.path(),
        &["clone", "--depth", "1", &url, shallow.to_str().unwrap()],
    );
    assert!(analyze_repository(&shallow)
        .unwrap_err()
        .to_string()
        .contains("unshallow"));
}

#[test]
fn overwrite_respects_git_delete_and_modify_semantics() {
    let temp = fixture();
    let repo = temp.path();
    fs::write(repo.join("a-source"), "source\nsource2\n").unwrap();
    fs::write(repo.join("z-destination"), "different\n").unwrap();
    commit(repo, "two files");
    fs::rename(repo.join("a-source"), repo.join("z-destination")).unwrap();
    commit(repo, "overwrite via rename");
    let history = analyze_repository(repo).unwrap();
    assert_eq!(history.files.len(), 2);
    let alive = history
        .files
        .iter()
        .find(|f| f.deleted_at.is_none())
        .unwrap();
    let deleted = history
        .files
        .iter()
        .find(|f| f.deleted_at.is_some())
        .unwrap();
    assert_eq!(alive.current_lines, 2);
    assert_eq!(alive.history[0].path, "z-destination");
    assert_eq!(deleted.history[0].path, "a-source");
    assert_eq!(deleted.current_lines, 0);
}
