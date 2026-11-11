import type { LightSettings, PointLightConfig } from "../types";

export const DEFAULT_LIGHT_SETTINGS: LightSettings = {
  ambientColor: "#fffaf2",
  ambientExtraIntensity: 0.4,
  hemisphereSkyColor: "#b9c7d9",
  hemisphereGroundColor: "#0b0e14",
  hemisphereIntensity: 0.35,
  directionalColor: "#fffefb",
  directionalEnabled: false,
  ledSpillEnabled: true,
  directionalIntensity: 6,
  directionalDistance: 67,
  directionalElevation: 68,
  directionalAzimuth: -242,
  directionalTargetX: 26,
  directionalTargetY: -8,
  directionalTargetZ: -2,
};

export function createDefaultLightSettings(): LightSettings {
  return { ...DEFAULT_LIGHT_SETTINGS };
}

export const DEFAULT_POINT_LIGHTS: PointLightConfig[] = [
  { x: -15, y: 25, z: 10, intensity: 1625 },
  { x: 15, y: 25, z: 10, intensity: 1625 },
  { x: -15, y: 25, z: -10, intensity: 1625 },
  { x: 15, y: 25, z: -10, intensity: 1625 },
];
