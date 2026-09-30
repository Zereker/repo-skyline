use repository_model::{ChangeKind, RepositoryHistory};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CityProject {
    pub repository: String,
    pub districts: Vec<District>,
    pub timeline: Vec<TimelineCommit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct District {
    pub path: String,
    pub buildings: Vec<Building>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Building {
    pub id: String,
    pub path: String,
    pub lines: u64,
    pub commits: u32,
    pub primary_author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineCommit {
    pub id: String,
    pub timestamp: i64,
    pub author: String,
    pub message: String,
    pub changes: Vec<CityEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CityEvent {
    pub path: String,
    pub old_path: Option<String>,
    pub kind: CityEventKind,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CityEventKind {
    Added,
    Modified,
    Deleted,
    Renamed,
}

pub fn project_city(history: &RepositoryHistory) -> CityProject {
    let mut grouped: BTreeMap<String, Vec<Building>> = BTreeMap::new();

    for file in history.files.iter().filter(|file| file.deleted_at.is_none()) {
        let primary_author = file
            .authors
            .iter()
            .max_by_key(|contribution| contribution.commits)
            .map(|contribution| contribution.author_id.clone());

        grouped
            .entry(file.directory.clone())
            .or_default()
            .push(Building {
                id: file.id.clone(),
                path: file.path.clone(),
                lines: file.current_lines,
                commits: file.commit_count,
                primary_author,
            });
    }

    let districts = grouped
        .into_iter()
        .map(|(path, mut buildings)| {
            buildings.sort_by(|a, b| a.path.cmp(&b.path));
            District { path, buildings }
        })
        .collect();

    let timeline = history
        .commits
        .iter()
        .map(|commit| TimelineCommit {
            id: commit.id.clone(),
            timestamp: commit.timestamp,
            author: commit.author_name.clone(),
            message: commit.message.clone(),
            changes: commit
                .changes
                .iter()
                .map(|change| CityEvent {
                    path: change.path.clone(),
                    old_path: change.old_path.clone(),
                    kind: match change.kind {
                        ChangeKind::Added => CityEventKind::Added,
                        ChangeKind::Modified => CityEventKind::Modified,
                        ChangeKind::Deleted => CityEventKind::Deleted,
                        ChangeKind::Renamed => CityEventKind::Renamed,
                    },
                })
                .collect(),
        })
        .collect();

    CityProject {
        repository: history.repository.name.clone(),
        districts,
        timeline,
    }
}
