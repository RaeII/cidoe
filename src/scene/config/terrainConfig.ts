import type { TerrainSettings } from "../types";

// Constantes do encaixe na cidade (não expostas na UI). size/segments agora vêm de TerrainSettings.
// Folga entre a borda do loteamento e onde o relevo verde começa. Precisa ultrapassar ~1
// célula da malha do relevo (size/segments ≈ 29u no padrão) — senão a interpolação grosseira
// do triângulo entre um vértice cinza (perto) e um verde (longe) sangra verde sobre as quadras
// de borda. Como o início se baseia em cityRadius, a recessão do verde cresce com a cidade.
export const TERRAIN_CITY_PADDING = 30;
export const TERRAIN_TRANSITION = 60;     // largura MÍNIMA do degradê cidade→relevo (cresce com a altura: max(este, height*3))
// Nível plano do relevo na zona da cidade. O relevo é o chão único (o plano cinza fica
// escondido enquanto o relevo está ligado — ver runtime), então só precisa ficar ABAIXO das
// ruas (-0.015) com folga pra não brigar (z-fighting) com elas. As colinas sobem a partir daqui.
export const TERRAIN_GROUND_Y = -0.04;

// Opções de resolução da malha (mesmas do protótipo terrain.md).
export const TERRAIN_SEGMENT_OPTIONS = [16, 24, 32, 48, 64, 96, 128, 192, 256] as const;

export const DEFAULT_TERRAIN_SETTINGS: TerrainSettings = {
  enabled: true,
  seed: 91297,
  segments: 24,
  size: 700,
  height: 40,
  frequency: 2,
  octaves: 6,
  persistence: 0.5,
  lacunarity: 2.2,
  ridge: 1.0,
  faults: 0,
  faultStrength: 4,
  smooth: 4,
  terrace: 0,
  edge: 0.3,
  wireframe: false,
  lowColor: "#2c4521",
  highColor: "#0c270e",
};

export function createDefaultTerrainSettings(): TerrainSettings {
  return { ...DEFAULT_TERRAIN_SETTINGS };
}

// Cidade grande demais: o relevo (mesh fixo de size=700) vira um tapete perdido embaixo
// dos prédios e ainda paga vértices. Acima deste número de edifícios ele some — o painel
// continua mandando, mas o runtime sobrepõe enabled (ver createCitySceneRuntime).
export const TERRAIN_MAX_BUILDINGS = 5000;
