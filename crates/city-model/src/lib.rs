use repository_model::{ChangeKind, FileSnapshot, RepositoryHistory};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CityProject {
    pub repository: String,
    pub districts: Vec<District>,
    pub timeline: Vec<TimelineCommit>,
    pub contributors: Vec<Contributor>,
    pub releases: Vec<ReleaseMarker>,
    pub milestones: Vec<StoryMilestone>,
    pub roads: Vec<CityRoad>,
}

/// One person. `mainline_commits` are replayed in the timeline; `merged_commits`
/// were authored on side branches and entered through merge commits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contributor {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub mainline_commits: u32,
    pub merged_commits: u32,
    pub first_commit_at: i64,
    pub last_commit_at: i64,
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
    pub author_id: String,
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
    pub commit_indices: Vec<usize>,
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
    #[serde(rename = "commit_100")]
    Commit100,
    #[serde(rename = "commit_1000")]
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
        grouped
            .entry(file.directory.clone())
            .or_default()
            .push(Building {
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
                    .max_by(|a, b| {
                        a.additions
                            .cmp(&b.additions)
                            .then(a.commits.cmp(&b.commits))
                            .then_with(|| b.author_id.cmp(&a.author_id))
                    })
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
            author_id: commit.author_id.clone(),
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

    let mut contributors: Vec<Contributor> = history
        .authors
        .iter()
        .map(|author| Contributor {
            id: author.id.clone(),
            name: author.name.clone(),
            email: author.email.clone(),
            mainline_commits: author.commit_count,
            merged_commits: author.merged_commits,
            first_commit_at: author.first_commit_at,
            last_commit_at: author.last_commit_at,
        })
        .collect();
    contributors.sort_by(|a, b| {
        let total_a = a.mainline_commits + a.merged_commits;
        let total_b = b.mainline_commits + b.merged_commits;
        total_b
            .cmp(&total_a)
            .then(a.mainline_commits.cmp(&b.mainline_commits))
            .then(a.id.cmp(&b.id))
    });
    CityProject {
        repository: history.repository.name.clone(),
        districts,
        timeline,
        contributors,
        releases,
        milestones,
        roads,
    }
}

fn derive_cochange_roads(history: &RepositoryHistory) -> Vec<CityRoad> {
    let mut by_commit = BTreeMap::<usize, Vec<String>>::new();
    for file in &history.files {
        for snapshot in &file.history {
            by_commit
                .entry(snapshot.commit_index)
                .or_default()
                .push(file.id.clone());
        }
    }
    let mut pairs = BTreeMap::<(String, String), Vec<usize>>::new();
    for (index, mut ids) in by_commit {
        ids.sort();
        ids.dedup();
        // Bulk imports are not evidence of architectural coupling. Bound work.
        if ids.len() > 200 {
            continue;
        }
        for left in 0..ids.len() {
            for right in (left + 1)..ids.len() {
                pairs
                    .entry((ids[left].clone(), ids[right].clone()))
                    .or_default()
                    .push(index);
            }
        }
    }
    let mut roads = pairs
        .into_iter()
        .filter(|(_, indices)| indices.len() >= 2)
        .map(|((from, to), commit_indices)| CityRoad {
            from,
            to,
            weight: commit_indices.len() as u32,
            commit_indices,
        })
        .collect::<Vec<_>>();
    roads.sort_by(|a, b| {
        b.weight
            .cmp(&a.weight)
            .then(a.from.cmp(&b.from))
            .then(a.to.cmp(&b.to))
    });
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
            title: "首次提交".to_string(),
            description: format!("城市从这里奠基：{}", first.message),
            commit_id: first.id.clone(),
            timestamp: first.timestamp,
        });
    }

    for (index, title) in [(99usize, "第 100 次提交"), (999usize, "第 1000 次提交")] {
        if let Some(commit) = timeline.get(index) {
            milestones.push(StoryMilestone {
                id: format!("commit-{}", index + 1),
                kind: if index == 99 {
                    StoryMilestoneKind::Commit100
                } else {
                    StoryMilestoneKind::Commit1000
                },
                title: title.to_string(),
                description: format!("城市达到 {} 次提交。", index + 1),
                commit_id: commit.id.clone(),
                timestamp: commit.timestamp,
            });
        }
    }

    let mut author_counts = BTreeMap::<String, u32>::new();
    if let Some(commit) = history.commits.iter().find(|commit| {
        let count = author_counts.entry(commit.author_id.clone()).or_default();
        *count += 1;
        *count == 3
    }) {
        milestones.push(StoryMilestone {
            id: "first-major-contributor".to_string(),
            kind: StoryMilestoneKind::FirstMajorContributor,
            title: "核心贡献者出现".to_string(),
            description: format!("{} 完成第 3 次主线提交。", commit.author_name),
            commit_id: commit.id.clone(),
            timestamp: commit.timestamp,
        });
    }

    if let Some(largest) = timeline
        .iter()
        .max_by_key(|commit| {
            commit
                .changes
                .iter()
                .map(|change| change.additions as usize + change.deletions as usize)
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
            title: "最大建设潮".to_string(),
            description: format!(
                "{} 个文件发生变更，共 {} 行改动。",
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
            title: "城市更新".to_string(),
            description: format!(
                "{} 次重命名或删除重塑了城市。",
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
            title: "街区扩张".to_string(),
            description: format!(
                "{} 在一次提交中新增 {} 栋建筑。",
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
                title: "最活跃月份".to_string(),
                description: format!("{} 期间共有 {} 次提交。", month, count),
                commit_id: commit.id.clone(),
                timestamp: commit.timestamp,
            });
        }
    }

    let mut transitions = Vec::new();
    for file in &history.files {
        let mut scores = BTreeMap::<String, (u64, u32)>::new();
        let mut previous: Option<String> = None;
        for snapshot in &file.history {
            let score = scores.entry(snapshot.author_id.clone()).or_default();
            score.0 += snapshot.additions;
            score.1 += 1;
            let owner = scores
                .iter()
                .max_by(|(a_id, a), (b_id, b)| a.cmp(b).then_with(|| b_id.cmp(a_id)))
                .map(|(id, _)| id.clone());
            if let (Some(before), Some(after)) = (&previous, &owner) {
                if before != after {
                    transitions.push(StoryMilestone {
                        id: format!("ownership-{}-{}", snapshot.commit_id, file.id),
                        kind: StoryMilestoneKind::OwnershipTransition,
                        title: "归属交接".to_string(),
                        description: format!(
                            "{}：累计新增行数领先者从 {} 变为 {}。",
                            snapshot.path, before, after
                        ),
                        commit_id: snapshot.commit_id.clone(),
                        timestamp: snapshot.timestamp,
                    });
                    break;
                }
            }
            previous = owner;
        }
    }
    transitions.sort_by_key(|m| timeline.iter().position(|c| c.id == m.commit_id));
    milestones.extend(transitions.into_iter().take(8));

    let release_count = history.releases.len();
    for release in history
        .releases
        .iter()
        .skip(release_count.saturating_sub(4))
    {
        milestones.push(StoryMilestone {
            id: format!("release-{}", release.name),
            kind: StoryMilestoneKind::Release,
            title: format!("版本 {}", release.name),
            description: "Git 标签标记了城市的一个里程碑。".to_string(),
            commit_id: release.commit_id.clone(),
            timestamp: release.timestamp,
        });
    }

    milestones.sort_by_key(|milestone| {
        timeline
            .iter()
            .position(|commit| commit.id == milestone.commit_id)
    });
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

#[cfg(test)]
mod tests {
    use super::*;
    use repository_model::{
        AuthorContribution, AuthorRecord, CommitRecord, FileChange, FileRecord, RepositoryMeta,
    };
    fn history() -> RepositoryHistory {
        let snapshots: Vec<FileSnapshot> = (0..4)
            .map(|i| FileSnapshot {
                commit_id: format!("c{i}"),
                commit_index: i,
                timestamp: 100 - (i as i64),
                path: "src/a".into(),
                lines: 10 + i as u64,
                additions: if i == 0 { 10 } else { 1 },
                deletions: 0,
                author_id: if i == 0 { "alice" } else { "bob" }.into(),
                kind: if i == 0 {
                    ChangeKind::Added
                } else {
                    ChangeKind::Modified
                },
            })
            .collect();
        let commits = snapshots
            .iter()
            .map(|s| CommitRecord {
                id: s.commit_id.clone(),
                parents: vec![],
                author_id: s.author_id.clone(),
                author_name: s.author_id.clone(),
                timestamp: s.timestamp,
                message: "update".into(),
                changes: vec![FileChange {
                    path: s.path.clone(),
                    old_path: None,
                    kind: s.kind,
                    additions: s.additions as u32,
                    deletions: 0,
                    lines_after: Some(s.lines),
                }],
            })
            .collect();
        RepositoryHistory {
            repository: RepositoryMeta {
                name: "test".into(),
                first_commit_at: Some(100),
                last_commit_at: Some(97),
                head: Some("c3".into()),
            },
            commits,
            files: vec![FileRecord {
                id: "file".into(),
                path: "src/a".into(),
                directory: "src".into(),
                created_at: 100,
                deleted_at: None,
                last_modified_at: 97,
                commit_count: 4,
                additions: 13,
                deletions: 0,
                current_lines: 13,
                authors: vec![
                    AuthorContribution {
                        author_id: "alice".into(),
                        additions: 10,
                        deletions: 0,
                        commits: 1,
                    },
                    AuthorContribution {
                        author_id: "bob".into(),
                        additions: 3,
                        deletions: 0,
                        commits: 3,
                    },
                ],
                history: snapshots,
            }],
            authors: vec![AuthorRecord {
                id: "bob".into(),
                name: "bob".into(),
                email: None,
                commit_count: 3,
                merged_commits: 0,
                first_commit_at: 97,
                last_commit_at: 99,
            }],
            releases: vec![],
        }
    }
    #[test]
    fn ownership_uses_contribution_not_last_editor_and_story_uses_lineage() {
        let mut history = history();
        let city = project_city(&history);
        assert_eq!(
            city.districts[0].buildings[0].primary_author.as_deref(),
            Some("alice")
        );
        assert!(!city
            .milestones
            .iter()
            .any(|m| matches!(m.kind, StoryMilestoneKind::OwnershipTransition)));
        assert_eq!(
            city.milestones
                .iter()
                .find(|m| matches!(m.kind, StoryMilestoneKind::FirstMajorContributor))
                .unwrap()
                .commit_id,
            "c3"
        );
        assert_eq!(city.milestones[0].commit_id, "c0");
        history.files[0].history[3].additions = 20;
        let city = project_city(&history);
        assert_eq!(
            city.milestones
                .iter()
                .find(|m| matches!(m.kind, StoryMilestoneKind::OwnershipTransition))
                .unwrap()
                .commit_id,
            "c3"
        );
    }
    #[test]
    fn roads_resolve_file_identity_per_commit_and_are_deterministic() {
        let mut history = history();
        let mut other = history.files[0].clone();
        other.id = "other".into();
        other.history.retain(|s| s.commit_index >= 2);
        other
            .history
            .iter_mut()
            .for_each(|s| s.path = "other/a".into());
        history.files.push(other);
        let roads = derive_cochange_roads(&history);
        assert_eq!(roads.len(), 1);
        assert_eq!(roads[0].commit_indices, vec![2, 3]);
        assert_eq!(roads[0].weight, 2);
        assert_eq!(derive_cochange_roads(&history)[0].to, roads[0].to);
        history.files[1].history.retain(|s| s.commit_index >= 3);
        assert!(derive_cochange_roads(&history).is_empty());
    }
    #[test]
    fn calendar_month_is_exact_at_year_and_leap_boundaries() {
        assert_eq!(month_key(0), "1970-01");
        assert_eq!(month_key(-1), "1969-12");
        assert_eq!(month_key(1_709_164_800), "2024-02");
        assert_eq!(month_key(1_709_251_200), "2024-03");
    }
}
