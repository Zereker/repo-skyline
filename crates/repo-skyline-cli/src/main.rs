use anyhow::Result;
use clap::{Parser, Subcommand};
use std::{fs, path::PathBuf};

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
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::Analyze { path, output } => {
            let history = git_analyzer::analyze_repository(&path)?;
            let city = city_model::project_city(&history);
            let json = serde_json::to_string_pretty(&city)?;

            if let Some(parent) = output.parent().filter(|parent| !parent.as_os_str().is_empty()) {
                fs::create_dir_all(parent)?;
            }

            fs::write(&output, json)?;
            println!(
                "wrote {} ({} districts, {} buildings)",
                output.display(),
                city.districts.len(),
                city.districts
                    .iter()
                    .map(|district| district.buildings.len())
                    .sum::<usize>()
            );
        }
    }

    Ok(())
}
