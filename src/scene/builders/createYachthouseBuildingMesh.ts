import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clearTextureSlots } from "./createEmpireBuildingMesh";
import {
  createSceneMaterial,
  type ResidentialTierFootprint,
} from "./createResidentialBuildingMesh";

// Yatchcasa (ref. "Yatchcasa .png"): duas torres de vidro fumê azul-escuro sobre
// embasamento retangular bege com faixa de vidro; sacada em todo andar com face
// lateral dourada e topo escuro (de cima lê como linha fina), pilastras douradas
// no rasgo vertical envidraçado da frente e dos fundos, esquadrias escuras,
// coroamento recuado de 3 andares, cobertura em balanço e mastro.
//
// Medidas em metros; lote 50×50 m = unit box em X/Z, torres lado a lado em X.
// Nº de andares sai da altura na cena (mesmo esquema do residential). Sem
// textura de fachada: detalhe em geometria + 4 slots de material autorais.

type Range = [number, number];
type Point = [number, number];

// Slots de material — ordem = índice do grupo na geometria.
const SLOT = { trim: 0, roof: 1, glass: 2, frame: 3, podium: 4 } as const;
const SLOT_COUNT = 5;

// Torre esbelta: 1 un. = 25 m mantém o espaçamento das faixas proporcional à
// largura da torre (com 0,1 do residential as faixas ficariam ralas).
const WORLD_UNITS_PER_METER = 0.04;
const HALF = 25;
const TOWER_X = 12.2; // centro de cada torre (±) → vão de 4 m, ~1/5 da torre (ref.)
const TOWER_W = 10.2; // meia largura na borda das sacadas
const TOWER_D = 10.5; // meia profundidade na borda das sacadas
const BAND_OUT = 0.35; // sacada saliente além do vidro
const CHAMFER = 1.2;
const SLIT = 1.6; // meia largura do rasgo envidraçado (frente/fundos)
const SLIT_D = 1.2;
const FIN = 0.3; // pilastra dourada nas bordas do rasgo
const PODIUM_D = 17;
const PODIUM_H = 12.8;
const PODIUM_INSET = 0.3;
const PODIUM_GLASS: Range = [3.4, 8.6];
const SKIRT_H = 0.6; // rodapé escuro da torre sobre o embasamento
const FLOOR_H = 3.2;
const BAND_H = 0.4;
const TRANSFER_H = 0.9; // faixa larga onde a torre recua
const CROWN_INSET = 1.3;
const CROWN_BAND_OUT = 0.25;
const CROWN_FLOORS = 3;
const CROWN_FLOOR_H = 3.6;
const CROWN_CAP_H = 0.6;
const PENT = 4.5; // meia planta da casa de máquinas sob a laje
const PENT_H = 3;
const PLATE = 6.5; // meia planta da cobertura em balanço
const PLATE_T = 0.7;
const MAST_H = 18;
const MAST_X = 4; // mastro do lado do vão entre as torres
const MAST_Z = -7.6; // atrás da cobertura: acessório de topo não encosta
const ROOF_EXTRA = TRANSFER_H + CROWN_FLOORS * CROWN_FLOOR_H + CROWN_CAP_H + MAST_H;
const MAX_FLOORS = 81; // torres reais têm 81 pavimentos
const FRONT_MULLIONS = [3.9, 6.2]; // espelhados; rasgo fica livre
const SIDE_MULLIONS = [-6.75, -4.5, -2.25, 0, 2.25, 4.5, 6.75];

// Calibrado na luz da cena (ambient ~8 + exposição 1.45): tom claro estoura.
const TRIM_COLOR = 0xa67c3e; // dourado leve (×0,6 metal) — mais claro vira creme
const PODIUM_COLOR = 0x76695a; // revestimento bege fosco
const GLASS_COLOR = 0x24405e; // fumê azul-escuro

/** Prévia do admin usa esta altura: torre esbelta como a real (~12:1). */
export const YACHTHOUSE_PREVIEW_HEIGHT = 4.5;
export const YACHTHOUSE_TOWER_CENTERS = [-TOWER_X / (2 * HALF), TOWER_X / (2 * HALF)] as const;
// Acessório de topo assenta na cobertura em balanço da torre esquerda.
export const YACHTHOUSE_ROOFTOP_SCALE = PLATE / HALF;

export type YachthouseTowerFootprint = { x: number; tiers: ResidentialTierFootprint[] };

const geometryCache = new Map<number, THREE.BufferGeometry>();

const span = (a: number, b: number): Range => (a < b ? [a, b] : [b, a]);

// Planta chanfrada com rasgo na frente e nos fundos (x, z); `slitBack` = |z| do
// fundo do rasgo. Metade de trás = metade da frente girada 180°.
function towerOutline(hx: number, hz: number, slit: number, slitBack: number, chamfer: number): Point[] {
  const front: Point[] = [
    [hx, hz - chamfer], [hx - chamfer, hz], [slit, hz], [slit, slitBack],
    [-slit, slitBack], [-slit, hz], [-hx + chamfer, hz], [-hx, hz - chamfer],
  ];
  return [...front, ...front.map(([x, z]): Point => [-x, -z])];
}

// Vidro na face `hx`/`hz`; sacada saliente `out` além dele. O rasgo da sacada
// termina 5 cm dentro do vidro: faixa para na borda do rasgo, sem entrar nele.
function towerOutlines(hx: number, hz: number, out: number) {
  const slitBack = hz - SLIT_D;
  return {
    glass: towerOutline(hx, hz, SLIT, slitBack, CHAMFER),
    band: towerOutline(hx + out, hz + out, SLIT + 0.02, slitBack - 0.05,
      CHAMFER + out * (2 - Math.SQRT2)),
  };
}

export function getYachthouseFloorCount(height: number): number {
  const floors = Math.round(
    (height / WORLD_UNITS_PER_METER - PODIUM_H - ROOF_EXTRA) / FLOOR_H,
  );
  return Math.max(1, Math.min(MAX_FLOORS, floors));
}

function getLevels(floors: number) {
  const body = PODIUM_H + floors * FLOOR_H; // topo do vidro das torres
  const crownBase = body + TRANSFER_H;
  const crownTop = crownBase + CROWN_FLOORS * CROWN_FLOOR_H;
  const deck = crownTop + CROWN_CAP_H;
  return { body, crownBase, crownTop, deck, plateTop: deck + PENT_H + PLATE_T, total: deck + MAST_H };
}

function buildYachthouseGeometry(floors: number): THREE.BufferGeometry {
  const { body, crownBase, crownTop, deck, total } = getLevels(floors);
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
  // Shape no plano XY; após rotateX(−π/2) cai no plano XZ com o mesmo (x, z).
  const extrude = (points: Point[], [y0, y1]: Range, cx: number) => {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(cx, y0, 0);
    return geometry;
  };
  const prism = (slot: number, points: Point[], y: Range, cx: number) => push(slot, extrude(points, y, cx));
  // Faixa: só a face lateral é dourada; tampas (grupo 0 do Extrude) vão pra
  // `capSlot` — de cima a sacada lê como linha fina, não como laje bege.
  const band = (points: Point[], y: Range, cx: number, capSlot: number) => {
    const geometry = extrude(points, y, cx);
    for (const { start, count, materialIndex } of geometry.groups) {
      const part = new THREE.BufferGeometry();
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        const { array, itemSize } = attribute as THREE.BufferAttribute;
        part.setAttribute(name, new THREE.BufferAttribute(array.slice(start * itemSize, (start + count) * itemSize), itemSize));
      }
      push(materialIndex === 0 ? capSlot : SLOT.trim, part);
    }
    geometry.dispose();
  };
  // Montantes escuros no vidro + pilastras douradas nas bordas do rasgo + montante no rasgo.
  const facadeDetail = (cx: number, hx: number, hz: number, out: number, y: Range) => {
    for (const sz of [-1, 1]) {
      box(SLOT.frame, [cx - 0.05, cx + 0.05], y, span(sz * (hz - SLIT_D), sz * (hz - SLIT_D + 0.1)));
      for (const sx of [-1, 1]) {
        for (const x of FRONT_MULLIONS) {
          box(SLOT.frame, [cx + sx * x - 0.05, cx + sx * x + 0.05], y, span(sz * hz, sz * (hz + 0.1)));
        }
        box(SLOT.trim, span(cx + sx * SLIT, cx + sx * (SLIT + FIN)), y, span(sz * hz, sz * (hz + out + 0.05)));
      }
    }
    for (const sx of [-1, 1]) {
      for (const z of SIDE_MULLIONS) {
        box(SLOT.frame, span(cx + sx * hx, cx + sx * (hx + 0.1)), y, [z - 0.05, z + 0.05]);
      }
    }
  };

  // --- Embasamento: rodapé e platibanda bege, faixa de vidro fumê recuada ---
  const [g0, g1] = PODIUM_GLASS;
  box(SLOT.podium, [-HALF, HALF], [0, g0], [-PODIUM_D, PODIUM_D]);
  box(SLOT.podium, [-HALF, HALF], [g1, PODIUM_H], [-PODIUM_D, PODIUM_D]);
  const gx = HALF - PODIUM_INSET;
  const gz = PODIUM_D - PODIUM_INSET;
  box(SLOT.glass, [-gx, gx], [g0, g1], [-gz, gz]);
  for (const s of [-1, 1]) {
    for (let i = 1; i < 14; i++) {
      const x = -gx + (i * 2 * gx) / 14;
      box(SLOT.frame, [x - 0.06, x + 0.06], [g0, g1], span(s * gz, s * (gz + 0.12)));
    }
    for (let i = 1; i < 9; i++) {
      const z = -gz + (i * 2 * gz) / 9;
      box(SLOT.frame, span(s * gx, s * (gx + 0.12)), [g0, g1], [z - 0.06, z + 0.06]);
    }
  }

  const tower = towerOutlines(TOWER_W - BAND_OUT, TOWER_D - BAND_OUT, BAND_OUT);
  const crownW = TOWER_W - CROWN_INSET - CROWN_BAND_OUT;
  const crownD = TOWER_D - CROWN_INSET - CROWN_BAND_OUT;
  const crown = towerOutlines(crownW, crownD, CROWN_BAND_OUT);

  for (const side of [-1, 1]) {
    const cx = side * TOWER_X;

    // --- Corpo: pano de vidro contínuo; sacada a cada laje, rodapé escuro ---
    prism(SLOT.frame, tower.band, [PODIUM_H, PODIUM_H + SKIRT_H], cx);
    prism(SLOT.glass, tower.glass, [PODIUM_H, body], cx);
    facadeDetail(cx, TOWER_W - BAND_OUT, TOWER_D - BAND_OUT, BAND_OUT, [PODIUM_H, body]);
    for (let f = 1; f < floors; f++) {
      const y = PODIUM_H + f * FLOOR_H;
      band(tower.band, [y - BAND_H, y], cx, SLOT.frame);
    }
    band(tower.band, [body, crownBase], cx, SLOT.roof);

    // --- Coroamento recuado: 3 andares de vidro com faixas mais finas ---
    prism(SLOT.glass, crown.glass, [crownBase, crownTop], cx);
    facadeDetail(cx, crownW, crownD, CROWN_BAND_OUT, [crownBase, crownTop]);
    for (let f = 1; f < CROWN_FLOORS; f++) {
      const y = crownBase + f * CROWN_FLOOR_H;
      band(crown.band, [y - 0.3, y], cx, SLOT.frame);
    }
    band(crown.band, [crownTop, deck], cx, SLOT.roof);

    // --- Cobertura: casa de máquinas envidraçada, laje em balanço, mastro ---
    box(SLOT.glass, [cx - PENT, cx + PENT], [deck, deck + PENT_H], [-PENT, PENT]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = cx + sx * PENT;
        box(SLOT.frame, [x - 0.2, x + 0.2], [deck, deck + PENT_H], [sz * PENT - 0.2, sz * PENT + 0.2]);
      }
    }
    const plateY: Range = [deck + PENT_H, deck + PENT_H + PLATE_T];
    box(SLOT.roof, [cx - PLATE, cx + PLATE], plateY, [-PLATE, PLATE]);
    const mx = cx - side * MAST_X;
    box(SLOT.frame, [mx - 0.8, mx + 0.8], [deck, deck + 2], [MAST_Z - 0.8, MAST_Z + 0.8]);
    const mast = new THREE.CylinderGeometry(0.1, 0.55, MAST_H - 2, 8);
    mast.translate(mx, deck + 2 + (MAST_H - 2) / 2, MAST_Z);
    push(SLOT.frame, mast);
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

function getYachthouseGeometry(floors: number): THREE.BufferGeometry {
  let geometry = geometryCache.get(floors);
  if (!geometry) {
    geometry = buildYachthouseGeometry(floors);
    geometryCache.set(floors, geometry);
  }
  return geometry;
}

// Mantém o pé-direito real quando a altura do edifício muda.
export function setYachthouseBuildingHeight(mesh: THREE.Mesh, height: number): void {
  const geometry = getYachthouseGeometry(getYachthouseFloorCount(height));
  if (mesh.geometry !== geometry) mesh.geometry = geometry;
}

// Por torre: corpo (do embasamento à faixa do recuo) + coroamento. LED contorna
// os dois; letreiro usa o corpo.
export function getYachthouseTowerFootprints(
  width = 1,
  depth = 1,
  height = 1,
): YachthouseTowerFootprint[] {
  const { crownBase, deck, total } = getLevels(getYachthouseFloorCount(height));
  const toWorld = (y: number) => (y / total) * height;
  const tiers = [
    {
      bottomY: toWorld(PODIUM_H),
      topY: toWorld(crownBase),
      width: (width * TOWER_W) / HALF,
      depth: (depth * TOWER_D) / HALF,
    },
    {
      bottomY: toWorld(crownBase),
      topY: toWorld(deck),
      width: (width * (TOWER_W - CROWN_INSET)) / HALF,
      depth: (depth * (TOWER_D - CROWN_INSET)) / HALF,
    },
  ];
  return YACHTHOUSE_TOWER_CENTERS.map((x) => ({ x: x * width, tiers }));
}

// Y (relativo ao centro do edifício) do topo da cobertura em balanço — acessório apoia aqui.
export function getYachthouseRoofOffset(height: number): number {
  const { plateTop, total } = getLevels(getYachthouseFloorCount(height));
  return (plateTop / total - 0.5) * height;
}

// facadeMaterial vira o dourado das linhas (slot 0, recebe a cor do edifício;
// sem textura); topMaterial = concreto global (cobertura, topo dos recuos).
export function createYachthouseBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  clearTextureSlots(facadeMaterial);
  if (facadeMaterial instanceof THREE.MeshStandardMaterial) {
    if (facadeMaterial instanceof THREE.MeshPhysicalMaterial) facadeMaterial.clearcoat = 0;
    facadeMaterial.color.set(TRIM_COLOR);
    facadeMaterial.roughness = 0.35; // acetinado
    facadeMaterial.metalness = 0.6; // brilho dourado: reflete a cidade
    facadeMaterial.envMapIntensity = 1;
    facadeMaterial.userData.authoredEnvMapIntensity = 1;
  }

  // Vidro fumê, esquadria escura acetinada e embasamento bege fosco refletem a cidade.
  const envMap =
    facadeMaterial instanceof THREE.MeshStandardMaterial ? facadeMaterial.envMap : null;
  const materials: THREE.Material[] = [
    facadeMaterial,
    topMaterial,
    createSceneMaterial(envMap, {
      color: GLASS_COLOR,
      roughness: 0.05,
      metalness: 0.9,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: 0x2f3438,
      roughness: 0.35,
      metalness: 0.8,
      envMapIntensity: 1,
    }),
    createSceneMaterial(envMap, {
      color: PODIUM_COLOR,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 1,
    }),
  ];

  return new THREE.Mesh(
    getYachthouseGeometry(getYachthouseFloorCount(YACHTHOUSE_PREVIEW_HEIGHT)),
    materials,
  );
}

export function disposeYachthouseBuildingSharedResources(): void {
  for (const geometry of geometryCache.values()) geometry.dispose();
  geometryCache.clear();
}
