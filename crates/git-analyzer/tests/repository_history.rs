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
