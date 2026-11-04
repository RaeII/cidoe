import type { BuildingSettings } from "../types";

//Edificio config
export const DEFAULT_BUILDING_SETTINGS: BuildingSettings = {
  color: "#d4d4d4",
  roughness: 0.84,
  metalness: 0.37,
  targetMaxHeight: 15,
};

export function createDefaultBuildingSettings(): BuildingSettings {
  return { ...DEFAULT_BUILDING_SETTINGS };
}
