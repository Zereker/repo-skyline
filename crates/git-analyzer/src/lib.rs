use city_model::City;
use std::path::Path;

pub fn analyze_repository(path: impl AsRef<Path>) -> anyhow::Result<City> {
    let path = path.as_ref();
    let repository = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("repository")
        .to_string();

    Ok(City {
        repository,
        districts: Vec::new(),
    })
}
