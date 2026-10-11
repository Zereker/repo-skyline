use anyhow::Result;
use clap::{Parser, Subcommand};
use std::{collections::HashSet, fs, path::PathBuf};

#[derive(Debug, Parser)]
#[command(name = "repo-skyline")]
#[command(about = "Turn Git history into a living city")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Analyze {
        path: PathBuf,

        #[arg(short, long, default_value = "city.json")]
        output: PathBuf,

        #[arg(long)]
        max_buildings: Option<usize>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::Analyze {
            path,
            output,
            max_buildings,
        } => {
            let history = git_analyzer::analyze_repository(&path)?;
            let mut city = city_model::project_city(&history);

            if let Some(limit) = max_buildings {
                limit_buildings(&mut city, limit);
            }

            let json = serde_json::to_string_pretty(&city)?;

            if let Some(parent) = output
                .parent()
                .filter(|parent| !parent.as_os_str().is_empty())
            {
                fs::create_dir_all(parent)?;
            }

            fs::write(&output, json)?;

            let building_count = city
                .districts
                .iter()
                .map(|district| district.buildings.len())
                .sum::<usize>();

            println!(
                "wrote {} ({} districts, {} buildings, {} commits)",
                output.display(),
                city.districts.len(),
                building_count,
                city.timeline.len()
            );
        }
    }

    Ok(())
}

fn limit_buildings(city: &mut city_model::CityProject, limit: usize) {
    let mut ranked = city
        .districts
        .iter()
        .flat_map(|district| district.buildings.iter())
        .map(|building| (building.id.clone(), building.lines, building.commits))
        .collect::<Vec<_>>();

    ranked.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| b.2.cmp(&a.2))
            .then_with(|| a.0.cmp(&b.0))
    });

    let keep = ranked
        .into_iter()
        .take(limit)
        .map(|(id, _, _)| id)
        .collect::<HashSet<_>>();

    for district in &mut city.districts {
        district
            .buildings
            .retain(|building| keep.contains(&building.id));
    }

    let historical_directories = city
        .districts
        .iter()
        .flat_map(|district| district.buildings.iter())
        .flat_map(|building| building.history.iter())
        .map(|snapshot| {
            snapshot
                .path
                .rsplit_once('/')
                .map(|(dir, _)| dir)
                .unwrap_or("_root")
                .to_string()
        })
        .collect::<HashSet<_>>();
    city.districts.retain(|district| {
        !district.buildings.is_empty() || historical_directories.contains(&district.path)
    });
    city.roads
        .retain(|road| keep.contains(&road.from) && keep.contains(&road.to));
}
