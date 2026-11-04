import type { EnvironmentSettings } from "../types";

export function createDefaultEnvironmentSettings(): EnvironmentSettings {
  return {
    offsetX: 0,
    offsetY: 0.075,
    offsetZ: -0.10
    ,
    night: false,
    windowIntensity: NIGHT_PRESET.windowIntensity,
  };
}

// Modo noite derivado do HDRI diurno — sem segundo asset de céu. `skyTint` multiplica o
// mapa do céu (MeshBasicMaterial.color), o resto escurece cena/luz/névoa.
export const NIGHT_PRESET = {
  /** Multiplicador do céu diurno → azul-noite mantendo a estrutura das nuvens. */
  skyTint: "#1b2440",
  /** Luz ambiente vira luar frio. */
  ambientColor: "#8ea6d6",
  /** Fator sobre `ambientTotal` — prédios ficam escuros, LED/holograma passam a dominar. */
  ambientScale: 0.09,
  /** Peso do IBL (scene.environment continua sendo o HDRI diurno). */
  environmentIntensity: 0.1,
  fogColor: "#070b16",
  /** Cor da luz interna vista pela janela acesa. */
  windowColor: "#ffcb82",
  /** Padrão do slider "Brilho das janelas" (`EnvironmentSettings.windowIntensity`). */
  windowIntensity: 1.7,
  /** Fração das janelas que acendem (hash por célula da grade da fachada). */
  windowLitFraction: 0.26,
  /** `envMapIntensity` da fachada de noite — cidade escura não devolve reflexo de dia. */
  facadeEnvMapIntensity: 0.6,
  /** `emissiveIntensity` da luminária dos postes de rua acesa. */
  lampEmissive: 2.6,
  /** Ganho da mancha de luz que o poste joga no asfalto. */
  lampPool: 0.55,
  /** Pontos do campo de estrelas (hemisfério de cima). */
  starCount: 1400,
  /** Raio no espaço LOCAL da esfera do céu (que é unitária e escalada em runtime). */
  starRadius: 0.9,
  starSize: 1.6,
};
