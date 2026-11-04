import * as THREE from "three";

import skyUrl from "../../assets/environment/DaySkyHDRI040B_4K_TONEMAPPED.webp";
import skyLowUrl from "../../assets/environment/DaySkyHDRI040B_4K_TONEMAPPED.low.webp";
import pmremUrl from "../../assets/environment/DaySkyHDRI040B_4K_TONEMAPPED.pmrem.webp";
import { NIGHT_PRESET } from "../config/environmentConfig";
import type { EnvironmentSettings } from "../types";
import { loadImageTexture } from "../textures/loadImageTexture";
import { IS_LOW_TIER } from "../utils/deviceTier";
import { seeded } from "../utils/random";

export type EnvironmentUpdater = {
  updateSettings: (settings: EnvironmentSettings) => void;
  updatePosition: (x: number, y: number, z: number) => void;
  /** Raio da esfera do céu. Segue o alcance da câmera — acima de `far` o céu seria cortado. */
  setRadius: (renderDistance: number) => void;
  /** Esconde as estrelas (pontos de tamanho fixo em pixels viram borrões no cube do reflexo). */
  setStarsVisible: (visible: boolean) => void;
  dispose: () => void;
};

// Esfera do céu unitária escalada em runtime: raio = renderDistance * SKY_RADIUS_RATIO.
// Fica dentro do far plane com folga; acima dele o céu some e o fundo vira preto.
const SKY_RADIUS_RATIO = 0.9;

// Dois arquivos do mesmo HDRI (WebP, `npm run textures:webp`):
// - céu visível (esfera invertida): 4K no desktop, 2K no IS_LOW_TIER (tela pequena,
//   1/4 da VRAM e do upload).
// - fonte do PMREM (scene.environment): 1024×512. O PMREM faz cubo de largura/4 e a
//   doc do three pede 1K de entrada; o 4K gerava alvo de ~96 MiB pro mesmo IBL.
const SKY_URL = IS_LOW_TIER ? skyLowUrl : skyUrl;

// Cache persistente da imagem HDRI no Cache API do browser.
// Bump versão se a imagem mudar de conteúdo.
const ENV_CACHE_NAME = "cidoe-env-v2";

// Resolve URL da textura priorizando o Cache API: primeira visita baixa e
// grava; visitas seguintes leem direto do cache local (sem rede). Devolve um
// object URL do blob cacheado, ou a URL original como fallback.
async function resolveEnvUrl(url: string): Promise<string> {
  if (!("caches" in globalThis)) return url;
  try {
    void caches.delete("cidoa-env-v1"); // JPG 4K de 3 MB da versão anterior
    void caches.delete("cidoa-env-v2"); // Cache da marca anterior; não contém dados da cidade.
    const cache = await caches.open(ENV_CACHE_NAME);
    let response = await cache.match(url);
    if (!response) {
      response = await fetch(url);
      if (!response.ok) return url;
      await cache.put(url, response.clone());
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}

// Estrelas: Points no hemisfério de cima, filho da esfera do céu — herda rotação e o
// reposicionamento por frame. sizeAttenuation off = tamanho fixo em pixels.
function createStars(): THREE.Points {
  const positions = new Float32Array(NIGHT_PRESET.starCount * 3);
  for (let i = 0; i < NIGHT_PRESET.starCount; i++) {
    const y = seeded(i, 91, 1);
    const ring = Math.sqrt(1 - y * y);
    const theta = seeded(i, 91, 2) * Math.PI * 2;
    positions[i * 3] = Math.cos(theta) * ring * NIGHT_PRESET.starRadius;
    positions[i * 3 + 1] = y * NIGHT_PRESET.starRadius;
    positions[i * 3 + 2] = Math.sin(theta) * ring * NIGHT_PRESET.starRadius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: NIGHT_PRESET.starSize,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Points(geometry, material);
}

function applySettings(
  skyMesh: THREE.Mesh,
  skyMaterial: THREE.MeshBasicMaterial,
  stars: THREE.Points,
  settings: EnvironmentSettings,
) {
  // Rotação horizontal via mesh: uniforme em todas as direções
  skyMesh.rotation.y = settings.offsetX;
  // Deslocamento vertical via UV offset: move o horizonte uniformemente em todos os lados.
  // offset é uniform — não precisa de needsUpdate (que re-enviaria a textura 4K à GPU).
  if (skyMaterial.map) skyMaterial.map.offset.y = settings.offsetY;
  // Roll (inclinação diagonal)
  skyMesh.rotation.z = settings.offsetZ;
  // Noite = céu diurno multiplicado por azul escuro; branco = passa o HDRI intacto.
  skyMaterial.color.set(settings.night ? NIGHT_PRESET.skyTint : "#ffffff");
  stars.visible = settings.night;
}

export function loadEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  settings: EnvironmentSettings,
  initialRenderDistance: number,
  onLoaded?: (envMap: THREE.Texture, bgTexture: THREE.Texture) => void,
  isCancelled?: () => boolean,
  onFailed?: () => void,
): EnvironmentUpdater {
  let skyMesh: THREE.Mesh | null = null;
  let skyGeometry: THREE.SphereGeometry | null = null;
  let skyMaterial: THREE.MeshBasicMaterial | null = null;
  let stars: THREE.Points | null = null;
  let currentRadius = initialRenderDistance * SKY_RADIUS_RATIO;
  // HDRI chega async; noite pode ser ligada antes do load terminar.
  let currentSettings = settings;

  const load = (url: string) =>
    resolveEnvUrl(url).then(async (resolvedUrl) => {
      const texture = await loadImageTexture(resolvedUrl);
      if (resolvedUrl !== url) URL.revokeObjectURL(resolvedUrl);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    });

  // Compila o shader do PMREM enquanto o HDRI baixa, não no frame em que ele chega.
  let pmremGenerator: THREE.PMREMGenerator | null = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  const buildSky = (texture: THREE.Texture, pmremSource: THREE.Texture) => {
    if (isCancelled?.() || !pmremGenerator) {
      texture.dispose();
      pmremSource.dispose();
      return;
    }

    texture.wrapT = THREE.RepeatWrapping;

    // Esfera invertida como background — permite offset UV uniforme em todas as direções
    skyGeometry = new THREE.SphereGeometry(1, 64, 40);
    skyMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
    skyMesh.scale.setScalar(currentRadius);
    skyMesh.renderOrder = -1000;
    stars = createStars();
    skyMesh.add(stars);
    applySettings(skyMesh, skyMaterial, stars, currentSettings);
    scene.add(skyMesh);

    // scene.environment para iluminação PBR dos edifícios. A fonte 1K só serve aqui.
    const envMap = pmremGenerator.fromEquirectangular(pmremSource).texture;
    scene.environment = envMap;
    pmremGenerator.dispose();
    pmremGenerator = null;
    pmremSource.dispose();

    onLoaded?.(envMap, texture);
  };

  void Promise.all([load(SKY_URL), load(pmremUrl)]).then(
    ([texture, pmremSource]) => buildSky(texture, pmremSource),
    (err) => {
      console.warn("[environment] HDRI falhou", err);
      if (!isCancelled?.()) onFailed?.();
    },
  );

  return {
    updateSettings(newSettings: EnvironmentSettings) {
      currentSettings = newSettings;
      if (skyMesh && skyMaterial && stars) {
        applySettings(skyMesh, skyMaterial, stars, newSettings);
      }
    },
    updatePosition(x: number, y: number, z: number) {
      skyMesh?.position.set(x, y, z);
    },
    setRadius(renderDistance: number) {
      currentRadius = renderDistance * SKY_RADIUS_RATIO;
      skyMesh?.scale.setScalar(currentRadius);
    },
    setStarsVisible(visible: boolean) {
      if (stars) stars.visible = visible && currentSettings.night;
    },
    dispose() {
      pmremGenerator?.dispose();
      pmremGenerator = null;
      if (skyMesh) scene.remove(skyMesh);
      skyGeometry?.dispose();
      skyMaterial?.dispose();
      stars?.geometry.dispose();
      (stars?.material as THREE.Material | undefined)?.dispose();
    },
  };
}
