use repository_model::{ChangeKind, FileSnapshot, RepositoryHistory};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CityProject {
    pub repository: String,
    pub districts: Vec<District>,
    pub timeline: Vec<TimelineCommit>,
    pub releases: Vec<ReleaseMarker>,
    pub milestones: Vec<StoryMilestone>,
    pub roads: Vec<CityRoad>,
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
    pub additions: u64,
    pub deletions: u64,
    pub contributor_count: u32,
    pub primary_author: Option<String>,
    pub created_at: i64,
    pub deleted_at: Option<i64>,
    pub last_modified_at: i64,
    pub history: Vec<FileSnapshot>,
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
    pub additions: u32,
    pub deletions: u32,
    pub lines_after: Option<u64>,
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
pub struct CityRoad {
    pub from: String,
    pub to: String,
    pub weight: u32,
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
    Commit100,
    Commit1000,
    FirstMajorContributor,
    LargestChange,
    LargestRefactor,
    LargestModule,
    MostActiveMonth,
    OwnershipTransition,
    Release,
}

pub fn project_city(history: &RepositoryHistory) -> CityProject {
    let mut grouped: BTreeMap<String, Vec<Building>> = BTreeMap::new();

    for file in &history.files {
        grouped.entry(file.directory.clone()).or_default().push(Building {
            id: file.id.clone(),
            path: file.path.clone(),
            lines: file.current_lines,
            commits: file.commit_count,
            additions: file.additions,
            deletions: file.deletions,
            contributor_count: file.authors.len() as u32,
            primary_author: file
                .authors
                .iter()
                .max_by_key(|contribution| contribution.commits)
                .map(|contribution| contribution.author_id.clone()),
            created_at: file.created_at,
            deleted_at: file.deleted_at,
            last_modified_at: file.last_modified_at,
            history: file.history.clone(),
        });

        for snapshot in &file.history {
            grouped.entry(directory_of(&snapshot.path)).or_default();
        }
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
                    additions: change.additions,
                    deletions: change.deletions,
                    lines_after: change.lines_after,
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

    let roads = derive_cochange_roads(history);
    let milestones = derive_milestones(history, &timeline);

    CityProject {
        repository: history.repository.name.clone(),
        districts,
        timeline,
        releases,
        milestones,
        roads,
    }
}

fn derive_cochange_roads(history: &RepositoryHistory) -> Vec<CityRoad> {
    let mut path_to_id = HashMap::<String, String>::new();
    for file in &history.files {
        path_to_id.insert(file.path.clone(), file.id.clone());
        for snapshot in &file.history {
            path_to_id.insert(snapshot.path.clone(), file.id.clone());
        }
    }

    let mut weights = HashMap::<(String, String), u32>::new();

    for commit in &history.commits {
        let mut ids = commit
            .changes
            .iter()
            .filter_map(|change| path_to_id.get(&change.path).cloned())
            .collect::<Vec<_>>();
        ids.sort();
        ids.dedup();

        for left in 0..ids.len() {
            for right in (left + 1)..ids.len() {
                let key = (ids[left].clone(), ids[right].clone());
                *weights.entry(key).or_default() += 1;
            }
        }
    }

    let mut roads = weights
        .into_iter()
        .filter(|(_, weight)| *weight >= 2)
        .map(|((from, to), weight)| CityRoad { from, to, weight })
        .collect::<Vec<_>>();

    roads.sort_by(|a, b| b.weight.cmp(&a.weight).then_with(|| a.from.cmp(&b.from)));
    roads.truncate(120);
    roads
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

    for (index, title) in [(99usize, "100th commit"), (999usize, "1000th commit")] {
        if let Some(commit) = timeline.get(index) {
            milestones.push(StoryMilestone {
                id: format!("commit-{}", index + 1),
                kind: if index == 99 {
                    StoryMilestoneKind::Commit100
                } else {
                    StoryMilestoneKind::Commit1000
                },
                title: title.to_string(),
                description: format!("The city reaches {} commits.", index + 1),
                commit_id: commit.id.clone(),
                timestamp: commit.timestamp,
            });
        }
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
        .max_by_key(|commit| {
            commit
                .changes
                .iter()
                .map(|change| (change.additions + change.deletions) as usize)
                .sum::<usize>()
        })
        .filter(|commit| commit.changes.len() >= 2)
    {
        let delta = largest
            .changes
            .iter()
            .map(|change| change.additions as u64 + change.deletions as u64)
            .sum::<u64>();
        milestones.push(StoryMilestone {
            id: "largest-change".to_string(),
            kind: StoryMilestoneKind::LargestChange,
            title: "Biggest construction wave".to_string(),
            description: format!(
                "{} files changed with {} line edits.",
                largest.changes.len(),
                delta
            ),
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

    if let Some((commit, count, directory)) = history
        .commits
        .iter()
        .filter_map(|commit| {
            let mut counts = BTreeMap::<String, usize>::new();
            for change in &commit.changes {
                if matches!(change.kind, ChangeKind::Added) {
                    *counts.entry(directory_of(&change.path)).or_default() += 1;
                }
            }
            counts
                .into_iter()
                .max_by_key(|(_, count)| *count)
                .map(|(directory, count)| (commit, count, directory))
        })
        .max_by_key(|(_, count, _)| *count)
        .filter(|(_, count, _)| *count >= 3)
    {
        milestones.push(StoryMilestone {
            id: "largest-module".to_string(),
            kind: StoryMilestoneKind::LargestModule,
            title: "District expansion".to_string(),
            description: format!(
                "{} gained {} new buildings in one commit.",
                directory, count
            ),
            commit_id: commit.id.clone(),
            timestamp: commit.timestamp,
        });
    }

    let mut monthly = BTreeMap::<String, usize>::new();
    for commit in &history.commits {
        let month = month_key(commit.timestamp);
        *monthly.entry(month).or_default() += 1;
    }
    if let Some((month, count)) = monthly.into_iter().max_by_key(|(_, count)| *count) {
        if let Some(commit) = history
            .commits
            .iter()
            .find(|commit| month_key(commit.timestamp) == month)
        {
            milestones.push(StoryMilestone {
                id: "most-active-month".to_string(),
                kind: StoryMilestoneKind::MostActiveMonth,
                title: "Busiest month".to_string(),
                description: format!("{} commits landed during {}.", count, month),
                commit_id: commit.id.clone(),
                timestamp: commit.timestamp,
            });
        }
    }

    let mut seen_authors = HashMap::<String, String>::new();
    for commit in &history.commits {
        for change in &commit.changes {
            if let Some(file) = history.files.iter().find(|file| {
                file.history.iter().any(|snapshot| snapshot.path == change.path)
            }) {
                if let Some(previous) = file
                    .history
                    .iter()
                    .filter(|snapshot| {
                        snapshot.commit_index
                            < history
                                .commits
                                .iter()
                                .position(|item| item.id == commit.id)
                                .unwrap_or(usize::MAX)
                    })
                    .last()
                {
                    if previous.author_id != commit.author_id {
                        let key = file.id.clone();
                        if seen_authors
                            .insert(key, previous.author_id.clone())
                            .is_none()
                        {
                            milestones.push(StoryMilestone {
                                id: format!("ownership-{}", commit.id),
                                kind: StoryMilestoneKind::OwnershipTransition,
                                title: "Ownership changes".to_string(),
                                description: format!(
                                    "A file changed hands from {} to {}.",
                                    previous.author_id, commit.author_id
                                ),
                                commit_id: commit.id.clone(),
                                timestamp: commit.timestamp,
                            });
                        }
                    }
                }
            }
        }
    }

    let release_count = history.releases.len();
    for release in history
        .releases
        .iter()
        .skip(release_count.saturating_sub(4))
    {
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
    milestones.dedup_by(|a, b| {
        a.commit_id == b.commit_id
            && std::mem::discriminant(&a.kind) == std::mem::discriminant(&b.kind)
    });
    milestones
}

fn month_key(timestamp: i64) -> String {
    let days = timestamp.div_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = year + if month <= 2 { 1 } else { 0 };
    format!("{year:04}-{month:02}")
}

fn directory_of(path: &str) -> String {
    std::path::Path::new(path)
        .parent()
        .and_then(std::path::Path::to_str)
        .filter(|directory| !directory.is_empty())
        .unwrap_or("_root")
        .to_string()
}
