import type { ReflectionSettings } from "../types";

// Padrões alinhados ao probe da branch video-2: cube de 256 preso à câmera,
// recapturado a cada 4 frames, sem correção de céu/horizonte e sem atenuação
// por altura ou distância. Os controles do painel continuam expondo tudo isso.
export const DEFAULT_REFLECTION_SETTINGS: ReflectionSettings = {
  enabled: true,
  // 256: a fachada é espelho (roughness 0) e amostra o mip 0 — em 128 o céu/skyline vira
  // mancha lisa e o prédio parece sem reflexo.
  resolution: 256,
  // Probe na câmera: o reflexo acompanha o ponto de vista, então cada prédio devolve
  // o que está à frente dele em vez do cube fixo do centro da cidade.
  probeX: 0,
  probeY: 18,
  probeZ: 0,
  followCamera: true,
  // Sem deslocamento de céu na captura — o cube vê o mesmo horizonte do render normal.
  skyDrop: -0.015,
  // Vetor de reflexão cru, sem achatamento em direção ao horizonte.
  envHorizon: 0,
  envRotY: 0,
  heightFadeStart: 32.8,
  heightFadeEnd: 57.6,
  // 0 = sem piso de rugosidade por altura; fachada mantém o espelho de cima.
  heightBlur: 0,
  // Faixa além do alcance do probe (reflectionFar = 260) = proximidade sempre 1.
  reflectionDistanceStart: 599,
  reflectionDistanceEnd: 600,
  updateInterval: 4,
  continuous: true,
  // Chão, relevo e piso urbano entram no cube para aparecerem nos reflexos dos edifícios.
  // Os controles permitem excluí-los quando a prioridade for destacar céu/skyline.
  includeGround: true,
  includeCityFloor: true,
};

export function createDefaultReflectionSettings(): ReflectionSettings {
  return { ...DEFAULT_REFLECTION_SETTINGS };
}
