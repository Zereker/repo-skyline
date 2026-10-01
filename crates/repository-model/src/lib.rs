use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryHistory {
    pub repository: RepositoryMeta,
    pub commits: Vec<CommitRecord>,
    pub files: Vec<FileRecord>,
    pub authors: Vec<AuthorRecord>,
    pub releases: Vec<ReleaseRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryMeta {
    pub name: String,
    pub first_commit_at: Option<i64>,
    pub last_commit_at: Option<i64>,
    pub head: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitRecord {
    pub id: String,
    pub parents: Vec<String>,
    pub author_id: String,
    pub author_name: String,
    pub timestamp: i64,
    pub message: String,
    pub changes: Vec<FileChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub old_path: Option<String>,
    pub kind: ChangeKind,
    pub additions: u32,
    pub deletions: u32,
    pub lines_after: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSnapshot {
    pub commit_id: String,
    pub commit_index: usize,
    pub timestamp: i64,
    pub path: String,
    pub lines: u64,
    pub additions: u64,
    pub deletions: u64,
    pub author_id: String,
    pub kind: ChangeKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: String,
    pub path: String,
    pub directory: String,
    pub created_at: i64,
    pub deleted_at: Option<i64>,
    pub last_modified_at: i64,
    pub commit_count: u32,
    pub additions: u64,
    pub deletions: u64,
    pub current_lines: u64,
    pub authors: Vec<AuthorContribution>,
    pub history: Vec<FileSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorContribution {
    pub author_id: String,
    pub additions: u64,
    pub deletions: u64,
    pub commits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthorRecord {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub commit_count: u32,
    pub first_commit_at: i64,
    pub last_commit_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseRecord {
    pub name: String,
    pub commit_id: String,
    pub timestamp: i64,
}
