import { CITY_SCENE_CONFIG } from "./citySceneConfig";
import type { HorizonSettings } from "../types";

export function createDefaultHorizonSettings(): HorizonSettings {
  return {
    // Cull frontal dos edifícios. 150: névoa (0,007) já cobre 65% ali; acima de `far` (190)
    // o cull nunca agia antes do corte da câmera e o anel 150–190 custava ~38% da área.
    distance: 150,
    // Atrás da câmera o corte é curto: só o que a órbita traz de volta rápido.
    backDistance: 46.2,
    renderDistance: CITY_SCENE_CONFIG.far,
    // Corte reto acompanha a direção da câmera; laterais cobrem o frustum inteiro.
    groundDistance: CITY_SCENE_CONFIG.far * 1.1,
    groundEdgeMode: "straight",
    fogDensity: CITY_SCENE_CONFIG.sceneFogDensity,
    fogColor: CITY_SCENE_CONFIG.sceneFogColor,
  };
}
