import type { UIVisibilitySettings } from "../types";
import { readProjectStorage } from "../../lib/projectStorage";

const STORAGE_KEY = "cidoe:ui-visibility";

export function createDefaultUIVisibilitySettings(): UIVisibilitySettings {
  return {
    cameraLog: false,
    donationInput: true,
    bulkInput: true,
    blockLayoutInput: true,
    buildingLayoutCard: false,
  };
}

// Carrega do localStorage, mesclado com defaults. Campos novos/ausentes caem no default.
export function loadUIVisibilitySettings(): UIVisibilitySettings {
  const defaults = createDefaultUIVisibilitySettings();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = readProjectStorage(window.localStorage, STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<UIVisibilitySettings>;
    const merged = { ...defaults };
    for (const key of Object.keys(defaults) as (keyof UIVisibilitySettings)[]) {
      if (typeof parsed[key] === "boolean") merged[key] = parsed[key];
    }
    return merged;
  } catch {
    return defaults;
  }
}

export function saveUIVisibilitySettings(settings: UIVisibilitySettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage cheio/bloqueado — ignora, preferência não persiste
  }
}
