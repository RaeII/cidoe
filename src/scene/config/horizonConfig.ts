import { CITY_SCENE_CONFIG } from "./citySceneConfig";
import type { HorizonSettings } from "../types";

export function createDefaultHorizonSettings(): HorizonSettings {
  return {
    distance: 208.3,
    // Igual à frontal por padrão = comportamento inalterado até o usuário reduzir.
    backDistance: 46.2,
    renderDistance: CITY_SCENE_CONFIG.far,
    // Corte reto acompanha a direção da câmera; laterais cobrem o frustum inteiro.
    groundDistance: CITY_SCENE_CONFIG.far * 1.1,
    groundEdgeMode: "straight",
    fogDensity: CITY_SCENE_CONFIG.sceneFogDensity,
    fogColor: CITY_SCENE_CONFIG.sceneFogColor,
  };
}
