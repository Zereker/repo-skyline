import type { CityProject } from "./types";

export function visibleCityAt(city: CityProject, timestamp: number): CityProject {
  return {
    ...city,
    districts: city.districts
      .map((district) => ({
        ...district,
        buildings: district.buildings.filter(
          (building) =>
            building.created_at <= timestamp &&
            (building.deleted_at == null || building.deleted_at > timestamp),
        ),
      }))
      .filter((district) => district.buildings.length > 0),
  };
}
