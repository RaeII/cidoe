import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingShape, ScreenLabel, ScreenSide } from "../types";
import { getSignBand } from "./createSignMesh";
import { getOctagonalFootprintPoints, getOctagonalGeometry } from "./createOctagonalBuildingMesh";
import { getSetbackFootprintScaleAtHeightRatio, getSetbackGeometry } from "./createSetbackBuildingMesh";
import { getTaperedFootprintScaleAtHeightRatio, getTaperedGeometry } from "./createTaperedBuildingMesh";
import { getChryslerFootprintScaleAtHeightRatio, getChryslerGeometry } from "./createChryslerBuildingMesh";
import { getEmpireFootprintScaleAtHeightRatio, getEmpireGeometry } from "./createEmpireBuildingMesh";
import { getTaipeiFootprintScaleAtHeightRatio, getTaipeiGeometry } from "./createTaipeiBuildingMesh";
import { getOneTradeGeometry, getOneTradeLedFootprintRings } from "./createOneTradeBuildingMesh";
import { getHearstGeometry, getHearstRingFootprintPoints } from "./createHearstBuildingMesh";
import { TWIST_TOTAL_ANGLE } from "./createTwistedBuildingMesh";
import { RESIDENTIAL_FLOOR_KIT, getResidentialTierFootprints, type ResidentialTierFootprint } from "./createResidentialBuildingMesh";
import { APARTMENT_FLOOR_KIT, getApartmentTierFootprints } from "./createApartmentBuildingMesh";
import { GOURMET_FLOOR_KIT, GOURMET_FRONT_SCALE, GOURMET_SIDE_SCALE, getGourmetTierFootprints } from "./createGourmetBuildingMesh";
import { LOFT_FLOOR_KIT, getLoftTierFootprints } from "./createLoftBuildingMesh";
import { YACHTHOUSE_FLOOR_KIT, getYachthouseTowerFootprints } from "./createYachthouseBuildingMesh";
import type { FloorKitSpec } from "./createBuildingFloorKit";

// Telão de LED numa fachada: gabinete metálico afastado da parede por braços, painel de
// LEDs com shader próprio (diodo, louver, ângulo de visão, troca em cascata) e, de noite,
// o clarão que a tela joga na própria fachada. Um telão = 2 draw calls (+1 de noite).

/** LEDs por lado = resolução da textura: 1 texel por LED, Nearest de perto, mip de longe. */
export const LED_SCREEN_GRID = 128;
/** Tempo de cada imagem no ciclo, e da troca em cascata no começo dele. */
export const LED_SCREEN_SLIDE_SECONDS = 7;
export const LED_SCREEN_FADE_SECONDS = 0.8;
/** Faixa do nome: fileiras de LED embaixo da imagem, no mesmo passo (texto de ~10 LEDs). */
export const LED_SCREEN_LABEL_ROWS = 20;
const LABEL_ASPECT = (LED_SCREEN_GRID + LED_SCREEN_LABEL_ROWS) / LED_SCREEN_GRID;
const LABEL_COLOR = "#f4f1ea";
const CATALOG_URL = "/api/club/catalog"; // mesma origem das imagens (getScreenImageUrl)

const SAMPLES = 40;          // alturas testadas na faixa livre da fachada
const FINE_SAMPLES = 16;     // dentro da janela escolhida, pro afastamento final
const WIDTH_FILL = 0.84;     // gabinete ocupa até 84% da face plana
const MIN_SIZE = 0.16;       // lado mínimo do gabinete (mundo): cabe no prédio mais baixo
const DIST_TOLERANCE = 0.06; // folga máxima atrás do telão, × maior lado (degrau do setback = 0,12)
const YAW_TOLERANCE = 0.35;  // torção aceita dentro da janela (rad)
const HEIGHT_WEIGHT = 1;     // bônus por altura do centro: no topo, telão ~45% menor ainda vence o rente ao chão
const FACE_GAP = 0.003;      // painel à frente do gabinete (z-fighting até ~90u com near 1)
const SPILL_SCALE = 2;       // clarão noturno: quadrado 2× o gabinete

type Point = { x: number; z: number };

export type LedScreenParams = {
  width: number;
  depth: number;
  height: number;
  side: ScreenSide;
  shape: BuildingShape;
  /** Com faixa do nome: gabinete mais alto (imagem quadrada + LED_SCREEN_LABEL_ROWS fileiras). */
  labeled?: boolean;
};

export type LedScreenPlacement = {
  /** Largura externa do gabinete (imagem quadrada). */
  size: number;
  /** Altura externa máxima: = size sem faixa do nome, size × LABEL_ASPECT com ela. */
  height: number;
  /** Altura do centro, com a base do edifício em 0. */
  centerY: number;
  /** Normal da fachada (XZ) e tangente (eixo X local do painel). */
  normal: Point;
  tangent: Point;
  yaw: number;
  /** Deslocamento do centro ao longo da tangente (torre da Yatchcasa, face assimétrica). */
  centerT: number;
  /** Maior profundidade da fachada na janela, ao longo da normal, a partir do eixo. */
  faceDist: number;
};

export type LedScreenEntry = {
  group: THREE.Group;
  /** Gabinete + braços (material compartilhado; o foco esmaece por clone). */
  frame: THREE.Mesh;
  face: THREE.Mesh;
  spill: THREE.Mesh;
  material: THREE.ShaderMaterial;
  spillMaterial: THREE.ShaderMaterial;
  textures: THREE.Texture[];
  slide: number;
  fade: number;
};

const SIDE_NORMALS: Record<ScreenSide, Point> = {
  front: { x: 0, z: 1 },
  back: { x: 0, z: -1 },
  right: { x: 1, z: 0 },
  left: { x: -1, z: 0 },
};

const box = (minX: number, maxX: number, minZ: number, maxZ: number): Point[] => [
  { x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ },
];
const centered = (width: number, depth: number, x = 0): Point[] =>
  box(x - width / 2, x + width / 2, -depth / 2, depth / 2);

/** Contorno (maior extensão) dos tiers que cobrem `y`; null = acima do edifício. */
function tierBox(tiers: ResidentialTierFootprint[], y: number, x = 0): Point[] | null {
  let width = 0;
  let depth = 0;
  for (const tier of tiers) {
    if (y < tier.bottomY || y > tier.topY) continue;
    width = Math.max(width, tier.width);
    depth = Math.max(depth, tier.depth);
  }
  return width > 0 ? centered(width, depth, x) : null;
}

/**
 * Contorno da fachada na altura `y` (base = 0), em coordenadas do mundo relativas ao eixo
 * do edifício. Mesmas medidas do letreiro e do LED de arestas (helpers de cada builder).
 * null = ponto sem fachada própria (acima do topo, embasamento da Yatchcasa).
 */
export function getFacadePolygonAt(
  shape: BuildingShape, width: number, depth: number, height: number, y: number, side: ScreenSide,
): Point[] | null {
  const ratio = height > 0 ? y / height : 0;
  const scaled = (scale: number) => centered(width * scale, depth * scale);
  switch (shape) {
    case "octagonal": return getOctagonalFootprintPoints(width, depth);
    case "setback": return scaled(getSetbackFootprintScaleAtHeightRatio(ratio));
    case "tapered": return scaled(getTaperedFootprintScaleAtHeightRatio(ratio));
    case "chrysler": return scaled(getChryslerFootprintScaleAtHeightRatio(ratio));
    case "taipei": return scaled(getTaipeiFootprintScaleAtHeightRatio(ratio));
    case "empire": {
      const scale = getEmpireFootprintScaleAtHeightRatio(ratio);
      return centered(width * scale.x, depth * scale.z);
    }
    // Anéis alternam chanfro raso/fundo; o fundo dá a menor face plana em qualquer altura.
    case "hearst": return getHearstRingFootprintPoints(width, depth, 1);
    case "one-trade": {
      // Anéis do LED de arestas, interpolados: facetas da torre ligam canto a canto.
      const rings = getOneTradeLedFootprintRings(width, depth, height);
      const upper = rings.findIndex((ring) => ring.y >= y);
      if (upper <= 0) return (rings[upper === 0 ? 0 : rings.length - 1]).points;
      const a = rings[upper - 1];
      const b = rings[upper];
      const t = b.y > a.y ? (y - a.y) / (b.y - a.y) : 0;
      return a.points.map((p, i) => ({ x: p.x + (b.points[i].x - p.x) * t, z: p.z + (b.points[i].z - p.z) * t }));
    }
    case "twisted": {
      // Torção acontece em unit-space ANTES da escala (ver createTwistedBuildingMesh).
      const angle = ratio * TWIST_TOTAL_ANGLE;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([ux, uz]) => ({
        x: (ux * cos - uz * sin) * width,
        z: (ux * sin + uz * cos) * depth,
      }));
    }
    case "residential": return tierBox(getResidentialTierFootprints(width, depth, height), y);
    case "apartment": return tierBox(getApartmentTierFootprints(width, depth, height), y);
    case "loft": return tierBox(getLoftTierFootprints(width, depth, height), y);
    case "gourmet": {
      // Torre (tier 1) com o contorno saliente: sacada curva na frente, pilastras nas demais.
      const [plinth, tower, tank] = getGourmetTierFootprints(width, depth, height);
      const half = { x: 0, back: 0, front: 0 };
      const grow = (x: number, back: number, front: number) => {
        half.x = Math.max(half.x, x);
        half.back = Math.max(half.back, back);
        half.front = Math.max(half.front, front);
      };
      if (y >= plinth.bottomY && y <= plinth.topY) grow(plinth.width / 2, plinth.depth / 2, plinth.depth / 2);
      if (y >= tower.bottomY && y <= tower.topY) {
        grow(width * GOURMET_SIDE_SCALE / 2, depth * GOURMET_SIDE_SCALE / 2, depth * GOURMET_FRONT_SCALE / 2);
      }
      if (y >= tank.bottomY && y <= tank.topY) grow(tank.width / 2, tank.depth / 2, tank.depth / 2);
      return half.x > 0 ? box(-half.x, half.x, -half.back, half.front) : null;
    }
    case "yachthouse": {
      // Frente, fundos e esquerda na torre esquerda (a mesma do acessório de topo); direita na direita.
      const towers = getYachthouseTowerFootprints(width, depth, height);
      const tower = towers[side === "right" ? 1 : 0];
      return tierBox(tower.tiers, y, tower.x);
    }
    default: return centered(width, depth);
  }
}

/** Normal da fachada `side` na altura `y`: cardinal, exceto na torre torcida. */
function getSideNormal(shape: BuildingShape, side: ScreenSide, width: number, depth: number, height: number, y: number): Point {
  const cardinal = SIDE_NORMALS[side];
  if (shape !== "twisted" || height <= 0) return cardinal;
  const angle = (y / height) * TWIST_TOTAL_ANGLE;
  const ux = cardinal.x * Math.cos(angle) - cardinal.z * Math.sin(angle);
  const uz = cardinal.x * Math.sin(angle) + cardinal.z * Math.cos(angle);
  // Escala não-uniforme: normal do mundo = inversa transposta (ver createSignMesh).
  const length = Math.hypot(ux / width, uz / depth) || 1;
  return { x: ux / width / length, z: uz / depth / length };
}

// Térreo dos formatos com andares (pilotis, portaria, embasamento): aberto ou recuado,
// telão ficaria solto na frente dele.
const FLOOR_KITS: Partial<Record<BuildingShape, FloorKitSpec>> = {
  residential: RESIDENTIAL_FLOOR_KIT,
  apartment: APARTMENT_FLOOR_KIT,
  gourmet: GOURMET_FLOOR_KIT,
  loft: LOFT_FLOOR_KIT,
  yachthouse: YACHTHOUSE_FLOOR_KIT,
};

function getGroundTop(shape: BuildingShape, height: number): number {
  const kit = FLOOR_KITS[shape];
  if (!kit) return 0;
  return (kit.groundH / (kit.groundH + kit.floorCount(height) * kit.floorH + kit.roofExtra)) * height;
}

// Formatos de malha única: o contorno analítico dá a face plana, mas ornamento (diagrid do
// Hearst, base do Empire, beirais e pórtico do Taipei — que ainda desloca o eixo em Z na
// normalização —, facetas do One Trade) passa dele. A profundidade usa também o envoltório
// da própria malha unitária, em faixas de altura. Torcida gira (fica no analítico); formatos
// com andares mudam de malha pela altura (tiers já são o envoltório, ver check-led-screen).
const MEASURED_GEOMETRY: Partial<Record<BuildingShape, () => THREE.BufferGeometry>> = {
  octagonal: getOctagonalGeometry,
  setback: getSetbackGeometry,
  tapered: getTaperedGeometry,
  chrysler: getChryslerGeometry,
  hearst: getHearstGeometry,
  empire: getEmpireGeometry,
  taipei: getTaipeiGeometry,
  "one-trade": getOneTradeGeometry,
};
const ENVELOPE_BINS = 128;
const envelopeCache = new WeakMap<THREE.BufferGeometry, Float32Array>();

/**
 * minX, maxX, minZ, maxZ (unit-space) por faixa de altura. Conservador: cada triângulo
 * entra com a própria caixa em todas as faixas que cruza. Uma passada, cache por malha.
 */
function getEnvelope(geometry: THREE.BufferGeometry): Float32Array {
  const cached = envelopeCache.get(geometry);
  if (cached) return cached;
  const bins = new Float32Array(ENVELOPE_BINS * 4);
  for (let k = 0; k < ENVELOPE_BINS; k++) bins.set([Infinity, -Infinity, Infinity, -Infinity], k * 4);
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 3) {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity;
    let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (let v = 0; v < 3; v++) {
      const vertex = index ? index.getX(i + v) : i + v;
      const x = position.getX(vertex);
      const y = position.getY(vertex);
      const z = position.getZ(vertex);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const first = Math.max(0, Math.floor((minY + 0.5) * ENVELOPE_BINS));
    const last = Math.min(ENVELOPE_BINS - 1, Math.floor((maxY + 0.5) * ENVELOPE_BINS));
    for (let k = first; k <= last; k++) {
      const o = k * 4;
      bins[o] = Math.min(bins[o], minX);
      bins[o + 1] = Math.max(bins[o + 1], maxX);
      bins[o + 2] = Math.min(bins[o + 2], minZ);
      bins[o + 3] = Math.max(bins[o + 3], maxZ);
    }
  }
  envelopeCache.set(geometry, bins);
  return bins;
}

/** Profundidade medida na malha ao longo da normal cardinal; -Infinity = formato sem medição. */
function measuredDist(shape: BuildingShape, side: ScreenSide, width: number, depth: number, height: number, y: number): number {
  const geometry = MEASURED_GEOMETRY[shape]?.();
  if (!geometry) return -Infinity;
  const bins = getEnvelope(geometry);
  const o = Math.min(ENVELOPE_BINS - 1, Math.max(0, Math.floor((y / height) * ENVELOPE_BINS))) * 4;
  if (!(bins[o + 1] >= bins[o])) return -Infinity; // faixa sem malha
  if (side === "front") return bins[o + 3] * depth;
  if (side === "back") return -bins[o + 2] * depth;
  if (side === "right") return bins[o + 1] * width;
  return -bins[o] * width;
}

const tangentOf = (n: Point): Point => ({ x: n.z, z: -n.x });
const dot = (p: Point, n: Point) => p.x * n.x + p.z * n.z;

/** Profundidade máxima ao longo de `n`, largura e centro da face plana que a alcança. */
function supportFace(points: Point[], n: Point) {
  const t = tangentOf(n);
  let dist = -Infinity;
  for (const p of points) dist = Math.max(dist, dot(p, n));
  const eps = 1e-6 + Math.abs(dist) * 1e-4;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const p of points) {
    if (dot(p, n) < dist - eps) continue;
    const along = dot(p, t);
    tMin = Math.min(tMin, along);
    tMax = Math.max(tMax, along);
  }
  return { dist, width: tMax - tMin, center: (tMin + tMax) / 2 };
}

/** Maior `s` em que o ponto `u·t + s·n` toca o contorno (fundo do braço). null = fora da face. */
function depthAlong(points: Point[], n: Point, t: Point, u: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const at = dot(a, t);
    const bt = dot(b, t);
    if ((at - u) * (bt - u) > 0 || at === bt) continue;
    const k = (u - at) / (bt - at);
    const s = dot(a, n) + k * (dot(b, n) - dot(a, n));
    best = best === null ? s : Math.max(best, s);
  }
  return best;
}

/**
 * Telão quadrado numa parte plana da fachada, abaixo da faixa do letreiro (com ou sem
 * letreiro: o telão não muda de lugar quando ele aparece). Escolhe por tamanho com bônus de
 * altura (HEIGHT_WEIGHT). null = fachada sem trecho plano de `MIN_SIZE`.
 */
export function computeLedScreenPlacement({ width, depth, height, side, shape, labeled = false }: LedScreenParams): LedScreenPlacement | null {
  if (!(width > 0 && depth > 0 && height > 0)) return null;
  const aspect = labeled ? LABEL_ASPECT : 1;
  let yLow = Math.max(0.05, height * 0.08, getGroundTop(shape, height) + height * 0.01);
  let signBottom: number;
  let signHeight: number;
  if (shape === "yachthouse") {
    const [body] = getYachthouseTowerFootprints(width, depth, height)[0].tiers;
    const band = getSignBand("default", body.width, body.depth, body.topY);
    signBottom = body.topY / 2 + band.centerY - band.height / 2;
    signHeight = band.height;
    yLow = Math.max(yLow, body.bottomY + height * 0.03);
  } else {
    const band = getSignBand(shape, width, depth, height);
    signBottom = height / 2 + band.centerY - band.height / 2;
    signHeight = band.height;
  }
  let yHigh = Math.min(height, signBottom - signHeight * 0.3);
  if (yHigh - yLow < MIN_SIZE * aspect) yHigh = Math.min(height, yLow + MIN_SIZE * aspect);

  const tolerance = DIST_TOLERANCE * Math.max(width, depth);
  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const y = yLow + ((yHigh - yLow) * i) / SAMPLES;
    const points = getFacadePolygonAt(shape, width, depth, height, y, side);
    if (!points) return null;
    const normal = getSideNormal(shape, side, width, depth, height, y);
    const face = supportFace(points, normal);
    const dist = Math.max(face.dist, measuredDist(shape, side, width, depth, height, y));
    return { y, ...face, dist, yaw: Math.atan2(normal.x, normal.z) };
  });

  let best: { size: number; top: number; score: number } | null = null;
  for (let top = SAMPLES; top > 0; top--) {
    const head = samples[top];
    if (!head || head.width <= 0) continue;
    let minWidth = head.width;
    let minDist = head.dist;
    let maxDist = head.dist;
    let minYaw = head.yaw;
    let maxYaw = head.yaw;
    for (let low = top - 1; low >= 0; low--) {
      const sample = samples[low];
      if (!sample) break;
      minWidth = Math.min(minWidth, sample.width);
      minDist = Math.min(minDist, sample.dist);
      maxDist = Math.max(maxDist, sample.dist);
      minYaw = Math.min(minYaw, sample.yaw);
      maxYaw = Math.max(maxYaw, sample.yaw);
      if (minWidth <= 0 || maxDist - minDist > tolerance || maxYaw - minYaw > YAW_TOLERANCE) break;
      const size = Math.min((head.y - sample.y) / aspect, minWidth * WIDTH_FILL);
      // Telão no alto aparece de longe: altura pesa junto com o tamanho. Empate (±2%) fica
      // com a mais alta, que já vem primeiro.
      const score = size * (1 + HEIGHT_WEIGHT * (head.y - (size * aspect) / 2) / height);
      if (!best || score > best.score * 1.02) best = { size, top: head.y, score };
    }
  }
  if (!best || best.size < MIN_SIZE * 0.999) return null;

  const tall = best.size * aspect;
  const bottom = best.top - tall;
  const centerY = best.top - tall / 2;
  const normal = getSideNormal(shape, side, width, depth, height, centerY);
  const mid = getFacadePolygonAt(shape, width, depth, height, centerY, side)!;
  let faceDist = -Infinity;
  for (let i = 0; i <= FINE_SAMPLES; i++) {
    const y = bottom + (tall * i) / FINE_SAMPLES;
    const points = getFacadePolygonAt(shape, width, depth, height, y, side);
    if (points) faceDist = Math.max(faceDist, supportFace(points, normal).dist, measuredDist(shape, side, width, depth, height, y));
  }
  return {
    size: best.size,
    height: tall,
    centerY,
    normal,
    tangent: tangentOf(normal),
    yaw: Math.atan2(normal.x, normal.z),
    centerT: supportFace(mid, normal).center,
    faceDist,
  };
}

// --- Recursos compartilhados ---------------------------------------------------------

const FRAME_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.52, metalness: 0.55 });
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
/** 1 = dia, 0 = noite. Um objeto em todos os materiais: setLedScreenNight muda todos de uma vez. */
const DAYLIGHT = { value: 1 };
const GRID = { value: new THREE.Vector2(LED_SCREEN_GRID, LED_SCREEN_GRID) };
const GRID_LABELED = { value: new THREE.Vector2(LED_SCREEN_GRID, LED_SCREEN_GRID + LED_SCREEN_LABEL_ROWS) };
/** Faixa sem texto (só o fundo da imagem) enquanto o nome não chega ou time sem nome no catálogo. */
const BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
BLANK.needsUpdate = true;
let nightMode = false;

type ScreenTexture = THREE.CanvasTexture & { userData: { average: THREE.Color } };
const textureCache = new Map<string, ScreenTexture>();

/**
 * Textura de uma imagem do telão, uma por URL para a cidade toda. Nasce preta (tela
 * apagada) e recebe a imagem reduzida a LED_SCREEN_GRID ao carregar — mesma identidade,
 * então nenhum material precisa saber quando chegou. ImageLoader passa pelo
 * DefaultLoadingManager: o runtime recompila, redesenha e recaptura o reflexo sozinho.
 */
function getScreenTexture(url: string): ScreenTexture {
  const cached = textureCache.get(url);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = LED_SCREEN_GRID;
  canvas.height = LED_SCREEN_GRID;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, LED_SCREEN_GRID, LED_SCREEN_GRID);
  }
  const texture = new THREE.CanvasTexture(canvas) as ScreenTexture;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  // Cor média (linear) pro clarão noturno: mesmo objeto, atualizado no lugar.
  texture.userData.average = new THREE.Color(0, 0, 0);
  textureCache.set(url, texture);
  new THREE.ImageLoader().load(url, (image) => {
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, LED_SCREEN_GRID, LED_SCREEN_GRID);
    texture.needsUpdate = true;
    try {
      const { data } = ctx.getImageData(0, 0, LED_SCREEN_GRID, LED_SCREEN_GRID);
      let r = 0;
      let g = 0;
      let b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      const count = (data.length / 4) * 255;
      texture.userData.average.setRGB(r / count, g / count, b / count, THREE.SRGBColorSpace);
    } catch {
      texture.userData.average.setRGB(0.2, 0.2, 0.2); // canvas protegido (file://): média neutra
    }
  }, undefined, () => console.warn(`Telão: imagem não carregou (${url})`));
  return texture;
}

const labelCache = new Map<string, THREE.CanvasTexture>();

/**
 * Nome na faixa, 1 texel por LED como a imagem: caixa alta, centralizado, encolhe pra caber.
 * Fundo transparente (o shader pinta o fundo da imagem da vez); alfa pré-multiplicado pro mip.
 */
function getLabelTexture(text: string): THREE.CanvasTexture {
  const cached = labelCache.get(text);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = LED_SCREEN_GRID;
  canvas.height = LED_SCREEN_LABEL_ROWS;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const upper = text.toLocaleUpperCase("pt-BR");
    const max = LED_SCREEN_GRID - 8;
    ctx.font = "700 13px sans-serif";
    const width = ctx.measureText(upper).width;
    // Nome comprido: fonte menor até 9 px; o resto o maxWidth do fillText aperta.
    if (width > max) ctx.font = `700 ${Math.max(9, Math.floor((13 * max) / width))}px sans-serif`;
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(upper, LED_SCREEN_GRID / 2, LED_SCREEN_LABEL_ROWS / 2 + 1, max);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = true;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  labelCache.set(text, texture);
  return texture;
}

type CatalogClub = { slug: string; name: string; nickname: string | null };
let catalogClubs: Promise<Map<string, CatalogClub>> | null = null;

/**
 * Texto da faixa do nome: nome ou apelido do time (= prefixo das keys) no catálogo da API;
 * apelido que o time não tem cai no nome. null = sem faixa. Catálogo: um pedido por página,
 * só quando algum telão tem faixa (FileLoader passa pelo DefaultLoadingManager: chegou, o
 * runtime redesenha). Falhou: faixa apagada, o próximo telão tenta de novo. Nunca rejeita.
 */
export function getScreenLabelText(imageKeys: readonly string[], label: ScreenLabel | undefined): Promise<string | null> | null {
  if ((label !== "name" && label !== "nickname") || imageKeys.length === 0) return null;
  const slug = imageKeys[0].split("/")[0];
  catalogClubs ??= new THREE.FileLoader().setResponseType("json").loadAsync(CATALOG_URL).then(
    (body) => new Map((body as unknown as { data: { clubs: CatalogClub[] } }).data.clubs.map((club) => [club.slug, club])),
    () => {
      catalogClubs = null;
      return new Map<string, CatalogClub>();
    },
  );
  return catalogClubs.then((clubs) => {
    const club = clubs.get(slug);
    return club ? (label === "nickname" && club.nickname) || club.name : null;
  });
}

const FACE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mvPosition.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FACE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMapA;
  uniform sampler2D uMapB;
  uniform sampler2D uLabel;
  uniform float uSplit; // fração de baixo com a faixa do nome (0 = sem)
  uniform float uMix;
  uniform float uOpacity;
  uniform float uDaylight;
  uniform vec2 uGrid;
  varying vec2 vUv;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  #include <fog_pars_fragment>

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 cell = vUv * uGrid;
    vec2 id = floor(cell);
    vec2 local = fract(cell) - 0.5;
    // LEDs por pixel da tela. Perto (LED com vários pixels) os diodos aparecem; quando o
    // LED fica menor que o pixel a máscara vira 1 — sem moiré, sem escurecer de longe.
    vec2 lpp = fwidth(cell);
    float ledsPerPixel = max(lpp.x, lpp.y);
    float near = 1.0 - smoothstep(0.35, 0.95, ledsPerPixel);

    // Troca em cascata, linha a linha de LED, de cima pra baixo.
    float row = 1.0 - (id.y + 0.5) / uGrid.y;
    float swap = clamp(uMix * 1.4 - row * 0.4, 0.0, 1.0);
    // Imagem em cima (quadrada), nome embaixo: as duas no mesmo passo de LED. Amostra as
    // duas e escolhe por step (texture2D dentro de if quebra o mip na borda).
    vec2 imageUv = vec2(vUv.x, (vUv.y - uSplit) / (1.0 - uSplit));
    vec3 color = mix(texture2D(uMapA, imageUv).rgb, texture2D(uMapB, imageUv).rgb, swap);
    // Fundo da faixa = texel do canto da imagem da vez (fundo dela; troca junto na cascata).
    // Coord constante = derivada 0 = mip 0: cor exata do texel.
    vec2 corner = vec2(0.5) / uGrid.x;
    vec3 background = mix(texture2D(uMapA, corner).rgb, texture2D(uMapB, corner).rgb, swap);
    vec4 label = texture2D(uLabel, vec2(vUv.x, vUv.y / max(uSplit, 1e-4)));
    color = mix(color, background * (1.0 - label.a) + label.rgb, 1.0 - step(uSplit, vUv.y));

    // Diodo: quadrado arredondado aceso + luz que vaza no louver preto em volta.
    vec2 q = abs(local) - 0.2;
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.13;
    float aa = max(ledsPerPixel, 0.02);
    float diode = 1.0 - smoothstep(-aa, aa, sd);
    float mask = max(diode, exp(-max(sd, 0.0) * 9.0) * 0.32);
    // Calibragem levemente diferente por LED e por módulo de 16×16 (só de perto).
    float jitter = 1.0 + ((hash12(id) - 0.5) * 0.06 + (hash12(floor(id / 16.0) + 7.0) - 0.5) * 0.05) * near;
    vec3 emitted = color * mix(1.0, mask, near) * jitter;

    // LED perde brilho fora do eixo; o painel preto reflete o céu de raspão.
    float facing = clamp(dot(normalize(vViewNormal), normalize(-vViewPosition)), 0.0, 1.0);
    float angular = mix(0.5, 1.0, smoothstep(0.08, 0.6, facing));
    float fresnel = pow(1.0 - facing, 5.0);
    vec3 panel = vec3(0.0035, 0.0038, 0.0045) + vec3(0.006, 0.0068, 0.0078) * uDaylight;
    vec3 sheen = vec3(0.30, 0.34, 0.40) * fresnel * (0.25 + 0.75 * uDaylight);
    gl_FragColor = vec4(panel + sheen + emitted * angular * mix(0.9, 1.0, uDaylight), uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const SPILL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const SPILL_FRAGMENT = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uMix;
  uniform float uOpacity;
  uniform float uCore; // meio lado do gabinete em UV do clarão
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    // Distância até a borda do gabinete: some em ~meio lado, sem borda dura.
    vec2 q = abs(vUv - 0.5) - uCore;
    float d = length(max(q, 0.0));
    float glow = exp(-d * 9.0) * (1.0 - smoothstep(0.38, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5))));
    gl_FragColor = vec4(mix(uColorA, uColorB, uMix) * glow * 0.55 * uOpacity, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function createFaceMaterial(texture: THREE.Texture, labeled: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uMapA: { value: texture },
      uMapB: { value: texture },
      uLabel: { value: BLANK },
      uSplit: { value: labeled ? LED_SCREEN_LABEL_ROWS / (LED_SCREEN_GRID + LED_SCREEN_LABEL_ROWS) : 0 },
      uMix: { value: 0 },
      uOpacity: { value: 1 },
      uDaylight: DAYLIGHT,
      uGrid: labeled ? GRID_LABELED : GRID,
    },
    vertexShader: FACE_VERTEX,
    fragmentShader: FACE_FRAGMENT,
    fog: true,
    // Emissivo: mostra a cor da imagem, não a do ACES da cena.
    toneMapped: false,
  });
}

function createSpillMaterial(texture: ScreenTexture, core: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uColorA: { value: texture.userData.average },
      uColorB: { value: texture.userData.average },
      uMix: { value: 0 },
      uOpacity: { value: 1 },
      uCore: { value: core },
    },
    vertexShader: SPILL_VERTEX,
    fragmentShader: SPILL_FRAGMENT,
    fog: true,
    toneMapped: false,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * Telão na fachada `side`. Group na BASE do edifício (y = 0 no chão), como o LED de
 * arestas. null = sem imagem válida ou fachada sem trecho plano que caiba um telão.
 * `label`: faixa do nome embaixo da imagem (texto, ou promessa dele: getScreenLabelText).
 * Com faixa o gabinete já nasce alto; o texto entra quando chega.
 */
export function createLedScreenMesh(
  params: LedScreenParams & { imageUrls: readonly string[]; label?: string | Promise<string | null> | null },
): LedScreenEntry | null {
  if (params.imageUrls.length === 0) return null;
  const labeled = params.label != null;
  const placement = computeLedScreenPlacement({ ...params, labeled });
  if (!placement) return null;
  const { size, centerY, normal, tangent, centerT, faceDist } = placement;

  const bezel = THREE.MathUtils.clamp(size * 0.022, 0.01, 0.04);
  const active = size - bezel * 2;
  // Altura ativa no passo do LED da largura: fileiras da faixa do mesmo tamanho das da imagem.
  const activeHeight = labeled ? active * LABEL_ASPECT : active;
  const cabinet = activeHeight + bezel * 2;
  const thickness = THREE.MathUtils.clamp(size * 0.045, 0.025, 0.07);
  const backDist = faceDist + THREE.MathUtils.clamp(size * 0.015, 0.012, 0.03);
  const frontDist = backDist + thickness;

  // Frame local: X = tangente, Y = altura, Z = normal. `mount` gira pro yaw da fachada.
  const parts: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(size, cabinet, thickness).translate(centerT, centerY, backDist + thickness / 2),
  ];
  // Braços: dois em cima, dois embaixo, do fundo do gabinete até a parede.
  const arm = THREE.MathUtils.clamp(size * 0.03, 0.018, 0.045);
  const overlap = 0.008;
  for (const rowY of [centerY + cabinet * 0.34, centerY - cabinet * 0.34]) {
    const points = getFacadePolygonAt(params.shape, params.width, params.depth, params.height, rowY, params.side);
    if (!points) continue;
    for (const u of [-size * 0.32, size * 0.32]) {
      const wall = depthAlong(points, normal, tangent, centerT + u);
      if (wall === null || backDist - wall < 0.004) continue;
      const length = backDist - wall + overlap * 2;
      parts.push(new THREE.BoxGeometry(arm, arm, length).translate(centerT + u, rowY, wall - overlap + length / 2));
    }
  }
  const frameGeometry = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();

  const textures = params.imageUrls.map(getScreenTexture);
  const material = createFaceMaterial(textures[0], labeled);
  const setLabel = (text: string | null) => {
    if (text) material.uniforms.uLabel.value = getLabelTexture(text);
  };
  if (typeof params.label === "string") setLabel(params.label);
  else params.label?.then(setLabel);
  const spillMaterial = createSpillMaterial(textures[0], (size / 2) / (size * SPILL_SCALE));

  const frame = new THREE.Mesh(frameGeometry, FRAME_MATERIAL);
  frame.name = "ledScreenFrame";
  const face = new THREE.Mesh(UNIT_PLANE, material);
  face.name = "ledScreenFace";
  face.scale.set(active, activeHeight, 1);
  face.position.set(centerT, centerY, frontDist + FACE_GAP);
  // Clarão na parede, atrás do gabinete. Só de noite.
  const spill = new THREE.Mesh(UNIT_PLANE, spillMaterial);
  spill.name = "ledScreenSpill";
  spill.scale.set(size * SPILL_SCALE, cabinet * SPILL_SCALE, 1);
  spill.position.set(centerT, centerY, faceDist + 0.006);
  spill.renderOrder = 5;
  spill.visible = nightMode;

  const mount = new THREE.Group();
  mount.rotation.y = placement.yaw;
  mount.add(spill, frame, face);
  const group = new THREE.Group();
  group.name = "ledScreen";
  group.add(mount);
  return { group, frame, face, spill, material, spillMaterial, textures, slide: -1, fade: 1 };
}

/**
 * Avança o ciclo. Relógio global: todos os telões trocam juntos, então a cidade só
 * redesenha durante a cascata (0,8 s a cada 7 s), não uma vez por telão. true = mudou.
 */
export function tickLedScreen(entry: LedScreenEntry, elapsedSeconds: number): boolean {
  const count = entry.textures.length;
  if (count < 2) return false;
  const slide = Math.floor(elapsedSeconds / LED_SCREEN_SLIDE_SECONDS);
  const fade = Math.min(1, (elapsedSeconds - slide * LED_SCREEN_SLIDE_SECONDS) / LED_SCREEN_FADE_SECONDS);
  if (slide === entry.slide && fade === entry.fade) return false;
  if (slide !== entry.slide) {
    const previous = entry.textures[(((slide - 1) % count) + count) % count] as ScreenTexture;
    const next = entry.textures[((slide % count) + count) % count] as ScreenTexture;
    entry.material.uniforms.uMapA.value = previous;
    entry.material.uniforms.uMapB.value = next;
    entry.spillMaterial.uniforms.uColorA.value = previous.userData.average;
    entry.spillMaterial.uniforms.uColorB.value = next.userData.average;
  }
  entry.slide = slide;
  entry.fade = fade;
  entry.material.uniforms.uMix.value = fade;
  entry.spillMaterial.uniforms.uMix.value = fade;
  return true;
}

/** Foco sem composição HDR: o painel esmaece pelo uniform (clone duplicaria as texturas). */
export function setLedScreenOpacity(entry: LedScreenEntry, opacity: number): void {
  entry.material.uniforms.uOpacity.value = opacity;
  entry.spillMaterial.uniforms.uOpacity.value = opacity;
  entry.material.transparent = opacity < 1;
  entry.material.depthWrite = opacity >= 1;
}

/** Noite: preto mais fundo, brilho um pouco menor e clarão na parede. Vale pra todos. */
export function setLedScreenNight(entries: Iterable<LedScreenEntry>, night: boolean): void {
  nightMode = night;
  DAYLIGHT.value = night ? 0 : 1;
  for (const entry of entries) entry.spill.visible = night;
}

/** Só o que é do telão: geometria do gabinete e materiais. Texturas e plano são do módulo. */
export function disposeLedScreenMesh(entry: LedScreenEntry): void {
  entry.frame.geometry.dispose();
  entry.material.dispose();
  entry.spillMaterial.dispose();
}

export function disposeLedScreenSharedResources(): void {
  for (const texture of textureCache.values()) texture.dispose();
  textureCache.clear();
  for (const texture of labelCache.values()) texture.dispose();
  labelCache.clear();
  BLANK.dispose();
  UNIT_PLANE.dispose();
  FRAME_MATERIAL.dispose();
}
