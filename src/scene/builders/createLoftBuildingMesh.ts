import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clearTextureSlots } from "./createEmpireBuildingMesh";
import {
  createSceneMaterial,
  type ResidentialTierFootprint,
} from "./createResidentialBuildingMesh";

// Loftifício (ref. loft.png): torre de reboco bege com faixas verticais de
// pastilha verde recuadas entre pilastras (canto em L + central em cada face),
// janelas de alumínio em coluna, pilotis aberto com portaria e muretas sobre
// térreo de garagem (muro de pastilha + portões verde-escuros, marquise na
// porta da frente), platibanda, casa de máquinas, caixa d'água e 2 casinhas.
//
// Medidas em metros; lote 20×20 m = unit box em X/Z. Grade única: pilastra →
// pilar do pilotis; faixa verde → vão de portão. Nº de andares sai da altura
// na cena (mesmo esquema do residential). Sem textura: detalhe em geometria.

type Range = [number, number];
type Axis = "x" | "z";
type WindowKind = { w: number; y0: number; y1: number; mullion: boolean };

// Slots de material — ordem = índice do grupo na geometria.
const SLOT = { plaster: 0, roof: 1, glass: 2, frame: 3, tile: 4, gate: 5 } as const;
const SLOT_COUNT = 6;

const WORLD_UNITS_PER_METER = 0.1;
const HALF = 10;
const FACE = 9.9; // face das pilastras e da platibanda
const TILE = 9.4; // faixa verde 50 cm recuada
const WALL = 9.6; // muro do térreo, atrás dos pilares
const LEDGE = 9.95; // cornija entre térreo e pilotis, 5 cm além dos pilares
// Faixas verdes (meio vão, espelhado): frente/fundos em x, laterais em z.
const FRONT_BAND: Range = [1.6, 5.8];
const SIDE_BAND: Range = [2.6, 6.4];
const COLUMN = 0.3; // meio pilar
const GATE_H = 3;
const LEDGE_T = 0.3;
const PILOTIS_H = 3.8;
const BEAM = 0.5; // viga de transição sob a torre
const BASE_H = GATE_H + PILOTIS_H;
const FLOOR_H = 2.9;
const SPANDREL = 0.6; // bege acima da última janela
const PARAPET_H = 1.2;
const PARAPET_T = 0.25;
const DECK_LIFT = 0.05;
const HOUSE: Range = [5.6, 3]; // meia planta da casa de máquinas (x, z)
const HOUSE_H = 3.4;
const TANK = 2.4; // meia planta da caixa d'água central (topo do mesh)
const TANK_H = 6;
const CAP_T = 0.2;
const ROOF_EXTRA = TANK_H + CAP_T;
const MAX_FLOORS = 60;
// Prévia do admin: lote 1 × altura 3 = lote 2 × altura 6 na cena.
const DEFAULT_HEIGHT = 6;

// Calibrado na luz da cena (ambient ~8 + exposição 1.45): tom claro estoura.
// Bege × mapa de concreto do topo (média ×0,54) lê bege claro; sem textura
// (render-building, texturas desligadas) sai quase branco.
const PLASTER_COLOR = 0xd3c4a8;
const PLASTER_TILING = 6;
const TILE_COLOR = 0x47534a; // pastilha verde-sálvia
const GATE_COLOR = 0x1c3a34; // portão verde-escuro
const GLASS_COLOR = 0x6f8394; // leve tom azul/cinza
const FRAME_COLOR = 0xb4b8bb; // alumínio acetinado

// Janela de 2 folhas (sala), quadrada (quarto) e basculante (banheiro).
const LARGE: WindowKind = { w: 1.7, y0: 0.9, y1: 2.1, mullion: true };
const SQUARE: WindowKind = { w: 1, y0: 0.9, y1: 2.1, mullion: false };
const NARROW: WindowKind = { w: 0.6, y0: 1.4, y1: 2.1, mullion: false };
// [posição ao longo da face (espelhada se ≠ 0), na faixa verde?, tipo]
const FRONT_WINDOWS: Array<[number, boolean, WindowKind]> = [
  [7.85, false, SQUARE], [4.6, true, LARGE], [2.6, true, SQUARE], [0, false, NARROW],
];
const SIDE_WINDOWS: Array<[number, boolean, WindowKind]> = [
  [8.15, false, SQUARE], [5.2, true, LARGE], [3.4, true, SQUARE], [0, false, SQUARE],
];
// Pilares do pilotis (meio vão, espelhados) sob as pilastras.
const FRONT_COLUMNS = [1.3, 6.1];
const SIDE_COLUMNS = [2.3, 6.7];

// Acessório de topo assenta na caixa d'água central: escala pelo lado dela.
export const LOFT_ROOFTOP_SCALE = TANK / HALF;

const geometryCache = new Map<number, THREE.BufferGeometry>();

const span = (a: number, b: number): Range => (a < b ? [a, b] : [b, a]);
const mirror = (u: number) => (u === 0 ? [0] : [-u, u]);

export function getLoftFloorCount(height: number): number {
  const floors = Math.round(
    (height / WORLD_UNITS_PER_METER - BASE_H - ROOF_EXTRA) / FLOOR_H,
  );
  return Math.max(1, Math.min(MAX_FLOORS, floors));
}

function getLevels(floors: number) {
  const roof = BASE_H + floors * FLOOR_H; // topo da torre = base da platibanda
  return { roof, total: roof + ROOF_EXTRA };
}

function buildLoftGeometry(floors: number): THREE.BufferGeometry {
  const { roof, total } = getLevels(floors);
  const slots: THREE.BufferGeometry[][] = Array.from({ length: SLOT_COUNT }, () => []);

  // Tudo em metros e não indexado; a escala pra unit box acontece uma vez no fim.
  const push = (slot: number, geometry: THREE.BufferGeometry) => {
    slots[slot].push(geometry.toNonIndexed());
    geometry.dispose();
  };
  const box = (slot: number, [x0, x1]: Range, [y0, y1]: Range, [z0, z1]: Range) => {
    const geometry = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    geometry.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    push(slot, geometry);
  };
  // Quad voltado para fora da face em `at` (sinal = lado): sem as 5 faces escondidas de uma caixa.
  const quad = (slot: number, axis: Axis, at: number, [u0, u1]: Range, [y0, y1]: Range) => {
    const geometry = new THREE.PlaneGeometry(u1 - u0, y1 - y0);
    geometry.rotateY(axis === "x" ? (Math.sign(at) * Math.PI) / 2 : at < 0 ? Math.PI : 0);
    const u = (u0 + u1) / 2;
    geometry.translate(axis === "x" ? at : u, (y0 + y1) / 2, axis === "x" ? u : at);
    push(slot, geometry);
  };
  // Caixa no lado `s` de uma face: `depth` ao longo da normal, `u` ao longo da face.
  const faceBox = (slot: number, axis: Axis, s: number, depth: Range, u: Range, y: Range) => {
    const d = span(s * depth[0], s * depth[1]);
    if (axis === "x") box(slot, d, y, u);
    else box(slot, u, y, d);
  };
  // Caixilho + vidro 2 cm à frente + montante central da janela de 2 folhas.
  const windowAt = (axis: Axis, face: number, u: number, floorY: number, kind: WindowKind) => {
    const s = Math.sign(face);
    const half = kind.w / 2;
    const y: Range = [floorY + kind.y0, floorY + kind.y1];
    const inner: Range = [y[0] + 0.08, y[1] - 0.08];
    quad(SLOT.frame, axis, face + s * 0.02, [u - half, u + half], y);
    quad(SLOT.glass, axis, face + s * 0.04, [u - half + 0.08, u + half - 0.08], inner);
    if (kind.mullion) quad(SLOT.frame, axis, face + s * 0.06, [u - 0.03, u + 0.03], inner);
  };

  const sides = [-1, 1];
  const faces: Array<[Axis, number]> = [["z", 1], ["z", -1], ["x", 1], ["x", -1]];
  const towerY: Range = [BASE_H, roof - SPANDREL];

  // --- Térreo: muro de pastilha, portões nos vãos das faixas, cornija bege ---
  box(SLOT.tile, [-WALL, WALL], [0, GATE_H - LEDGE_T], [-WALL, WALL]);
  box(SLOT.plaster, [-LEDGE, LEDGE], [GATE_H - LEDGE_T, GATE_H], [-LEDGE, LEDGE]);
  // Piso do pilotis em concreto: sem sombra na cena, piso bege fecharia o vão.
  const floor = new THREE.PlaneGeometry(2 * FACE, 2 * FACE);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, GATE_H + DECK_LIFT, 0);
  push(SLOT.roof, floor);
  for (const [axis, s] of faces) {
    const [b0, b1] = axis === "z" ? FRONT_BAND : SIDE_BAND;
    for (const u of sides) quad(SLOT.gate, axis, s * (WALL + 0.02), span(u * (b0 + 0.2), u * (b1 - 0.2)), [0, 2.5]);
  }
  // Porta de pedestre + marquise de vidro (só na frente).
  quad(SLOT.gate, "z", WALL + 0.02, [-0.6, 0.6], [0, 2.3]);
  box(SLOT.glass, [-0.95, 0.95], [2.5, 2.56], [WALL, 9.94]); // termina no caixilho: sem face coplanar
  box(SLOT.frame, [-0.95, 0.95], [2.46, 2.56], [9.94, 9.98]);

  // --- Pilotis aberto: pilares sob as pilastras, portaria verde envidraçada ---
  const columnY: Range = [0, BASE_H - BEAM];
  for (const x of sides) {
    for (const z of sides) {
      box(SLOT.plaster, span(x * (FACE - 2 * COLUMN), x * FACE), columnY, span(z * (FACE - 2 * COLUMN), z * FACE));
    }
  }
  for (const [axis, s] of faces) {
    const columns = axis === "z" ? FRONT_COLUMNS : SIDE_COLUMNS;
    for (const u of sides) {
      for (const c of columns) faceBox(SLOT.plaster, axis, s, [FACE - 2 * COLUMN, FACE], span(u * (c - COLUMN), u * (c + COLUMN)), columnY);
    }
  }
  box(SLOT.tile, [-4, 4], [GATE_H, BASE_H - BEAM], [-3, 3]);
  quad(SLOT.frame, "z", 3.02, [-1.3, 1.3], [GATE_H, GATE_H + 2.4]);
  quad(SLOT.glass, "z", 3.04, [-1.2, 1.2], [GATE_H, GATE_H + 2.3]);
  quad(SLOT.frame, "z", 3.06, [-0.03, 0.03], [GATE_H, GATE_H + 2.3]);
  box(SLOT.plaster, [-FACE, FACE], [BASE_H - BEAM, BASE_H], [-FACE, FACE]);

  // --- Torre: núcleo de pastilha + pilastras bege (cantos em L e centrais) ---
  box(SLOT.tile, [-TILE, TILE], towerY, [-TILE, TILE]);
  for (const x of sides) {
    for (const z of sides) {
      box(SLOT.plaster, span(x * FRONT_BAND[1], x * FACE), towerY, span(z * SIDE_BAND[1], z * FACE));
    }
  }
  for (const [axis, s] of faces) {
    const b0 = axis === "z" ? FRONT_BAND[0] : SIDE_BAND[0];
    faceBox(SLOT.plaster, axis, s, [TILE - 0.1, FACE], [-b0, b0], towerY);
  }
  box(SLOT.plaster, [-FACE, FACE], [roof - SPANDREL, roof], [-FACE, FACE]);

  for (let f = 0; f < floors; f++) {
    const y = BASE_H + f * FLOOR_H;
    for (const [axis, s] of faces) {
      for (const [at, onTile, kind] of axis === "z" ? FRONT_WINDOWS : SIDE_WINDOWS) {
        for (const u of mirror(at)) windowAt(axis, s * (onTile ? TILE : FACE), u, y, kind);
      }
    }
  }

  // --- Cobertura: platibanda, piso, casa de máquinas, caixa d'água, casinhas ---
  const parapetY: Range = [roof, roof + PARAPET_H];
  for (const s of sides) {
    box(SLOT.plaster, [-FACE, FACE], parapetY, span(s * (FACE - PARAPET_T), s * FACE));
    box(SLOT.plaster, span(s * (FACE - PARAPET_T), s * FACE), parapetY, [-FACE + PARAPET_T, FACE - PARAPET_T]);
  }
  const inner = FACE - PARAPET_T;
  const deck = new THREE.PlaneGeometry(2 * inner, 2 * inner);
  deck.rotateX(-Math.PI / 2);
  deck.translate(0, roof + DECK_LIFT, 0);
  push(SLOT.roof, deck);

  const roofBox = ([x0, x1]: Range, [z0, z1]: Range, h: number) => {
    box(SLOT.plaster, [x0, x1], [roof, roof + h], [z0, z1]);
    box(SLOT.roof, [x0 - 0.15, x1 + 0.15], [roof + h, roof + h + CAP_T], [z0 - 0.15, z1 + 0.15]);
  };
  const [hx, hz] = HOUSE;
  roofBox([-hx, hx], [-hz, hz], HOUSE_H);
  roofBox([-TANK, TANK], [-TANK, TANK], TANK_H);
  quad(SLOT.frame, "z", hz + 0.02, [-4.8, -3.8], [roof + DECK_LIFT, roof + 2.2]);
  roofBox([-8.8, -6.8], [-8.8, -7], 2);
  roofBox([6.6, 8.8], [6.4, 8.6], 1.8);
  quad(SLOT.frame, "x", 8.8 + 0.02, [7, 7.9], [roof + DECK_LIFT, roof + 1.6]);

  // Compila por slot: 1 grupo (= 1 draw call) por material.
  const perSlot = slots.map((list) => {
    const merged = mergeGeometries(list, false);
    for (const geometry of list) geometry.dispose();
    return merged;
  });
  const geometry = mergeGeometries(perSlot, true);
  for (const part of perSlot) part.dispose();
  // Metros → unit box centrada.
  geometry.scale(1 / (2 * HALF), 1 / total, 1 / (2 * HALF));
  geometry.translate(0, -0.5, 0);

  // Shader triplanar da fachada lê aProjPosition/aProjNormal.
  geometry.setAttribute("aProjPosition", geometry.getAttribute("position").clone());
  geometry.setAttribute("aProjNormal", geometry.getAttribute("normal").clone());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function getLoftGeometry(floors: number): THREE.BufferGeometry {
  let geometry = geometryCache.get(floors);
  if (!geometry) {
    geometry = buildLoftGeometry(floors);
    geometryCache.set(floors, geometry);
  }
  return geometry;
}

// Mantém o pé-direito real quando a altura do edifício muda.
export function setLoftBuildingHeight(mesh: THREE.Mesh, height: number): void {
  const geometry = getLoftGeometry(getLoftFloorCount(height));
  if (mesh.geometry !== geometry) mesh.geometry = geometry;
}

// Tiers para o LED de arestas: corpo até a platibanda + caixa d'água.
export function getLoftTierFootprints(
  width = 1,
  depth = 1,
  height = 1,
): ResidentialTierFootprint[] {
  const { roof, total } = getLevels(getLoftFloorCount(height));
  const toWorld = (y: number) => (y / total) * height;
  return [
    { bottomY: 0, topY: toWorld(roof + PARAPET_H), width, depth },
    {
      bottomY: toWorld(roof),
      topY: height,
      width: width * LOFT_ROOFTOP_SCALE,
      depth: depth * LOFT_ROOFTOP_SCALE,
    },
  ];
}

// Y (relativo ao centro do edifício) do topo da platibanda — letreiro apoia aqui.
export function getLoftRoofOffset(height: number): number {
  const { roof, total } = getLevels(getLoftFloorCount(height));
  return ((roof + PARAPET_H) / total - 0.5) * height;
}

// facadeMaterial vira o reboco bege (slot 0, recebe a cor do edifício e a
// textura via setResidentialStoneMaps); topMaterial = concreto global.
// Pastilha verde e portões ficam nos slots 4 e 5, sem cor.
export function createLoftBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  clearTextureSlots(facadeMaterial);
  if (facadeMaterial instanceof THREE.MeshStandardMaterial) {
    if (facadeMaterial instanceof THREE.MeshPhysicalMaterial) facadeMaterial.clearcoat = 0;
    facadeMaterial.color.set(PLASTER_COLOR);
    facadeMaterial.normalScale.set(0.35, 0.35); // pintura fosca: só a microtextura
    facadeMaterial.roughness = 1;
    facadeMaterial.metalness = 0;
    facadeMaterial.envMapIntensity = 1;
    facadeMaterial.userData.authoredEnvMapIntensity = 1;
  }
  if (facadeMaterial.userData.tilingMultiplier) {
    facadeMaterial.userData.tilingMultiplier.value = PLASTER_TILING;
  }

  // Vidro reflete a cidade; alumínio, pastilha e portão acetinados.
  const envMap =
    facadeMaterial instanceof THREE.MeshStandardMaterial ? facadeMaterial.envMap : null;
  const materials: THREE.Material[] = [
    facadeMaterial,
    topMaterial,
    createSceneMaterial(envMap, {
      color: GLASS_COLOR,
      roughness: 0.08,
      metalness: 0.85,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: FRAME_COLOR,
      roughness: 0.35,
      metalness: 0.7,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: TILE_COLOR,
      roughness: 0.45,
      metalness: 0,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: GATE_COLOR,
      roughness: 0.45,
      metalness: 0.3,
      envMapIntensity: 1,
    }),
  ];

  return new THREE.Mesh(
    getLoftGeometry(getLoftFloorCount(DEFAULT_HEIGHT)),
    materials,
  );
}

export function disposeLoftBuildingSharedResources(): void {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
}
