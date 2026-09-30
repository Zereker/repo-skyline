use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct City {
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
    pub path: String,
    pub lines: u64,
    pub commits: u64,
    pub primary_author: Option<String>,
}
