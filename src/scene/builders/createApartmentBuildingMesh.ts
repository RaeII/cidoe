import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clearTextureSlots } from "./createEmpireBuildingMesh";
import {
  createSceneMaterial,
  type ResidentialTierFootprint,
} from "./createResidentialBuildingMesh";

// Torre residencial de reboco branco (ref. edificio.png): janelas recortadas em
// grade, rasgo de sacadas com guarda-corpo de vidro na frente (+Z) e nos fundos
// (−Z), pilastra saliente ao lado do rasgo, degrau nos 4 cantos, térreo recuado,
// platibanda e caixa d'água + casa de máquinas na cobertura.
//
// Medidas em metros; footprint 20×20 m = unit box em X/Z. Planta espelhada
// frente/fundos. Nº de andares sai da altura na cena (mesmo esquema do
// residential). Sem textura de fachada: detalhe em geometria + 6 slots autorais.

type Range = [number, number];
type Axis = "x" | "z";
type WindowKind = { w: number; y0: number; y1: number; mullion: boolean };

// Slots de material — ordem = índice do grupo na geometria.
const SLOT = { plaster: 0, roof: 1, glass: 2, railing: 3, frame: 4, trim: 5 } as const;
const SLOT_COUNT = 6;

const WORLD_UNITS_PER_METER = 0.1;
const HALF = 10;
const SIDE = 9.85; // face lateral (±X): peitoril de 12 cm ainda cabe no lote
const FACE = 9.7; // fachada frente/fundos
const PILASTER = 10; // pilastra 30 cm saliente ao lado do rasgo
const NOTCH = 0.6; // degrau nos 4 cantos
const WING = SIDE - NOTCH; // fachada frente/fundos termina no degrau
const SIDE_END = FACE - NOTCH; // lateral termina no degrau
const SLOT_X: Range = [-5.4, -0.4]; // rasgo das sacadas
const PILASTER_X: Range = [SLOT_X[1], 2.6];
const SLOT_BACK = 7.2; // parede do fundo da sacada → sacada de 2,4 m
const FLOOR_H = 3;
const GROUND_H = 4;
const PLINTH_INSET = 0.3;
const SLAB_T = 0.15;
const RAIL_H = 1.05;
const PARAPET_H = 1.2;
const PARAPET_T = 0.2;
const DECK_LIFT = 0.08; // piso da cobertura acima do topo do corpo (sem z-fight)
const TANK_W = 7;
const TANK_D = 6;
const TANK_H = 4;
const CAP_T = 0.2;
const ROOF_EXTRA = TANK_H + CAP_T;
const MAX_FLOORS = 60;
// Altura do preview do admin (VIEW.shape em createPreviewScene).
const DEFAULT_HEIGHT = 3;

// Mesma calibração do residential (ambient ~8 + exposição 1.45): branco puro
// estoura; off-white quente × mapa de concreto lê como reboco pintado.
const PLASTER_COLOR = 0xd9d6d0;
const PLASTER_TILING = 6;

// Janela de sala/quarto (correr, montante central) e de banheiro (alta, pequena).
const LARGE: WindowKind = { w: 1.5, y0: 0.9, y1: 2.3, mullion: true };
const SMALL: WindowKind = { w: 0.7, y0: 1.6, y1: 2.3, mullion: false };
const SIDE_WINDOWS: Array<[number, WindowKind]> = [
  [-6.6, LARGE], [-4, SMALL], [-1.4, LARGE], [1.4, LARGE], [4, SMALL], [6.6, LARGE],
];
const FRONT_WINDOWS: Array<[number, WindowKind]> = [
  [-7.3, LARGE], [4.3, LARGE], [6.2, SMALL], [8, LARGE],
];

// Contorno da torre (x, z), meia planta da frente; fundos = espelho em Z.
const FRONT_OUTLINE: Array<[number, number]> = [
  [SIDE, SIDE_END], [WING, SIDE_END], [WING, FACE],
  [PILASTER_X[1], FACE], [PILASTER_X[1], PILASTER], [PILASTER_X[0], PILASTER],
  [SLOT_X[1], SLOT_BACK], [SLOT_X[0], SLOT_BACK], [SLOT_X[0], FACE],
  [-WING, FACE], [-WING, SIDE_END], [-SIDE, SIDE_END],
];
const OUTLINE = [
  ...FRONT_OUTLINE,
  ...FRONT_OUTLINE.map(([x, z]): [number, number] => [x, -z]).reverse(),
];

// Acessório de topo assenta na caixa d'água: escala pelo menor lado dela.
export const APARTMENT_ROOFTOP_SCALE = Math.min(TANK_W, TANK_D) / (2 * HALF);

const geometryCache = new Map<number, THREE.BufferGeometry>();

const span = (a: number, b: number): Range => (a < b ? [a, b] : [b, a]);

// Contorno retilíneo recuado `t` para dentro: cada vértice anda t na normal
// interna das duas arestas vizinhas (exato em ângulos de 90°).
function insetOutline(points: Array<[number, number]>, t: number): Array<[number, number]> {
  const n = points.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[(i + 1) % n];
    area += x0 * z1 - x1 * z0;
  }
  const inward = ([x0, z0]: [number, number], [x1, z1]: [number, number]) => {
    const length = Math.hypot(x1 - x0, z1 - z0);
    return [(-(z1 - z0) / length) * Math.sign(area), ((x1 - x0) / length) * Math.sign(area)];
  };
  return points.map((point, i) => {
    const before = inward(points[(i - 1 + n) % n], point);
    const after = inward(point, points[(i + 1) % n]);
    return [point[0] + t * (before[0] + after[0]), point[1] + t * (before[1] + after[1])];
  });
}

// Shape no plano XY que, após rotateX(−π/2), cai no plano XZ com o mesmo (x, z).
const toShapePoints = (points: Array<[number, number]>) =>
  points.map(([x, z]) => new THREE.Vector2(x, -z));

export function getApartmentFloorCount(height: number): number {
  const floors = Math.round(
    (height / WORLD_UNITS_PER_METER - GROUND_H - ROOF_EXTRA) / FLOOR_H,
  );
  return Math.max(1, Math.min(MAX_FLOORS, floors));
}

function getLevels(floors: number) {
  const roof = GROUND_H + floors * FLOOR_H; // topo do corpo = base da platibanda
  return { roof, total: roof + ROOF_EXTRA };
}

function buildApartmentGeometry(floors: number): THREE.BufferGeometry {
  const { roof, total } = getLevels(floors);
  const slots: THREE.BufferGeometry[][] = Array.from({ length: SLOT_COUNT }, () => []);

  // Tudo em metros e não indexado (Extrude não tem índice); a escala pra unit
  // box acontece uma vez no fim.
  const push = (slot: number, geometry: THREE.BufferGeometry) => {
    if (!geometry.index) {
      slots[slot].push(geometry);
      return;
    }
    slots[slot].push(geometry.toNonIndexed());
    geometry.dispose();
  };
  const box = (slot: number, [x0, x1]: Range, [y0, y1]: Range, [z0, z1]: Range) => {
    const geometry = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    geometry.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    push(slot, geometry);
  };
  // Quad voltado para fora da face em `at` (sinal = lado): janela sem as 5 faces
  // escondidas de uma caixa.
  const quad = (slot: number, axis: Axis, at: number, [u0, u1]: Range, [y0, y1]: Range) => {
    const geometry = new THREE.PlaneGeometry(u1 - u0, y1 - y0);
    geometry.rotateY(axis === "x" ? (Math.sign(at) * Math.PI) / 2 : at < 0 ? Math.PI : 0);
    const u = (u0 + u1) / 2;
    geometry.translate(axis === "x" ? at : u, (y0 + y1) / 2, axis === "x" ? u : at);
    push(slot, geometry);
  };
  // Quad horizontal voltado pra cima, colado numa face: `depth` ao longo da normal.
  const ledge = (slot: number, axis: Axis, depth: Range, u: Range, y: number) => {
    const [[x0, x1], [z0, z1]] = axis === "x" ? [depth, u] : [u, depth];
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    push(slot, geometry);
  };
  // Caixilho + vidro (3 cm à frente) + montante + peitoril saliente.
  const windowAt = (axis: Axis, face: number, u: number, floorY: number, kind: WindowKind) => {
    const s = Math.sign(face);
    const half = kind.w / 2;
    const y: Range = [floorY + kind.y0, floorY + kind.y1];
    const inner: Range = [y[0] + 0.07, y[1] - 0.07];
    quad(SLOT.frame, axis, face + s * 0.02, [u - half, u + half], y);
    quad(SLOT.glass, axis, face + s * 0.05, [u - half + 0.07, u + half - 0.07], inner);
    if (kind.mullion) quad(SLOT.frame, axis, face + s * 0.07, [u - 0.03, u + 0.03], inner);
    // Peitoril: só tampo + testa (demais faces encostam na parede ou ficam embaixo).
    const sill: Range = [u - half - 0.1, u + half + 0.1];
    quad(SLOT.trim, axis, face + s * 0.12, sill, [y[0] - 0.06, y[0]]);
    ledge(SLOT.trim, axis, span(face, face + s * 0.12), sill, y[0]);
  };

  const sides = [-1, 1];

  // --- Térreo: embasamento recuado, entrada envidraçada, portão nos fundos ---
  const plinthX = SIDE - PLINTH_INSET;
  const plinthZ = FACE - PLINTH_INSET;
  box(SLOT.trim, [-plinthX, plinthX], [0, GROUND_H], [-plinthZ, plinthZ]);
  const doorX: Range = [SLOT_X[0] + 0.4, SLOT_X[1] - 0.4];
  quad(SLOT.frame, "z", plinthZ + 0.02, doorX, [0, 2.7]);
  quad(SLOT.glass, "z", plinthZ + 0.05, [doorX[0] + 0.08, doorX[1] - 0.08], [0, 2.62]);
  quad(SLOT.frame, "z", -plinthZ - 0.02, doorX, [0, 2.5]);
  for (const s of sides) {
    for (const z of [-4, 4]) {
      quad(SLOT.glass, "x", s * (plinthX + 0.02), [z - 0.6, z + 0.6], [2.2, 3]);
    }
  }

  // --- Corpo extrudado do contorno (reboco) ---
  const body = new THREE.ExtrudeGeometry(new THREE.Shape(toShapePoints(OUTLINE)), {
    depth: roof - GROUND_H,
    bevelEnabled: false,
    steps: 1,
  });
  body.rotateX(-Math.PI / 2);
  body.translate(0, GROUND_H, 0);
  push(SLOT.plaster, body);

  // --- Andares: janelas nas 4 faces + sacada no rasgo (frente e fundos) ---
  const doorWallX: Range = [SLOT_X[0] + 0.7, SLOT_X[1] - 0.7];
  const doorMid = (SLOT_X[0] + SLOT_X[1]) / 2;
  for (let f = 0; f <= floors; f++) {
    const y = GROUND_H + f * FLOOR_H;
    for (const s of sides) {
      // Laje da sacada; em f = floors fecha o rasgo na cobertura.
      box(SLOT.trim, SLOT_X, [y, y + SLAB_T], span(s * SLOT_BACK, s * (FACE - 0.1)));
    }
    if (f === floors) break;

    for (const s of sides) {
      for (const [z, kind] of SIDE_WINDOWS) windowAt("x", s * SIDE, z, y, kind);
      for (const [x, kind] of FRONT_WINDOWS) windowAt("z", s * FACE, x, y, kind);

      const railY: Range = [y + SLAB_T, y + SLAB_T + RAIL_H];
      box(SLOT.railing, [SLOT_X[0] + 0.1, SLOT_X[1] - 0.1], railY, span(s * 9.5, s * 9.55));
      box(SLOT.frame, SLOT_X, [railY[1], railY[1] + 0.06], span(s * 9.46, s * 9.59));
      // Porta de correr da sala no fundo da sacada.
      const doorY: Range = [y + SLAB_T, y + 2.45];
      quad(SLOT.frame, "z", s * (SLOT_BACK + 0.02), doorWallX, doorY);
      quad(SLOT.glass, "z", s * (SLOT_BACK + 0.05),
        [doorWallX[0] + 0.08, doorWallX[1] - 0.08], [doorY[0] + 0.08, doorY[1] - 0.08]);
      quad(SLOT.frame, "z", s * (SLOT_BACK + 0.07), [doorMid - 0.03, doorMid + 0.03], doorY);
    }
  }

  // --- Cobertura: platibanda, piso, caixa d'água e casa de máquinas ---
  const inner = insetOutline(OUTLINE, PARAPET_T);
  const parapetShape = new THREE.Shape(toShapePoints(OUTLINE));
  parapetShape.holes.push(new THREE.Path(toShapePoints(inner)));
  const parapet = new THREE.ExtrudeGeometry(parapetShape, {
    depth: PARAPET_H,
    bevelEnabled: false,
    steps: 1,
  });
  parapet.rotateX(-Math.PI / 2);
  parapet.translate(0, roof, 0);
  push(SLOT.plaster, parapet);

  const deck = new THREE.ShapeGeometry(new THREE.Shape(toShapePoints(inner)));
  deck.rotateX(-Math.PI / 2);
  deck.translate(0, roof + DECK_LIFT, 0);
  push(SLOT.roof, deck);

  const tw = TANK_W / 2;
  const td = TANK_D / 2;
  const tankTop = roof + TANK_H;
  box(SLOT.plaster, [-tw, tw], [roof, tankTop], [-td, td]);
  box(SLOT.roof, [-tw - 0.15, tw + 0.15], [tankTop, tankTop + CAP_T], [-td - 0.15, td + 0.15]);
  quad(SLOT.frame, "z", td + 0.02, [-0.5, 0.5], [roof + DECK_LIFT, roof + 2.2]);
  box(SLOT.plaster, [3.8, 6.6], [roof, roof + 2.6], [-1.5, 1.5]);
  box(SLOT.roof, [3.65, 6.75], [roof + 2.6, roof + 2.75], [-1.65, 1.65]);
  quad(SLOT.frame, "z", 1.52, [4.7, 5.7], [roof + DECK_LIFT, roof + 2.2]);

  // Compila por slot: 1 grupo (= 1 draw call) por material.
  const perSlot = slots.map((list) => {
    const merged = mergeGeometries(list, false);
    for (const geometry of list) geometry.dispose();
    return merged;
  });
  const geometry = mergeGeometries(perSlot, true);
  for (const part of perSlot) part.dispose();
  // Metros → unit box centrada (todas as faces são alinhadas aos eixos).
  geometry.scale(1 / (2 * HALF), 1 / total, 1 / (2 * HALF));
  geometry.translate(0, -0.5, 0);

  // Shader triplanar da fachada lê aProjPosition/aProjNormal.
  geometry.setAttribute("aProjPosition", geometry.getAttribute("position").clone());
  geometry.setAttribute("aProjNormal", geometry.getAttribute("normal").clone());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function getApartmentGeometry(floors: number): THREE.BufferGeometry {
  let geometry = geometryCache.get(floors);
  if (!geometry) {
    geometry = buildApartmentGeometry(floors);
    geometryCache.set(floors, geometry);
  }
  return geometry;
}

// Mantém o pé-direito real quando a altura do edifício muda.
export function setApartmentBuildingHeight(mesh: THREE.Mesh, height: number): void {
  const geometry = getApartmentGeometry(getApartmentFloorCount(height));
  if (mesh.geometry !== geometry) mesh.geometry = geometry;
}

// Tiers para o LED de arestas: corpo até a platibanda + caixa d'água.
export function getApartmentTierFootprints(
  width = 1,
  depth = 1,
  height = 1,
): ResidentialTierFootprint[] {
  const { roof, total } = getLevels(getApartmentFloorCount(height));
  const toWorld = (y: number) => (y / total) * height;
  return [
    { bottomY: 0, topY: toWorld(roof + PARAPET_H), width, depth },
    {
      bottomY: toWorld(roof),
      topY: height,
      width: (width * TANK_W) / (2 * HALF),
      depth: (depth * TANK_D) / (2 * HALF),
    },
  ];
}

// Y (relativo ao centro do edifício) do topo da platibanda — letreiro apoia aqui.
export function getApartmentRoofOffset(height: number): number {
  const { roof, total } = getLevels(getApartmentFloorCount(height));
  return ((roof + PARAPET_H) / total - 0.5) * height;
}

// facadeMaterial vira o reboco (slot 0, recebe a cor do edifício e a textura de
// superfície via setResidentialStoneMaps); topMaterial = concreto global.
export function createApartmentBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  clearTextureSlots(facadeMaterial);
  if (facadeMaterial instanceof THREE.MeshStandardMaterial) {
    if (facadeMaterial instanceof THREE.MeshPhysicalMaterial) facadeMaterial.clearcoat = 0;
    facadeMaterial.color.set(PLASTER_COLOR);
    facadeMaterial.normalScale.set(0.35, 0.35); // reboco liso: só o grão do concreto
    facadeMaterial.roughness = 1;
    facadeMaterial.metalness = 0;
    facadeMaterial.envMapIntensity = 1;
    facadeMaterial.userData.authoredEnvMapIntensity = 1;
  }
  if (facadeMaterial.userData.tilingMultiplier) {
    facadeMaterial.userData.tilingMultiplier.value = PLASTER_TILING;
  }

  // Vidro escuro reflete a cidade; guarda-corpo esverdeado translúcido.
  const envMap =
    facadeMaterial instanceof THREE.MeshStandardMaterial ? facadeMaterial.envMap : null;
  const materials: THREE.Material[] = [
    facadeMaterial,
    topMaterial,
    createSceneMaterial(envMap, {
      color: 0x55646b,
      roughness: 0.06,
      metalness: 0.9,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: 0x9bb6ae,
      roughness: 0.04,
      metalness: 1,
      envMapIntensity: 1,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
    createSceneMaterial(envMap, {
      color: 0x8b9195,
      roughness: 0.4,
      metalness: 0.7,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: 0xa9aaa7,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 1,
    }),
  ];

  return new THREE.Mesh(
    getApartmentGeometry(getApartmentFloorCount(DEFAULT_HEIGHT)),
    materials,
  );
}

export function disposeApartmentBuildingSharedResources(): void {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
}
