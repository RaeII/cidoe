import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clearTextureSlots } from "./createEmpireBuildingMesh";

// Torre residencial (ref. model1.png da branch video-1):
// sacadas em 3 lados com guarda-corpo de vidro, pano de vidro recuado atrás das
// sacadas, empena cega nos fundos (−Z) com janelas estreitas, aletas terracota
// nos cantos dos fundos, térreo com pilotis e casa de máquinas na cobertura.
//
// Medidas em metros. Footprint 20×20 m = unit box em X/Z. Número de andares
// sai da altura do edifício na cena → pé-direito constante em qualquer altura.
// Sem textura de fachada: detalhe em geometria + 6 slots de material autorais.

// Mapas PBR da pedra — o manager repassa o set Concrete024 do topo (ou null com
// texturas desligadas). Builder não carrega textura: roda em node e no preview.
export type ResidentialStoneMaps = {
  color: THREE.Texture;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
};

export type ResidentialTierFootprint = {
  bottomY: number;
  topY: number;
  width: number;
  depth: number;
};

// Slots de material — ordem = índice do grupo na geometria.
const SLOT = { stone: 0, roof: 1, glass: 2, railing: 3, frame: 4, accent: 5 } as const;
const SLOT_COUNT = 6;

const WORLD_UNITS_PER_METER = 0.1; // pé-direito 3,2 m → 0,32 un. na cena
const HALF = 10; // meio footprint (aletas terracota encostam aqui)
const SLAB_HALF = 9.92; // borda da laje — aleta fica 8 cm saliente
const CORE = 8; // face do núcleo nas 3 faces com sacada → sacada de 1,92 m
const CORE_BACK = -9.85; // empena cega; laje 7 cm saliente marca cada andar
const FIN_IN = 7.9; // face interna da aleta (sobrepõe 10 cm o núcleo)
const FIN_Z = -7.2; // aleta fecha a sacada lateral nos fundos
const PIER = 0.9; // pilar de pedra nos cantos do pano de vidro
const FLOOR_H = 3.2;
const SLAB_T = 0.6;
const GROUND_H = 4.6;
const RAIL_H = 1.05;
const RAIL_INSET = 0.12;
const DECK_T = 0.06;
const PENT_W = 8;
const PENT_D = 7;
const PENT_H = 3.4;
const CAP_T = 0.2;
const ROOF_EXTRA = SLAB_T + DECK_T + PENT_H + CAP_T;
const MAX_FLOORS = 60;
// Altura do preview do admin (VIEW.shape em createPreviewScene). A cena troca a
// geometria pela altura real via setResidentialBuildingHeight.
const DEFAULT_HEIGHT = 3;

// Cena tem ambient forte (~8) + exposição 1.45 → albedo alto estoura p/ branco.
// Valores calibrados no runtime: travertino × mapa de concreto lê como creme.
const STONE_COLOR = 0xbbb4a6;
const STONE_TILING = 6; // × uTiling global (0.4) → mapa repete a cada ~4 m

// Acessório de topo assenta na casa de máquinas: escala pelo menor lado dela.
export const RESIDENTIAL_ROOFTOP_SCALE = Math.min(PENT_W, PENT_D) / (2 * HALF);

const geometryCache = new Map<number, THREE.BufferGeometry>();

type Range = [number, number];
const mirrorX = (side: number, a: number, b: number): Range =>
  side > 0 ? [a, b] : [-b, -a];

export function getResidentialFloorCount(height: number): number {
  const floors = Math.round(
    (height / WORLD_UNITS_PER_METER - GROUND_H - ROOF_EXTRA) / FLOOR_H,
  );
  return Math.max(1, Math.min(MAX_FLOORS, floors));
}

function getLevels(floors: number) {
  const roof = GROUND_H + floors * FLOOR_H; // base da laje de cobertura
  const deck = roof + SLAB_T;
  return { roof, deck, total: roof + ROOF_EXTRA };
}

function buildResidentialGeometry(floors: number): THREE.BufferGeometry {
  const { roof, deck, total } = getLevels(floors);
  const slots: THREE.BufferGeometry[][] = Array.from({ length: SLOT_COUNT }, () => []);

  // Caixa por min/max em metros → unit box (x,z ÷ 20; y ÷ altura − 0,5).
  const box = (
    slot: number,
    [x0, x1]: Range,
    [y0, y1]: Range,
    [z0, z1]: Range,
  ) => {
    const geometry = new THREE.BoxGeometry(
      (x1 - x0) / (2 * HALF),
      (y1 - y0) / total,
      (z1 - z0) / (2 * HALF),
    );
    geometry.translate(
      (x0 + x1) / (4 * HALF),
      (y0 + y1) / (2 * total) - 0.5,
      (z0 + z1) / (4 * HALF),
    );
    slots[slot].push(geometry);
  };

  const sides = [-1, 1];
  const frontGlass: Range = [-CORE + PIER, CORE - PIER];
  const sideGlass: Range = [FIN_Z + PIER, CORE - PIER];
  const towerY: Range = [GROUND_H, roof];

  // --- Térreo: parede nos fundos, lobby de vidro recuado, pilotis ---
  box(SLOT.stone, [-CORE, CORE], [0, GROUND_H], [CORE_BACK, -9]);
  box(SLOT.glass, [-7.4, 7.4], [0, GROUND_H], [-9, 7.4]);
  const col = 0.4;
  for (const [x, z] of [
    [-9, 9], [9, 9], [-3.2, 9], [3.2, 9],
    [-9, 3.2], [9, 3.2], [-9, -3.2], [9, -3.2],
  ]) {
    box(SLOT.stone, [x - col, x + col], [0, GROUND_H], [z - col, z + col]);
  }
  for (let i = 1; i < 6; i++) {
    const x = -7.4 + (i * 14.8) / 6;
    box(SLOT.frame, [x - 0.05, x + 0.05], [0, GROUND_H], [7.4, 7.48]);
  }
  for (const s of sides) {
    for (let i = 1; i < 7; i++) {
      const z = -9 + (i * 16.4) / 7;
      box(SLOT.frame, mirrorX(s, 7.4, 7.48), [0, GROUND_H], [z - 0.05, z + 0.05]);
    }
  }

  // --- Núcleo de pedra + pano de vidro recuado (contínuo; lajes cortam) ---
  box(SLOT.stone, [-CORE, CORE], towerY, [CORE_BACK, CORE]);
  box(SLOT.glass, frontGlass, towerY, [CORE, CORE + 0.04]);
  for (let i = 0; i <= 8; i++) {
    const x = frontGlass[0] + (i * (frontGlass[1] - frontGlass[0])) / 8;
    box(SLOT.frame, [x - 0.04, x + 0.04], towerY, [CORE, CORE + 0.12]);
  }
  for (const s of sides) {
    box(SLOT.glass, mirrorX(s, CORE, CORE + 0.04), towerY, sideGlass);
    for (let i = 0; i <= 7; i++) {
      const z = sideGlass[0] + (i * (sideGlass[1] - sideGlass[0])) / 7;
      box(SLOT.frame, mirrorX(s, CORE, CORE + 0.12), towerY, [z - 0.04, z + 0.04]);
    }
    // Aleta terracota: do chão ao topo do guarda-corpo da cobertura.
    box(SLOT.accent, mirrorX(s, FIN_IN, HALF), [0, deck + RAIL_H], [-HALF, FIN_Z]);
  }

  // --- Lajes/sacadas por andar (f = floors → laje de cobertura) ---
  const edge = SLAB_HALF - RAIL_INSET;
  for (let f = 0; f <= floors; f++) {
    const y = GROUND_H + f * FLOOR_H;
    const railY: Range = [y + SLAB_T, y + SLAB_T + RAIL_H];
    box(SLOT.stone, [-SLAB_HALF, SLAB_HALF], [y, y + SLAB_T], [-SLAB_HALF, SLAB_HALF]);
    box(SLOT.railing, [-edge, edge], railY, [edge - 0.02, edge + 0.02]);
    for (const s of sides) {
      box(SLOT.railing, mirrorX(s, edge - 0.02, edge + 0.02), railY, [FIN_Z, edge - 0.02]);
    }
    if (f === floors) {
      box(SLOT.railing, [-FIN_IN, FIN_IN], railY, [-edge - 0.02, -edge + 0.02]);
      break;
    }

    // Testeira escura do caixilho logo abaixo da laje seguinte.
    const headY: Range = [y + FLOOR_H - 0.16, y + FLOOR_H];
    box(SLOT.frame, frontGlass, headY, [CORE, CORE + 0.1]);
    for (const s of sides) {
      box(SLOT.frame, mirrorX(s, CORE, CORE + 0.1), headY, sideGlass);
    }

    // Janelas estreitas na empena cega (moldura escura + vidro).
    for (const x of [-3.4, 3.4]) {
      box(
        SLOT.frame,
        [x - 0.55, x + 0.55],
        [y + SLAB_T + 0.25, y + FLOOR_H - 0.15],
        [CORE_BACK - 0.03, CORE_BACK],
      );
      box(
        SLOT.glass,
        [x - 0.45, x + 0.45],
        [y + SLAB_T + 0.35, y + FLOOR_H - 0.25],
        [CORE_BACK - 0.05, CORE_BACK],
      );
    }
  }

  // --- Cobertura: piso + casa de máquinas com venezianas e porta ---
  const deckInset = SLAB_HALF - 0.3;
  box(SLOT.roof, [-deckInset, deckInset], [deck, deck + DECK_T], [-deckInset, deckInset]);
  const pb = deck + DECK_T;
  const pt = pb + PENT_H;
  const pw = PENT_W / 2;
  const pd = PENT_D / 2;
  box(SLOT.stone, [-pw, pw], [pb, pt], [-pd, pd]);
  box(SLOT.roof, [-pw - 0.15, pw + 0.15], [pt, pt + CAP_T], [-pd - 0.15, pd + 0.15]);
  box(SLOT.glass, [-0.6, 0.6], [pb, pb + 2.3], [pd, pd + 0.04]);
  for (const s of sides) {
    box(SLOT.frame, mirrorX(s, pw, pw + 0.04), [pb + 0.8, pb + 2.8], [-2, 2]);
    for (let i = 0; i < 5; i++) {
      const y = pb + 1 + i * 0.4;
      box(SLOT.frame, mirrorX(s, pw + 0.04, pw + 0.12), [y, y + 0.08], [-1.9, 1.9]);
    }
  }

  // Compila por slot: 1 grupo (= 1 draw call) por material.
  const perSlot = slots.map((list) => {
    const merged = mergeGeometries(list, false);
    for (const geometry of list) geometry.dispose();
    return merged;
  });
  const geometry = mergeGeometries(perSlot, true);
  for (const part of perSlot) part.dispose();

  // Shader triplanar da fachada lê aProjPosition/aProjNormal (sem textura aqui).
  geometry.setAttribute("aProjPosition", geometry.getAttribute("position").clone());
  geometry.setAttribute("aProjNormal", geometry.getAttribute("normal").clone());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function getResidentialGeometry(floors: number): THREE.BufferGeometry {
  let geometry = geometryCache.get(floors);
  if (!geometry) {
    geometry = buildResidentialGeometry(floors);
    geometryCache.set(floors, geometry);
  }
  return geometry;
}

// Mantém o pé-direito real quando a altura do edifício muda (troca geometria
// do cache só se o número de andares mudou).
export function setResidentialBuildingHeight(mesh: THREE.Mesh, height: number): void {
  const geometry = getResidentialGeometry(getResidentialFloorCount(height));
  if (mesh.geometry !== geometry) mesh.geometry = geometry;
}

// Tiers para o LED de arestas: corpo com sacadas + casa de máquinas.
export function getResidentialTierFootprints(
  width = 1,
  depth = 1,
  height = 1,
): ResidentialTierFootprint[] {
  const { deck, total } = getLevels(getResidentialFloorCount(height));
  const toWorld = (y: number) => (y / total) * height;
  return [
    { bottomY: 0, topY: toWorld(deck + RAIL_H), width, depth },
    {
      bottomY: toWorld(deck + DECK_T),
      topY: height,
      width: (width * PENT_W) / (2 * HALF),
      depth: (depth * PENT_D) / (2 * HALF),
    },
  ];
}

// Y (relativo ao centro do edifício) do piso da cobertura — letreiro apoia aqui.
export function getResidentialRoofOffset(height: number): number {
  const { deck, total } = getLevels(getResidentialFloorCount(height));
  return (deck / total - 0.5) * height;
}

// Material com envMap = cubemap dinâmico da cena (reflete a cidade).
// `authoredEnvMapIntensity` → manager zera na captura e restaura este valor
// (em vez do envMapIntensity global das fachadas texturizadas).
export function createSceneMaterial(
  envMap: THREE.Texture | null,
  params: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ ...params, envMap });
  material.userData.authoredEnvMapIntensity = material.envMapIntensity;
  if (material.transparent) material.userData.baseOpacity = material.opacity;
  return material;
}

// Liga/desliga a textura da pedra (slot 0). Chamado pelo manager na criação e
// sempre que a textura do topo muda (set carregou, texturas on/off).
export function setResidentialStoneMaps(
  stone: THREE.MeshStandardMaterial,
  maps: ResidentialStoneMaps | null,
): void {
  const mask = () => Number(Boolean(stone.map)) | (Number(Boolean(stone.normalMap)) << 1) | (Number(Boolean(stone.roughnessMap)) << 2);
  const previous = mask();
  stone.map = maps?.color ?? null;
  stone.normalMap = maps?.normal ?? null;
  stone.roughnessMap = maps?.roughness ?? null;
  if (previous !== mask()) stone.needsUpdate = true;
}

// facadeMaterial vira a pedra (slot 0, recebe a cor do edifício);
// topMaterial segue o concreto global dos telhados, sem ajuste.
export function createResidentialBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  clearTextureSlots(facadeMaterial);
  if (facadeMaterial instanceof THREE.MeshStandardMaterial) {
    if (facadeMaterial instanceof THREE.MeshPhysicalMaterial) facadeMaterial.clearcoat = 0;
    facadeMaterial.color.set(STONE_COLOR);
    facadeMaterial.normalScale.set(0.6, 0.6);
    facadeMaterial.roughness = 1;
    facadeMaterial.metalness = 0;
    facadeMaterial.envMapIntensity = 1;
    facadeMaterial.userData.authoredEnvMapIntensity = 1;
  }
  if (facadeMaterial.userData.tilingMultiplier) {
    facadeMaterial.userData.tilingMultiplier.value = STONE_TILING;
  }

  // Vidros e metal com metalness alto: o ambient forte não os deixa leitosos;
  // cor = tinta do reflexo. Vidro guarda 10% de difuso → sem preto chapado
  // onde o reflexo pega o zênite escuro do HDRI.
  const envMap =
    facadeMaterial instanceof THREE.MeshStandardMaterial ? facadeMaterial.envMap : null;
  const materials: THREE.Material[] = [
    facadeMaterial,
    topMaterial,
    createSceneMaterial(envMap, {
      color: 0x7f949b,
      roughness: 0.05,
      metalness: 0.9,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: 0x7d9a93,
      roughness: 0.04,
      metalness: 1,
      envMapIntensity: 1,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
    createSceneMaterial(envMap, {
      color: 0x3b3f42,
      roughness: 0.4,
      metalness: 0.8,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: 0x5a2c1a,
      roughness: 0.8,
      metalness: 0,
      envMapIntensity: 1,
    }),
  ];

  return new THREE.Mesh(
    getResidentialGeometry(getResidentialFloorCount(DEFAULT_HEIGHT)),
    materials,
  );
}

export function disposeResidentialBuildingSharedResources(): void {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
}
