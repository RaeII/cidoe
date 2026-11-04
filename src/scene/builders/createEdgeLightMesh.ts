import * as THREE from "three";
import type { BuildingShape, EdgeLightType } from "../types";
import { getChryslerTierFootprints } from "./createChryslerBuildingMesh";
import { getEmpireTierFootprints } from "./createEmpireBuildingMesh";
import {
  HEARST_RING_COUNT,
  getHearstRingFootprintPoints,
} from "./createHearstBuildingMesh";
import { getOctagonalFootprintPoints } from "./createOctagonalBuildingMesh";
import { getOneTradeLedFootprintRings } from "./createOneTradeBuildingMesh";
import { getSetbackTierFootprints } from "./createSetbackBuildingMesh";
import { getTaipeiTierFootprints } from "./createTaipeiBuildingMesh";
import { getResidentialTierFootprints } from "./createResidentialBuildingMesh";
import { getApartmentTierFootprints } from "./createApartmentBuildingMesh";
import { getGourmetTierFootprints } from "./createGourmetBuildingMesh";
import { getLoftTierFootprints } from "./createLoftBuildingMesh";
import { getTaperedFootprintScaleAtHeightRatio } from "./createTaperedBuildingMesh";
import { TWIST_TOTAL_ANGLE } from "./createTwistedBuildingMesh";
import { getYachthouseTowerFootprints } from "./createYachthouseBuildingMesh";

type EdgeLightFootprint = {
  width: number;
  depth: number;
  height: number;
};

// Quantidade de segmentos verticais para acompanhar a curva torcida.
// 12 já dá uma curva suficientemente suave. A geometria do prédio usa 24 — é seguro
// usar metade pois o LED é fino e a aproximação por segmentos curtos é menos visível.
// Segmentos são instanciados (3 draw calls no total), então o custo de mais
// segmentos é só matriz extra, não draw call.
const LED_TWIST_SEGMENTS = 12;
const LED_TAPER_SEGMENTS = 12;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export const DEFAULT_EDGE_LIGHT_COLOR = "#ffca57";
export const DEFAULT_EDGE_LIGHT_INTENSITY = 10;
export const DEFAULT_EDGE_LIGHT_DISTANCE = 0.04;
export const DEFAULT_EDGE_LIGHT_THICKNESS = 0.05;

// Derrame de luz do LED nos edifícios VIZINHOS (PointLight real, ver
// createDonationManager). Separado da emissão da fita: a fita sai do reflexo,
// a luz continua. Knobs de calibração — ajustar olhando a cena, não no papel.
export const EDGE_LIGHT_SPILL_INTENSITY = 70;
export const EDGE_LIGHT_SPILL_RANGE = 26;
export const EDGE_LIGHT_SPILL_POOL_SIZE = 8;

type EdgeLightFactory = (
  footprint: EdgeLightFootprint,
  shape: BuildingShape,
) => THREE.Group;

const TOP_LIFT = 0.05;
const HALO_OPACITY = 0.55;
const HALO_OUTER_OPACITY = 0.22;

// Geometria sólida para o core (sem gradiente).
const EDGE_CORE_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

/**
 * Cria BoxGeometry(1×1×1) com vertex colors RGBA cujo alpha faz gradiente radial
 * suave nas duas axes perpendiculares ao eixo principal da aresta.
 * alpha = 1.0 no centro (dist=0), alpha = 0.0 na borda (dist=0.5 em coords locais).
 * Usado pelos halos para que a luz se dissipe sem borda visível.
 */
function createGradientHaloGeometry(
  fade1: "x" | "y" | "z",
  fade2: "x" | "y" | "z",
): THREE.BoxGeometry {
  const SEG = 10; // subdivisões nas axes de fade para suavidade
  const wx = fade1 === "x" || fade2 === "x" ? SEG : 1;
  const hy = fade1 === "y" || fade2 === "y" ? SEG : 1;
  const dz = fade1 === "z" || fade2 === "z" ? SEG : 1;

  const geo = new THREE.BoxGeometry(1, 1, 1, wx, hy, dz);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const colors = new Float32Array(count * 4);

  const getComp: Record<"x" | "y" | "z", (i: number) => number> = {
    x: (i) => pos.getX(i),
    y: (i) => pos.getY(i),
    z: (i) => pos.getZ(i),
  };

  for (let i = 0; i < count; i++) {
    // Distância normalizada [0,1] do centro nas axes de fade
    // Coord local está em [-0.5, 0.5], portanto ×2 → [0, 1]
    const d1 = Math.abs(getComp[fade1](i)) * 2;
    const d2 = Math.abs(getComp[fade2](i)) * 2;
    // Math.min garante que as faces laterais (onde uma das distâncias é 1) 
    // calculem o gradiente a partir do centro da face. (Math.max as tornava invisíveis)
    const dist = Math.min(d1, d2);
    
    const t = Math.min(1, dist);
    // Queda exponencial (pow) cria um efeito de dissipação de luz muito mais 
    // realista do que o smoothstep, que criava um núcleo "sólido" demais.
    const alpha = Math.pow(1 - t, 2.0);

    colors[i * 4] = 1;
    colors[i * 4 + 1] = 1;
    colors[i * 4 + 2] = 1;
    colors[i * 4 + 3] = alpha;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  return geo;
}

// Halo único com gradiente nas seções locais X/Z (eixo dominante = Y local).
// Arestas em qualquer direção usam quaternion Y→direção, o que permite desenhar
// TODOS os segmentos com uma única geometria — pré-requisito do instancing.
const HALO_GEO_XZ = createGradientHaloGeometry("x", "z");

const SHARED_EDGE_LIGHT_GEOMETRIES: THREE.BufferGeometry[] = [
  EDGE_CORE_GEOMETRY,
  HALO_GEO_XZ,
];

type EdgeMaterials = {
  core: THREE.MeshStandardMaterial;
  halo: THREE.MeshBasicMaterial;
  haloOuter: THREE.MeshBasicMaterial;
};

function createEdgeMaterials(color: string, intensity: number): EdgeMaterials {
  const colorObj = new THREE.Color(color);
  const haloColorObj = colorObj.clone().multiplyScalar(intensity / 4.0);

  const core = new THREE.MeshStandardMaterial({
    color: colorObj.clone(),
    emissive: colorObj.clone(),
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.0,
    toneMapped: true,
  });

  // vertexColors: true → o alpha dos vertex colors controla a dissolução do halo
  const halo = new THREE.MeshBasicMaterial({
    color: haloColorObj.clone(),
    transparent: true,
    opacity: HALO_OPACITY,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  const haloOuter = new THREE.MeshBasicMaterial({
    color: haloColorObj.clone(),
    transparent: true,
    opacity: HALO_OUTER_OPACITY,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  return { core, halo, haloOuter };
}

// Descrição de um segmento de aresta. Os segmentos são coletados primeiro e
// virados em 3 InstancedMesh no final — 3 draw calls por LED em vez de 3 por
// segmento (torre twisted: 156 meshes → 3).
type SegmentSpec = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  distance: number;
  thickness: number;
};

const AXIS_QUATERNIONS: Record<"x" | "y" | "z", THREE.Quaternion> = {
  x: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, new THREE.Vector3(1, 0, 0)),
  y: new THREE.Quaternion(),
  z: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, new THREE.Vector3(0, 0, 1)),
};

/** Coleta uma aresta axis-aligned (rotação pré-computada por eixo). */
function addEdgeSegment(
  segments: SegmentSpec[],
  position: THREE.Vector3,
  axis: "x" | "y" | "z",
  length: number,
  distance: number,
  thickness: number,
): void {
  segments.push({
    position: position.clone(),
    quaternion: AXIS_QUATERNIONS[axis],
    length,
    distance,
    thickness,
  });
}

/**
 * Coleta um segmento de aresta orientado em direção arbitrária (torres torcidas,
 * afuniladas etc). O eixo Y local da geometria é alinhado ao vetor `direction`.
 */
function addOrientedEdgeSegment(
  segments: SegmentSpec[],
  center: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  distance: number,
  thickness: number,
): void {
  segments.push({
    position: center.clone(),
    quaternion: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction),
    length,
    distance,
    thickness,
  });
}

/** Converte os specs coletados em 3 InstancedMesh (core + halo + haloOuter). */
function buildInstancedGroup(segments: SegmentSpec[]): THREE.Group {
  const group = new THREE.Group();
  const materials = createEdgeMaterials(DEFAULT_EDGE_LIGHT_COLOR, DEFAULT_EDGE_LIGHT_INTENSITY);
  group.userData.edgeLightMaterials = materials;

  const count = segments.length;
  const core = new THREE.InstancedMesh(EDGE_CORE_GEOMETRY, materials.core, count);
  const halo = new THREE.InstancedMesh(HALO_GEO_XZ, materials.halo, count);
  const haloOuter = new THREE.InstancedMesh(HALO_GEO_XZ, materials.haloOuter, count);
  halo.renderOrder = 1;
  haloOuter.renderOrder = 2;

  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const seg = segments[i];
    scale.set(seg.thickness, seg.length, seg.thickness);
    matrix.compose(seg.position, seg.quaternion, scale);
    core.setMatrixAt(i, matrix);
    scale.set(seg.distance, seg.length, seg.distance);
    matrix.compose(seg.position, seg.quaternion, scale);
    halo.setMatrixAt(i, matrix);
    scale.set(seg.distance * 3.4, seg.length, seg.distance * 3.4);
    matrix.compose(seg.position, seg.quaternion, scale);
    haloOuter.setMatrixAt(i, matrix);
  }
  core.computeBoundingSphere();
  halo.computeBoundingSphere();
  haloOuter.computeBoundingSphere();

  group.add(core, halo, haloOuter);
  return group;
}

function createLed(
  footprint: EdgeLightFootprint,
  shape: BuildingShape,
): THREE.Group {
  const segments: SegmentSpec[] = [];
  const { width, depth, height } = footprint;
  const halfW = width / 2;
  const halfD = depth / 2;

  if (shape === "yachthouse") {
    for (const { x, tiers } of getYachthouseTowerFootprints(width, depth, height)) {
      for (const tier of tiers) {
        const w = tier.width / 2;
        const d = tier.depth / 2;
        const y = tier.topY + TOP_LIFT;
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            addEdgeSegment(segments, new THREE.Vector3(x + sx * w, (tier.bottomY + tier.topY) / 2, sz * d),
              "y", tier.topY - tier.bottomY, DEFAULT_EDGE_LIGHT_DISTANCE, DEFAULT_EDGE_LIGHT_THICKNESS);
          }
          addEdgeSegment(segments, new THREE.Vector3(x + sx * w, y, 0),
            "z", d * 2, DEFAULT_EDGE_LIGHT_DISTANCE, DEFAULT_EDGE_LIGHT_THICKNESS);
          addEdgeSegment(segments, new THREE.Vector3(x, y, sx * d),
            "x", w * 2, DEFAULT_EDGE_LIGHT_DISTANCE, DEFAULT_EDGE_LIGHT_THICKNESS);
        }
      }
    }
    return buildInstancedGroup(segments);
  }

  if (shape === "twisted") {
    // Cantos em unit-space (±0.5). A torção da geometria do edifício acontece
    // ANTES da aplicação do `mesh.scale` (ver createTwistedBuildingMesh), logo
    // o canto unit é rotacionado primeiro e só então multiplicado por width/depth.
    // Fazer o contrário (rotacionar valores já escalados) troca os eixos X↔Z
    // quando width ≠ depth — o LED fica desencaixado do edifício.
    const unitCorners: Array<[number, number]> = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ];

    // Cada canto vertical vira uma sequência de segmentos curtos acompanhando
    // a curva da torção. Ângulo na altura y é proporcional a y/height —
    // mesma fórmula que `createTwistedBuildingMesh` (onde
    // angle = (y_local + 0.5) * TWIST_TOTAL_ANGLE com y_local em [-0.5, 0.5]).
    const tmpDir = new THREE.Vector3();
    for (const [ux, uz] of unitCorners) {
      for (let i = 0; i < LED_TWIST_SEGMENTS; i++) {
        const y0 = (i / LED_TWIST_SEGMENTS) * height;
        const y1 = ((i + 1) / LED_TWIST_SEGMENTS) * height;
        const a0 = (y0 / height) * TWIST_TOTAL_ANGLE;
        const a1 = (y1 / height) * TWIST_TOTAL_ANGLE;
        const x0 = (ux * Math.cos(a0) - uz * Math.sin(a0)) * width;
        const z0 = (ux * Math.sin(a0) + uz * Math.cos(a0)) * depth;
        const x1 = (ux * Math.cos(a1) - uz * Math.sin(a1)) * width;
        const z1 = (ux * Math.sin(a1) + uz * Math.cos(a1)) * depth;

        const cx_avg = (x0 + x1) / 2;
        const cy_avg = (y0 + y1) / 2;
        const cz_avg = (z0 + z1) / 2;
        tmpDir.set(x1 - x0, y1 - y0, z1 - z0);
        const segLen = tmpDir.length();
        tmpDir.divideScalar(segLen); // normaliza in-place

        addOrientedEdgeSegment(
          segments,
          new THREE.Vector3(cx_avg, cy_avg, cz_avg),
          tmpDir.clone(),
          segLen,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
    }

    // Retângulo do topo: cantos unit rotacionados pelo ângulo total e então escalados.
    const topAngle = TWIST_TOTAL_ANGLE;
    const topY = height + TOP_LIFT;
    const cosA = Math.cos(topAngle);
    const sinA = Math.sin(topAngle);
    const topCorners = unitCorners.map(([ux, uz]) => ({
      x: (ux * cosA - uz * sinA) * width,
      z: (ux * sinA + uz * cosA) * depth,
    }));
    for (let i = 0; i < topCorners.length; i++) {
      const a = topCorners[i];
      const b = topCorners[(i + 1) % topCorners.length];
      const center = new THREE.Vector3((a.x + b.x) / 2, topY, (a.z + b.z) / 2);
      const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
      const len = dir.length();
      dir.divideScalar(len);
      addOrientedEdgeSegment(
        segments,
        center,
        dir,
        len,
        DEFAULT_EDGE_LIGHT_DISTANCE,
        DEFAULT_EDGE_LIGHT_THICKNESS,
      );
    }

    return buildInstancedGroup(segments);
  }

  if (shape === "setback") {
    const tiers = getSetbackTierFootprints(width, depth, height);

    for (const tier of tiers) {
      const halfW = tier.width / 2;
      const halfD = tier.depth / 2;
      const segmentHeight = tier.topY - tier.bottomY;
      const centerY = tier.bottomY + segmentHeight / 2;
      const corners: Array<[number, number]> = [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, halfD],
        [-halfW, halfD],
      ];

      for (const [x, z] of corners) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(x, centerY, z),
          "y",
          segmentHeight,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }

      const topY = tier.topY + TOP_LIFT;
      for (const z of [-halfD, halfD]) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(0, topY, z),
          "x",
          tier.width,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
      for (const x of [-halfW, halfW]) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(x, topY, 0),
          "z",
          tier.depth,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
    }

    return buildInstancedGroup(segments);
  }

  if (shape === "octagonal") {
    const corners = getOctagonalFootprintPoints(width, depth);

    for (const { x, z } of corners) {
      addEdgeSegment(
        segments,
        new THREE.Vector3(x, height / 2, z),
        "y",
        height,
        DEFAULT_EDGE_LIGHT_DISTANCE,
        DEFAULT_EDGE_LIGHT_THICKNESS,
      );
    }

    const topY = height + TOP_LIFT;
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      const center = new THREE.Vector3((a.x + b.x) / 2, topY, (a.z + b.z) / 2);
      const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
      const len = dir.length();
      dir.divideScalar(len);
      addOrientedEdgeSegment(
        segments,
        center,
        dir,
        len,
        DEFAULT_EDGE_LIGHT_DISTANCE,
        DEFAULT_EDGE_LIGHT_THICKNESS,
      );
    }

    return buildInstancedGroup(segments);
  }

  if (shape === "tapered") {
    const safeHeight = Math.max(height, 1e-6);
    const corners: Array<[number, number]> = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];

    const tmpDir = new THREE.Vector3();
    for (const [sx, sz] of corners) {
      for (let i = 0; i < LED_TAPER_SEGMENTS; i++) {
        const y0 = (i / LED_TAPER_SEGMENTS) * height;
        const y1 = ((i + 1) / LED_TAPER_SEGMENTS) * height;
        const s0 = getTaperedFootprintScaleAtHeightRatio(y0 / safeHeight);
        const s1 = getTaperedFootprintScaleAtHeightRatio(y1 / safeHeight);

        const x0 = sx * (width * s0) / 2;
        const z0 = sz * (depth * s0) / 2;
        const x1 = sx * (width * s1) / 2;
        const z1 = sz * (depth * s1) / 2;

        tmpDir.set(x1 - x0, y1 - y0, z1 - z0);
        const segmentLength = tmpDir.length();
        if (segmentLength <= 1e-6) continue;
        tmpDir.divideScalar(segmentLength);

        addOrientedEdgeSegment(
          segments,
          new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
          tmpDir.clone(),
          segmentLength,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
    }

    const topScale = getTaperedFootprintScaleAtHeightRatio(1);
    const topW = width * topScale;
    const topD = depth * topScale;
    const topY = height + TOP_LIFT;
    for (const z of [-topD / 2, topD / 2]) {
      addEdgeSegment(
        segments,
        new THREE.Vector3(0, topY, z),
        "x",
        topW,
        DEFAULT_EDGE_LIGHT_DISTANCE,
        DEFAULT_EDGE_LIGHT_THICKNESS,
      );
    }
    for (const x of [-topW / 2, topW / 2]) {
      addEdgeSegment(
        segments,
        new THREE.Vector3(x, topY, 0),
        "z",
        topD,
        DEFAULT_EDGE_LIGHT_DISTANCE,
        DEFAULT_EDGE_LIGHT_THICKNESS,
      );
    }

    return buildInstancedGroup(segments);
  }

  if (shape === "chrysler") {
    const tiers = getChryslerTierFootprints(width, depth, height);
    for (const tier of tiers) {
      const halfW = tier.width / 2;
      const halfD = tier.depth / 2;
      const segmentHeight = tier.topY - tier.bottomY;
      const centerY = tier.bottomY + segmentHeight / 2;
      const corners: Array<[number, number]> = [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, halfD],
        [-halfW, halfD],
      ];

      for (const [x, z] of corners) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(x, centerY, z),
          "y",
          segmentHeight,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }

      // Nos tiers de coroa, adiciona reforço horizontal extra para destacar
      // o escalonamento metálico do topo (leitura visual art déco).
      const topY = tier.topY + TOP_LIFT;
      for (const z of [-halfD, halfD]) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(0, topY, z),
          "x",
          tier.width,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
      for (const x of [-halfW, halfW]) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(x, topY, 0),
          "z",
          tier.depth,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
    }

    const crownTop = tiers[tiers.length - 1];
    if (crownTop) {
      const spireY0 = crownTop.topY + TOP_LIFT;
      const spireY1 = height + TOP_LIFT;
      const halfW = crownTop.width * 0.09;
      const halfD = crownTop.depth * 0.09;
      const spireLen = Math.max(0.05, spireY1 - spireY0);
      for (const [x, z] of [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, halfD],
        [-halfW, halfD],
      ] as Array<[number, number]>) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(x, spireY0 + spireLen / 2, z),
          "y",
          spireLen,
          DEFAULT_EDGE_LIGHT_DISTANCE * 0.85,
          DEFAULT_EDGE_LIGHT_THICKNESS * 0.8,
        );
      }
    }

    return buildInstancedGroup(segments);
  }

  if (shape === "empire") {
    const tiers = getEmpireTierFootprints(width, depth, height);
    for (const tier of tiers) {
      const halfW = tier.width / 2;
      const halfD = tier.depth / 2;
      const segmentHeight = tier.topY - tier.bottomY;
      const centerY = tier.bottomY + segmentHeight / 2;
      const corners: Array<[number, number]> = [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, halfD],
        [-halfW, halfD],
      ];

      for (const [x, z] of corners) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(x, centerY, z),
          "y",
          segmentHeight,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }

      const topY = tier.topY + TOP_LIFT;
      for (const z of [-halfD, halfD]) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(0, topY, z),
          "x",
          tier.width,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
      for (const x of [-halfW, halfW]) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(x, topY, 0),
          "z",
          tier.depth,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
    }

    return buildInstancedGroup(segments);
  }

  // Residenciais: corpo + casa de máquinas/caixa d'água, mesmo contorno por tier.
  if (shape === "taipei" || shape === "residential" || shape === "apartment" || shape === "gourmet" || shape === "loft") {
    const tiers = shape === "taipei"
      ? getTaipeiTierFootprints(width, depth, height)
      : shape === "residential"
        ? getResidentialTierFootprints(width, depth, height)
        : shape === "gourmet"
          ? getGourmetTierFootprints(width, depth, height)
          : shape === "loft"
            ? getLoftTierFootprints(width, depth, height)
            : getApartmentTierFootprints(width, depth, height);
    for (const tier of tiers) {
      const halfW = tier.width / 2;
      const halfD = tier.depth / 2;
      const segmentHeight = tier.topY - tier.bottomY;
      const centerY = tier.bottomY + segmentHeight / 2;
      const corners: Array<[number, number]> = [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, halfD],
        [-halfW, halfD],
      ];

      for (const [x, z] of corners) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(x, centerY, z),
          "y",
          segmentHeight,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }

      const topY = tier.topY + TOP_LIFT;
      for (const z of [-halfD, halfD]) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(0, topY, z),
          "x",
          tier.width,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
      for (const x of [-halfW, halfW]) {
        addEdgeSegment(
          segments,
          new THREE.Vector3(x, topY, 0),
          "z",
          tier.depth,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
    }

    return buildInstancedGroup(segments);
  }

  if (shape === "one-trade") {
    const rings = getOneTradeLedFootprintRings(width, depth, height);
    const tmpDir = new THREE.Vector3();

    for (let corner = 0; corner < rings[0].points.length; corner++) {
      for (let ring = 0; ring < rings.length - 1; ring++) {
        const current = rings[ring];
        const next = rings[ring + 1];
        if (Math.abs(next.y - current.y) <= 1e-6) continue;

        const a = current.points[corner];
        const b = next.points[corner];
        const start = new THREE.Vector3(a.x, current.y, a.z);
        const end = new THREE.Vector3(b.x, next.y, b.z);
        tmpDir.subVectors(end, start);
        const len = tmpDir.length();
        if (len <= 1e-6) continue;
        tmpDir.divideScalar(len);

        addOrientedEdgeSegment(
          segments,
          new THREE.Vector3().copy(start).add(end).multiplyScalar(0.5),
          tmpDir.clone(),
          len,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
    }

    for (const ring of [rings[1], rings[rings.length - 1]]) {
      const y = ring.y + TOP_LIFT;
      for (let i = 0; i < ring.points.length; i++) {
        const a = ring.points[i];
        const b = ring.points[(i + 1) % ring.points.length];
        const start = new THREE.Vector3(a.x, y, a.z);
        const end = new THREE.Vector3(b.x, y, b.z);
        tmpDir.subVectors(end, start);
        const len = tmpDir.length();
        if (len <= 1e-6) continue;
        tmpDir.divideScalar(len);

        addOrientedEdgeSegment(
          segments,
          new THREE.Vector3().copy(start).add(end).multiplyScalar(0.5),
          tmpDir.clone(),
          len,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
    }

    return buildInstancedGroup(segments);
  }

  if (shape === "hearst") {
    const rings = Array.from({ length: HEARST_RING_COUNT + 1 }, (_, ringIndex) => {
      const y = (ringIndex / HEARST_RING_COUNT) * height;
      return getHearstRingFootprintPoints(width, depth, ringIndex).map(
        ({ x, z }) => new THREE.Vector3(x, y, z),
      );
    });

    const tmpDir = new THREE.Vector3();
    for (let corner = 0; corner < rings[0].length; corner++) {
      for (let ring = 0; ring < HEARST_RING_COUNT; ring++) {
        const a = rings[ring][corner];
        const b = rings[ring + 1][corner];
        tmpDir.subVectors(b, a);
        const len = tmpDir.length();
        if (len <= 1e-6) continue;
        tmpDir.divideScalar(len);
        addOrientedEdgeSegment(
          segments,
          new THREE.Vector3().copy(a).add(b).multiplyScalar(0.5),
          tmpDir.clone(),
          len,
          DEFAULT_EDGE_LIGHT_DISTANCE,
          DEFAULT_EDGE_LIGHT_THICKNESS,
        );
      }
    }

    const top = rings[HEARST_RING_COUNT];
    const topLift = new THREE.Vector3(0, TOP_LIFT, 0);
    for (let i = 0; i < top.length; i++) {
      const a = new THREE.Vector3().copy(top[i]).add(topLift);
      const b = new THREE.Vector3().copy(top[(i + 1) % top.length]).add(topLift);
      tmpDir.subVectors(b, a);
      const len = tmpDir.length();
      if (len <= 1e-6) continue;
      tmpDir.divideScalar(len);
      addOrientedEdgeSegment(
        segments,
        new THREE.Vector3().copy(a).add(b).multiplyScalar(0.5),
        tmpDir.clone(),
        len,
        DEFAULT_EDGE_LIGHT_DISTANCE,
        DEFAULT_EDGE_LIGHT_THICKNESS,
      );
    }

    return buildInstancedGroup(segments);
  }

  // Caminho default: arestas axis-aligned (mais leves — 1 mesh por aresta).
  const corners: Array<[number, number]> = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];
  for (const [x, z] of corners) {
    addEdgeSegment(
      segments,
      new THREE.Vector3(x, height / 2, z),
      "y",
      height,
      DEFAULT_EDGE_LIGHT_DISTANCE,
      DEFAULT_EDGE_LIGHT_THICKNESS,
    );
  }

  // 4 arestas no topo (retângulo). Lift leve para não colidir com helipad/holofotes.
  const topY = height + TOP_LIFT;

  for (const z of [-halfD, halfD]) {
    addEdgeSegment(segments, new THREE.Vector3(0, topY, z), "x", width, DEFAULT_EDGE_LIGHT_DISTANCE, DEFAULT_EDGE_LIGHT_THICKNESS);
  }
  for (const x of [-halfW, halfW]) {
    addEdgeSegment(segments, new THREE.Vector3(x, topY, 0), "z", depth, DEFAULT_EDGE_LIGHT_DISTANCE, DEFAULT_EDGE_LIGHT_THICKNESS);
  }

  return buildInstancedGroup(segments);
}

const FACTORIES: Record<Exclude<EdgeLightType, "none">, EdgeLightFactory> = {
  led: createLed,
};

/** Guard pra keys vindas do catálogo (banco pode ter opção sem builder). */
export function isEdgeLightType(key: string): key is EdgeLightType {
  return key === "none" || key in FACTORIES;
}

/**
 * Cria um Group Three.js para o efeito de LED nas arestas do edifício.
 * O grupo deve ser posicionado na BASE do edifício (não no topo); local Y=0
 * corresponde ao chão, local Y=height ao topo.
 */
export function createEdgeLightMesh(
  type: EdgeLightType,
  footprint: EdgeLightFootprint,
  shape: BuildingShape = "default",
): THREE.Group | null {
  if (type === "none") return null;
  const mesh = FACTORIES[type](footprint, shape);
  mesh.userData.edgeLightType = type;
  return mesh;
}

/**
 * Libera materiais clonados e os buffers de instância deste grupo.
 * Geometrias base são compartilhadas no módulo.
 */
export function disposeEdgeLightMesh(group: THREE.Group): void {
  const materials = group.userData.edgeLightMaterials as EdgeMaterials | undefined;
  if (materials) {
    materials.core.dispose();
    materials.halo.dispose();
    materials.haloOuter.dispose();
  }
  for (const child of group.children) {
    if (child instanceof THREE.InstancedMesh) child.dispose();
  }
  group.clear();
}

/** Descarta recursos compartilhados. Chamar apenas no dispose final do manager. */
export function disposeEdgeLightSharedResources(): void {
  for (const geometry of SHARED_EDGE_LIGHT_GEOMETRIES) {
    geometry.dispose();
  }
}
