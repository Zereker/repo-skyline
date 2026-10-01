use repository_model::{ChangeKind, RepositoryHistory};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CityProject {
    pub repository: String,
    pub districts: Vec<District>,
    pub timeline: Vec<TimelineCommit>,
    pub releases: Vec<ReleaseMarker>,
    pub milestones: Vec<StoryMilestone>,
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
    pub created_at: i64,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineCommit {
    pub id: String,
    pub timestamp: i64,
    pub author: String,
    pub message: String,
    pub changes: Vec<CityEvent>,
    pub releases: Vec<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseMarker {
    pub name: String,
    pub commit_id: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryMilestone {
    pub id: String,
    pub kind: StoryMilestoneKind,
    pub title: String,
    pub description: String,
    pub commit_id: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StoryMilestoneKind {
    FirstCommit,
    FirstMajorContributor,
    LargestChange,
    LargestRefactor,
    Release,
}

pub fn project_city(history: &RepositoryHistory) -> CityProject {
    let mut grouped: BTreeMap<String, Vec<Building>> = BTreeMap::new();

    for file in &history.files {
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
                created_at: file.created_at,
                deleted_at: file.deleted_at,
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
            releases: history
                .releases
                .iter()
                .filter(|release| release.commit_id == commit.id)
                .map(|release| release.name.clone())
                .collect(),
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
        .collect::<Vec<_>>();

    let releases = history
        .releases
        .iter()
        .map(|release| ReleaseMarker {
            name: release.name.clone(),
            commit_id: release.commit_id.clone(),
            timestamp: release.timestamp,
        })
        .collect::<Vec<_>>();

    let milestones = derive_milestones(history, &timeline);

    CityProject {
        repository: history.repository.name.clone(),
        districts,
        timeline,
        releases,
        milestones,
    }
}

fn derive_milestones(
    history: &RepositoryHistory,
    timeline: &[TimelineCommit],
) -> Vec<StoryMilestone> {
    let mut milestones = Vec::new();

    if let Some(first) = timeline.first() {
        milestones.push(StoryMilestone {
            id: "first-commit".to_string(),
            kind: StoryMilestoneKind::FirstCommit,
            title: "First commit".to_string(),
            description: format!("The city foundation: {}", first.message),
            commit_id: first.id.clone(),
            timestamp: first.timestamp,
        });
    }

    if let Some(author) = history
        .authors
        .iter()
        .max_by_key(|author| author.commit_count)
    {
        if author.commit_count >= 3 {
            if let Some(commit) = timeline.iter().find(|commit| commit.author == author.name) {
                milestones.push(StoryMilestone {
                    id: "first-major-contributor".to_string(),
                    kind: StoryMilestoneKind::FirstMajorContributor,
                    title: "Major builder emerges".to_string(),
                    description: format!(
                        "{} became the most active builder with {} commits.",
                        author.name, author.commit_count
                    ),
                    commit_id: commit.id.clone(),
                    timestamp: commit.timestamp,
                });
            }
        }
    }

    if let Some(largest) = timeline
        .iter()
        .max_by_key(|commit| commit.changes.len())
        .filter(|commit| commit.changes.len() >= 2)
    {
        milestones.push(StoryMilestone {
            id: "largest-change".to_string(),
            kind: StoryMilestoneKind::LargestChange,
            title: "Biggest construction wave".to_string(),
            description: format!("{} files changed in one commit.", largest.changes.len()),
            commit_id: largest.id.clone(),
            timestamp: largest.timestamp,
        });
    }

    if let Some(refactor) = timeline
        .iter()
        .filter_map(|commit| {
            let score = commit
                .changes
                .iter()
                .filter(|change| {
                    matches!(change.kind, CityEventKind::Renamed | CityEventKind::Deleted)
                })
                .count();

            (score >= 2).then_some((commit, score))
        })
        .max_by_key(|(_, score)| *score)
        .map(|(commit, _)| commit)
    {
        milestones.push(StoryMilestone {
            id: "largest-refactor".to_string(),
            kind: StoryMilestoneKind::LargestRefactor,
            title: "Urban renewal".to_string(),
            description: format!(
                "{} rename/delete events reshaped the city.",
                refactor
                    .changes
                    .iter()
                    .filter(|change| {
                        matches!(change.kind, CityEventKind::Renamed | CityEventKind::Deleted)
                    })
                    .count()
            ),
            commit_id: refactor.id.clone(),
            timestamp: refactor.timestamp,
        });
    }

    let release_count = history.releases.len();
    let release_start = release_count.saturating_sub(4);

    for release in history.releases.iter().skip(release_start) {
        milestones.push(StoryMilestone {
            id: format!("release-{}", release.name),
            kind: StoryMilestoneKind::Release,
            title: format!("Release {}", release.name),
            description: "A Git tag marks a city milestone.".to_string(),
            commit_id: release.commit_id.clone(),
            timestamp: release.timestamp,
        });
    }

    milestones.sort_by_key(|milestone| milestone.timestamp);
    milestones.dedup_by(|a, b| a.commit_id == b.commit_id && a.kind as u8 == b.kind as u8);
    milestones
}
