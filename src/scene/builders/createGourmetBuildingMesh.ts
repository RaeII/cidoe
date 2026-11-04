import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clearTextureSlots } from "./createEmpireBuildingMesh";
import {
  createSceneMaterial,
  type ResidentialTierFootprint,
} from "./createResidentialBuildingMesh";

// Varanda Gourmet (ref. residencial.png): torre bege e creme com pilha de
// sacadas curvas na frente (+Z) — laje branca, guarda-corpo de vidro, pano de
// vidro curvo recuado —, pilastras creme nos cantos da frente, pilastras bege
// salientes com rasgo nas laterais e nos fundos, janelas quadradas em coluna,
// embasamento creme e caixa d'água + 2 casas de máquinas na cobertura.
//
// Medidas em metros; lote 20×20 m = unit box em X/Z, torre 17,2 m sobre
// embasamento do lote todo. Nº de andares sai da altura na cena (mesmo esquema
// do residential). Sem textura de fachada: detalhe em geometria + 6 slots.

type Range = [number, number];
type Point = [number, number];
type Axis = "x" | "z";
type WindowKind = { w: number; y0: number; y1: number };

// Slots de material — ordem = índice do grupo na geometria.
const SLOT = { paint: 0, roof: 1, glass: 2, railing: 3, frame: 4, cream: 5 } as const;
const SLOT_COUNT = 6;

const WORLD_UNITS_PER_METER = 0.1;
const HALF = 10;
const PLINTH = 9.92; // embasamento: portaria saliente ainda cabe no lote
const TOWER = 8.6; // meia planta da torre
const PILASTER_OUT = 0.6; // pilastra bege saliente
const BAY = 5.6; // meio vão das sacadas → pilastra creme de 3 m em cada canto
const SAG = 1.2; // flecha da curva além da face
const BALCONY_D = 2; // vidro recuado atrás da borda da sacada
const ARC_R = (BAY * BAY + SAG * SAG) / (2 * SAG); // arco passa por (±BAY, TOWER)
const ARC_Z = TOWER + SAG - ARC_R; // centro do arco
const CHORD_Z = TOWER - BALCONY_D - 0.1; // laje e núcleo terminam atrás do vidro
const ARC_SEGMENTS = 16;
const PLINTH_H = 3.2;
const FLOOR_H = 3;
const SLAB_T = 0.35;
const RAIL_H = 1.05;
const PARAPET_H = 1.1;
const PARAPET_T = 0.25;
const DECK_LIFT = 0.08; // piso da cobertura acima do núcleo (sem z-fight)
const TANK = 3; // meia planta da caixa d'água central (topo do mesh)
const TANK_H = 4.2;
const CAP_T = 0.2;
const ROOF_EXTRA = TANK_H + CAP_T;
const MAX_FLOORS = 60;
// Prévia do admin: lote 1 × altura 3 = lote 2 × altura 6 na cena.
const DEFAULT_HEIGHT = 6;

// Calibrado na luz da cena (ambient ~8 + exposição 1.45): tom claro estoura.
// Bege × mapa de concreto do topo (média ×0,54) lê taupe claro; sem textura
// (render-building, texturas desligadas) sai mais claro.
const PAINT_COLOR = 0xab9c84;
const PAINT_TILING = 6;
const CREAM_COLOR = 0x9a8f7c; // sem textura: lê creme, não branco
const GLASS_COLOR = 0x4f5f68; // azul-acinzentado
const FRAME_COLOR = 0xb4b8bb; // alumínio acetinado

// Pilastras bege: intervalo ao longo da face (laterais: z; fundos: x).
const SIDE_PILASTERS: Range[] = [[-7.6, -3.4], [-1.6, 2.6]];
const BACK_PILASTERS: Range[] = [[-5.4, -1.2], [1.2, 5.4]];
// Fundo bege do rasgo 2 cm à frente do núcleo creme: 1 cm brigava no depth (z-fighting).
const REVEAL = 0.02;
const SQUARE: WindowKind = { w: 1.1, y0: 1, y1: 2.3 };
const NARROW: WindowKind = { w: 0.5, y0: 1.3, y1: 2.3 }; // banheiro, no rasgo
// [posição na face, saliência sobre a torre (pilastra, rasgo ou 0), tipo]
const SIDE_WINDOWS: Array<[number, number, WindowKind]> = [
  [-5.5, PILASTER_OUT, SQUARE], [0.5, PILASTER_OUT, SQUARE], [-2.5, REVEAL, NARROW],
  [4.4, 0, SQUARE], [7.1, 0, SQUARE],
];
const BACK_WINDOWS: Array<[number, number, WindowKind]> = [
  [-3.3, PILASTER_OUT, SQUARE], [3.3, PILASTER_OUT, SQUARE], [0, REVEAL, NARROW],
  [-7, 0, SQUARE], [7, 0, SQUARE],
];

// Acessório de topo assenta na caixa d'água central: escala pelo lado dela.
export const GOURMET_ROOFTOP_SCALE = TANK / HALF;
// Letreiro e LED seguem a face da torre, não o embasamento.
export const GOURMET_TOWER_SCALE = TOWER / HALF;

const geometryCache = new Map<number, THREE.BufferGeometry>();

const span = (a: number, b: number): Range => (a < b ? [a, b] : [b, a]);

// Arco das sacadas (mesmo centro, raio r) de x0 a −x0, deslocado dz em Z.
function arc(r: number, x0: number, dz = 0): Point[] {
  const t0 = Math.asin(x0 / r);
  return Array.from({ length: ARC_SEGMENTS + 1 }, (_, i) => {
    const t = t0 - (2 * t0 * i) / ARC_SEGMENTS;
    return [r * Math.sin(t), ARC_Z + dz + r * Math.cos(t)];
  });
}

// Planta da cobertura recuada `inset`: quadrado da torre com a frente curva.
function roofOutline(inset: number): Point[] {
  const t = TOWER - inset;
  const r = ARC_R - inset;
  const x0 = Math.sqrt(r * r - (t - ARC_Z) ** 2); // arco encontra a face em z = t
  return [[-t, -t], [t, -t], [t, t], ...arc(r, x0), [-t, t]];
}

// Shape no plano XY que, após rotateX(−π/2), cai no plano XZ com o mesmo (x, z).
const toShapePoints = (points: Point[]) => points.map(([x, z]) => new THREE.Vector2(x, -z));
const toShape = (points: Point[]) => new THREE.Shape(toShapePoints(points));

export function getGourmetFloorCount(height: number): number {
  const floors = Math.round(
    (height / WORLD_UNITS_PER_METER - PLINTH_H - ROOF_EXTRA) / FLOOR_H,
  );
  return Math.max(1, Math.min(MAX_FLOORS, floors));
}

function getLevels(floors: number) {
  const roof = PLINTH_H + floors * FLOOR_H; // topo da torre = base da platibanda
  return { roof, total: roof + ROOF_EXTRA };
}

function buildGourmetGeometry(floors: number): THREE.BufferGeometry {
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
  // Quad voltado para fora da face em `at` (sinal = lado: só faces que olham pra fora da torre).
  const quad = (slot: number, axis: Axis, at: number, [u0, u1]: Range, [y0, y1]: Range) => {
    const geometry = new THREE.PlaneGeometry(u1 - u0, y1 - y0);
    geometry.rotateY(axis === "x" ? (Math.sign(at) * Math.PI) / 2 : at < 0 ? Math.PI : 0);
    const u = (u0 + u1) / 2;
    geometry.translate(axis === "x" ? at : u, (y0 + y1) / 2, axis === "x" ? u : at);
    push(slot, geometry);
  };
  const extrude = (shape: THREE.Shape, height: number) => {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  };
  // Faixa curva (só a face externa) do arco de raio r entre as pilastras creme.
  const ribbon = (r: number, [y0, y1]: Range, dz = 0) => {
    const t0 = Math.asin(BAY / r);
    const geometry = new THREE.CylinderGeometry(r, r, y1 - y0, ARC_SEGMENTS, 1, true, -t0, 2 * t0);
    return geometry.translate(0, (y0 + y1) / 2, ARC_Z + dz);
  };
  // Caixilho + vidro 2 cm à frente; moldura de 12 cm ainda lê de longe.
  const windowAt = (axis: Axis, face: number, u: number, floorY: number, kind: WindowKind) => {
    const s = Math.sign(face);
    const half = kind.w / 2;
    const y: Range = [floorY + kind.y0, floorY + kind.y1];
    quad(SLOT.frame, axis, face + s * 0.02, [u - half, u + half], y);
    quad(SLOT.glass, axis, face + s * 0.04, [u - half + 0.12, u + half - 0.12], [y[0] + 0.12, y[1] - 0.12]);
  };

  const sides = [-1, 1];
  const towerY: Range = [PLINTH_H, roof];
  const pilasterY: Range = [PLINTH_H, roof + PARAPET_H]; // rente ao topo da platibanda

  // --- Embasamento creme: portaria envidraçada na frente, porta nos fundos ---
  box(SLOT.cream, [-PLINTH, PLINTH], [0, PLINTH_H], [-PLINTH, PLINTH]);
  quad(SLOT.frame, "z", PLINTH + 0.02, [-2.6, 2.6], [0, 2.8]);
  quad(SLOT.glass, "z", PLINTH + 0.04, [-2.5, 2.5], [0, 2.7]);
  for (const x of [-0.9, 0.9]) quad(SLOT.frame, "z", PLINTH + 0.06, [x - 0.04, x + 0.04], [0, 2.7]);
  quad(SLOT.frame, "z", -PLINTH - 0.02, [-0.7, 0.7], [0, 2.2]);

  // --- Torre: núcleo creme + pilastras creme dos cantos da frente ---
  box(SLOT.cream, [-TOWER, TOWER], towerY, [-TOWER, CHORD_Z]);
  for (const s of sides) box(SLOT.cream, span(s * BAY, s * TOWER), towerY, [CHORD_Z, TOWER]);

  // Pilastras bege salientes + fundo do rasgo pintado de bege entre elas.
  for (const s of sides) {
    for (const z of SIDE_PILASTERS) {
      box(SLOT.paint, span(s * (TOWER - 0.1), s * (TOWER + PILASTER_OUT)), pilasterY, z);
    }
    quad(SLOT.paint, "x", s * (TOWER + REVEAL), [SIDE_PILASTERS[0][1], SIDE_PILASTERS[1][0]], pilasterY);
  }
  for (const x of BACK_PILASTERS) {
    box(SLOT.paint, x, pilasterY, [-TOWER - PILASTER_OUT, -TOWER + 0.1]);
  }
  quad(SLOT.paint, "z", -TOWER - REVEAL, [BACK_PILASTERS[0][1], BACK_PILASTERS[1][0]], pilasterY);

  // Pano de vidro curvo recuado (contínuo; lajes cortam) + montantes.
  push(SLOT.glass, ribbon(ARC_R, towerY, -BALCONY_D));
  const glassT0 = Math.asin(BAY / ARC_R);
  for (let i = 1; i < 6; i++) {
    const t = -glassT0 + (i * 2 * glassT0) / 6;
    const x = ARC_R * Math.sin(t);
    const z = ARC_Z - BALCONY_D + ARC_R * Math.cos(t);
    box(SLOT.frame, [x - 0.05, x + 0.05], towerY, [z - 0.05, z + 0.08]);
  }

  // --- Sacadas: molde único (laje, guarda-corpo, corrimão) clonado por andar ---
  const slabEdge = BAY + 0.1; // laje entra 10 cm na pilastra creme
  const slab = extrude(toShape([...arc(ARC_R, slabEdge), [-slabEdge, CHORD_Z], [slabEdge, CHORD_Z]]), SLAB_T);
  const rail = ribbon(ARC_R - 0.12, [0, RAIL_H]);
  const handrail = extrude(toShape([...arc(ARC_R - 0.08, BAY), ...arc(ARC_R - 0.16, BAY).reverse()]), 0.06);
  for (let f = 0; f < floors; f++) {
    const y = PLINTH_H + f * FLOOR_H;
    // Térreo da torre: sacada sobre o embasamento, sem laje própria.
    if (f > 0) push(SLOT.cream, slab.clone().translate(0, y - SLAB_T, 0));
    push(SLOT.railing, rail.clone().translate(0, y, 0));
    push(SLOT.frame, handrail.clone().translate(0, y + RAIL_H, 0));

    for (const s of sides) {
      for (const [z, out, kind] of SIDE_WINDOWS) windowAt("x", s * (TOWER + out), z, y, kind);
      windowAt("z", TOWER, s * 7.1, y, SQUARE);
    }
    for (const [x, out, kind] of BACK_WINDOWS) windowAt("z", -(TOWER + out), x, y, kind);
  }
  push(SLOT.cream, slab.clone().translate(0, roof - SLAB_T, 0)); // forro da última sacada
  for (const template of [slab, rail, handrail]) template.dispose();

  // --- Cobertura: platibanda com frente curva, piso, caixa d'água e casas de máquinas ---
  const inner = roofOutline(PARAPET_T);
  const parapetShape = toShape(roofOutline(0));
  parapetShape.holes.push(new THREE.Path(toShapePoints(inner)));
  push(SLOT.cream, extrude(parapetShape, PARAPET_H).translate(0, roof, 0));
  const deck = new THREE.ShapeGeometry(toShape(inner));
  deck.rotateX(-Math.PI / 2);
  deck.translate(0, roof + DECK_LIFT, 0);
  push(SLOT.roof, deck);

  const roofBox = ([x0, x1]: Range, [z0, z1]: Range, h: number) => {
    box(SLOT.paint, [x0, x1], [roof, roof + h], [z0, z1]);
    box(SLOT.roof, [x0 - 0.15, x1 + 0.15], [roof + h, roof + h + CAP_T], [z0 - 0.15, z1 + 0.15]);
  };
  roofBox([-TANK, TANK], [-TANK, TANK], TANK_H);
  quad(SLOT.frame, "z", TANK + 0.02, [-0.5, 0.5], [roof + DECK_LIFT, roof + 2.2]);
  roofBox([-7.8, -4.4], [-7.8, -4.4], 3.2);
  quad(SLOT.frame, "x", -7.8 - 0.02, [-6.6, -5.6], [roof + DECK_LIFT, roof + 2.2]);
  roofBox([4, 7.6], [-7.6, -4.6], 2.8);
  for (let i = 0; i < 4; i++) {
    const y = roof + 1 + i * 0.35; // veneziana da casa de máquinas
    quad(SLOT.frame, "x", 7.6 + 0.02, [-6.8, -5.4], [y, y + 0.15]);
  }

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

function getGourmetGeometry(floors: number): THREE.BufferGeometry {
  let geometry = geometryCache.get(floors);
  if (!geometry) {
    geometry = buildGourmetGeometry(floors);
    geometryCache.set(floors, geometry);
  }
  return geometry;
}

// Mantém o pé-direito real quando a altura do edifício muda.
export function setGourmetBuildingHeight(mesh: THREE.Mesh, height: number): void {
  const geometry = getGourmetGeometry(getGourmetFloorCount(height));
  if (mesh.geometry !== geometry) mesh.geometry = geometry;
}

// Tiers para o LED de arestas: embasamento, torre até a platibanda, caixa d'água.
export function getGourmetTierFootprints(
  width = 1,
  depth = 1,
  height = 1,
): ResidentialTierFootprint[] {
  const { roof, total } = getLevels(getGourmetFloorCount(height));
  const toWorld = (y: number) => (y / total) * height;
  return [
    { bottomY: 0, topY: toWorld(PLINTH_H), width, depth },
    {
      bottomY: toWorld(PLINTH_H),
      topY: toWorld(roof + PARAPET_H),
      width: width * GOURMET_TOWER_SCALE,
      depth: depth * GOURMET_TOWER_SCALE,
    },
    {
      bottomY: toWorld(roof),
      topY: height,
      width: width * GOURMET_ROOFTOP_SCALE,
      depth: depth * GOURMET_ROOFTOP_SCALE,
    },
  ];
}

// Y (relativo ao centro do edifício) do topo da platibanda — letreiro apoia aqui.
export function getGourmetRoofOffset(height: number): number {
  const { roof, total } = getLevels(getGourmetFloorCount(height));
  return ((roof + PARAPET_H) / total - 0.5) * height;
}

// facadeMaterial vira o bege das pilastras e casas de máquinas (slot 0, recebe
// a cor do edifício e a textura via setResidentialStoneMaps); topMaterial =
// concreto global. Creme, lajes e embasamento ficam no slot 5, sem cor.
export function createGourmetBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  clearTextureSlots(facadeMaterial);
  if (facadeMaterial instanceof THREE.MeshStandardMaterial) {
    if (facadeMaterial instanceof THREE.MeshPhysicalMaterial) facadeMaterial.clearcoat = 0;
    facadeMaterial.color.set(PAINT_COLOR);
    facadeMaterial.normalScale.set(0.35, 0.35); // pintura fosca: só a microtextura
    facadeMaterial.roughness = 1;
    facadeMaterial.metalness = 0;
    facadeMaterial.envMapIntensity = 1;
    facadeMaterial.userData.authoredEnvMapIntensity = 1;
  }
  if (facadeMaterial.userData.tilingMultiplier) {
    facadeMaterial.userData.tilingMultiplier.value = PAINT_TILING;
  }

  // Vidro azul-acinzentado reflete a cidade; guarda-corpo translúcido; alumínio acetinado.
  const envMap =
    facadeMaterial instanceof THREE.MeshStandardMaterial ? facadeMaterial.envMap : null;
  const materials: THREE.Material[] = [
    facadeMaterial,
    topMaterial,
    createSceneMaterial(envMap, {
      color: GLASS_COLOR,
      roughness: 0.1,
      metalness: 0.85,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: 0x8fa3a6,
      roughness: 0.04,
      metalness: 1,
      envMapIntensity: 1,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
    createSceneMaterial(envMap, {
      color: FRAME_COLOR,
      roughness: 0.35,
      metalness: 0.7,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: CREAM_COLOR,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 1,
    }),
  ];

  return new THREE.Mesh(
    getGourmetGeometry(getGourmetFloorCount(DEFAULT_HEIGHT)),
    materials,
  );
}

export function disposeGourmetBuildingSharedResources(): void {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
}
