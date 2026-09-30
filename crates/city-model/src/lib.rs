use repository_model::RepositoryHistory;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CityProject {
    pub repository: String,
    pub districts: Vec<District>,
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

    CityProject {
        repository: history.repository.name.clone(),
        districts,
    }
}
