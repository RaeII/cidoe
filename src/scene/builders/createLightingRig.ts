import * as THREE from "three";
import { getDirectionalPositionFromAngles, getLightMetrics } from "../utils/lighting";
import type { LightSettings } from "../types";

export type LightingRig = {
  ambient: THREE.AmbientLight;
  directional: THREE.DirectionalLight;
  update: (lightSettings: LightSettings) => ReturnType<typeof getLightMetrics>;
  dispose: () => void;
};

export function createLightingRig(scene: THREE.Scene, lightSettings: LightSettings): LightingRig {
  const metrics = getLightMetrics(lightSettings);
  const ambient = new THREE.AmbientLight(
    lightSettings.ambientColor,
    metrics.ambientTotal,
  );
  scene.add(ambient);

  // Sem castShadow: só sombreamento por face (N·L). Alvo na origem — direção é o que importa.
  const directional = new THREE.DirectionalLight();
  scene.add(directional);

  const update = (settings: LightSettings) => {
    const nextMetrics = getLightMetrics(settings);

    ambient.color.set(settings.ambientColor);
    ambient.intensity = nextMetrics.ambientTotal;

    // Estado salvo antes dos campos existirem vem sem eles → desligada.
    const intensity = settings.directionalEnabled ? settings.directionalIntensity ?? 0 : 0;
    const { x, y, z } = getDirectionalPositionFromAngles(1, settings.directionalElevation, settings.directionalAzimuth);
    directional.position.set(x, y, z);
    directional.color.set(settings.directionalColor);
    directional.intensity = intensity;
    // Invisível desligada → materiais compilam sem a luz (custo zero no padrão).
    directional.visible = intensity > 0;

    return nextMetrics;
  };

  update(lightSettings);

  return {
    ambient,
    directional,
    update,
    dispose() {
      scene.remove(ambient);
      scene.remove(directional);
    },
  };
}
