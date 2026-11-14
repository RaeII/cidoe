import * as THREE from "three";
import { mergeGeometries, mergeGroups } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingShape } from "../types";
import {
  createTwistedBuildingMesh,
  disposeTwistedBuildingSharedResources,
} from "./createTwistedBuildingMesh";
import {
  createOctagonalBuildingMesh,
  disposeOctagonalBuildingSharedResources,
} from "./createOctagonalBuildingMesh";
import {
  createSetbackBuildingMesh,
  disposeSetbackBuildingSharedResources,
} from "./createSetbackBuildingMesh";
import {
  createTaperedBuildingMesh,
  disposeTaperedBuildingSharedResources,
} from "./createTaperedBuildingMesh";
import {
  createChryslerBuildingMesh,
  disposeChryslerBuildingSharedResources,
} from "./createChryslerBuildingMesh";
import {
  createHearstBuildingMesh,
  disposeHearstBuildingSharedResources,
} from "./createHearstBuildingMesh";
import {
  createEmpireBuildingMesh,
  disposeEmpireBuildingSharedResources,
  getEmpireTierFootprints,
} from "./createEmpireBuildingMesh";
import {
  createTaipeiBuildingMesh,
  disposeTaipeiBuildingSharedResources,
  getTaipeiTierFootprints,
} from "./createTaipeiBuildingMesh";
import {
  createOneTradeBuildingMesh,
  disposeOneTradeBuildingSharedResources,
  getOneTradeTierFootprints,
} from "./createOneTradeBuildingMesh";

import {
  createYachthouseBuildingMesh,
  disposeYachthouseBuildingSharedResources,
  YACHTHOUSE_FLOOR_KIT,
} from "./createYachthouseBuildingMesh";
import {
  createResidentialBuildingMesh,
  disposeResidentialBuildingSharedResources,
  RESIDENTIAL_FLOOR_KIT,
} from "./createResidentialBuildingMesh";
import {
  createApartmentBuildingMesh,
  disposeApartmentBuildingSharedResources,
  APARTMENT_FLOOR_KIT,
} from "./createApartmentBuildingMesh";
import {
  createGourmetBuildingMesh,
  disposeGourmetBuildingSharedResources,
  GOURMET_FLOOR_KIT,
} from "./createGourmetBuildingMesh";
import {
  createLoftBuildingMesh,
  disposeLoftBuildingSharedResources,
  LOFT_FLOOR_KIT,
} from "./createLoftBuildingMesh";
import { disposeFloorKits, getFloorKit, type FloorKit, type FloorKitSpec } from "./createBuildingFloorKit";

type ShapeMeshBuilder = (
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
) => THREE.Mesh;

/**
 * Formato -> builder. Todo builder devolve Mesh 1×1×1 com 2 slots de material
 * (0 = fachada, 1 = topo) — o chamador escala. `default` fica fora do mapa:
 * usa a caixa de `createUnitBuildingGeometry`.
 */
const SHAPE_BUILDERS: Record<Exclude<BuildingShape, "default">, ShapeMeshBuilder> = {
  twisted: createTwistedBuildingMesh,
  octagonal: createOctagonalBuildingMesh,
  setback: createSetbackBuildingMesh,
  tapered: createTaperedBuildingMesh,
  chrysler: createChryslerBuildingMesh,
  hearst: createHearstBuildingMesh,
  empire: createEmpireBuildingMesh,
  taipei: createTaipeiBuildingMesh,
  "one-trade": createOneTradeBuildingMesh,
  yachthouse: createYachthouseBuildingMesh,
  residential: createResidentialBuildingMesh,
  apartment: createApartmentBuildingMesh,
  gourmet: createGourmetBuildingMesh,
  loft: createLoftBuildingMesh,
};

// Formatos com andares: a cena instancia módulos em vez da geometria por altura.
const FLOOR_KIT_SPECS: Partial<Record<BuildingShape, FloorKitSpec>> = {
  yachthouse: YACHTHOUSE_FLOOR_KIT,
  residential: RESIDENTIAL_FLOOR_KIT,
  apartment: APARTMENT_FLOOR_KIT,
  gourmet: GOURMET_FLOOR_KIT,
  loft: LOFT_FLOOR_KIT,
};

/** Kit modular do formato com andares; null = formato de geometria única. */
export function getBuildingShapeFloorKit(shape: BuildingShape): FloorKit | null {
  const spec = FLOOR_KIT_SPECS[shape];
  return spec ? getFloorKit(spec) : null;
}

const geometryBatches = new WeakMap<THREE.BufferGeometry, {
  original: THREE.BufferGeometry;
  batched: THREE.BufferGeometry;
}>();

/** Alterna os índices em cache; o manager escolhe o agrupamento conforme o estado de foco. */
export function setBuildingShapeMeshBatching(mesh: THREE.Mesh, enabled: boolean): void {
  const pair = geometryBatches.get(mesh.geometry);
  if (pair) mesh.geometry = enabled ? pair.batched : pair.original;
}

/** Toda key de formato conhecida pelo front (inclui `default`). */
export const BUILDING_SHAPES = ["default", ...Object.keys(SHAPE_BUILDERS)] as BuildingShape[];

/** Guard pra keys vindas do catálogo (banco pode ter opção sem builder). */
export function isBuildingShape(key: string): key is BuildingShape {
  return key === "default" || key in SHAPE_BUILDERS;
}

/**
 * BoxGeometry nasce com 6 grupos (um por face). Reordena os índices para
 * fachada/base e topo virarem só 2 grupos, mesmo usando 2 materiais.
 */
export function groupBoxGeometryByTop(
  geometry: THREE.BoxGeometry,
  sideMaterialIndex: number,
  topMaterialIndex: number,
): void {
  const index = geometry.index;
  if (!index) return;

  const sideIndices: number[] = [];
  const topIndices: number[] = [];
  for (const group of geometry.groups) {
    const target = group.materialIndex === 2 ? topIndices : sideIndices;
    for (let i = group.start; i < group.start + group.count; i++) {
      target.push(index.getX(i));
    }
  }

  geometry.setIndex([...sideIndices, ...topIndices]);
  geometry.clearGroups();
  geometry.addGroup(0, sideIndices.length, sideMaterialIndex);
  geometry.addGroup(sideIndices.length, topIndices.length, topMaterialIndex);
}

/**
 * Caixa 1×1×1 do formato `default`: grupos remapeados (topo = material 1, resto
 * = 0) + atributos de projeção que o shader triplanar consome. Devolve instância
 * nova — quem cria descarta.
 */
export function createUnitBuildingGeometry(): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  groupBoxGeometryByTop(geometry, 0, 1);
  // Cópia da posição/normal axis-aligned. Geometria torcida sobrescreve esses
  // atributos com os valores PRÉ-twist (ver createTwistedBuildingMesh).
  geometry.setAttribute(
    "aProjPosition",
    new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.array), 3),
  );
  geometry.setAttribute(
    "aProjNormal",
    new THREE.BufferAttribute(new Float32Array(geometry.attributes.normal.array), 3),
  );
  return geometry;
}

// Formatos pesados (7–28 mil triângulos): patamares que o LED/letreiro já usam viram a
// silhueta do edifício distante. Os demais formatos são leves — sem LOD.
const LOD_TIERS: Partial<Record<BuildingShape, () => Array<{
  bottomY: number; topY: number; width: number; depth: number;
}>>> = {
  empire: getEmpireTierFootprints,
  taipei: getTaipeiTierFootprints,
  "one-trade": getOneTradeTierFootprints,
};
const lodGeometries = new Map<BuildingShape, THREE.BufferGeometry>();

/**
 * Silhueta barata do formato (uma caixa por patamar, grupos fachada = 0 e topo = 1) para o
 * edifício distante; null = formato leve. Hearst é uma caixa chanfrada: usa `defaultGeometry`.
 */
export function getBuildingShapeLodGeometry(
  shape: BuildingShape,
  defaultGeometry: THREE.BufferGeometry,
): THREE.BufferGeometry | null {
  if (shape === "hearst") return defaultGeometry;
  const tiers = LOD_TIERS[shape];
  if (!tiers) return null;
  let geometry = lodGeometries.get(shape);
  if (!geometry) {
    const boxes = tiers().map(({ bottomY, topY, width, depth }) => {
      const box = new THREE.BoxGeometry(width, topY - bottomY, depth);
      box.translate(0, (bottomY + topY) / 2 - 0.5, 0);
      return box;
    });
    geometry = mergeGeometries(boxes, false);
    for (const box of boxes) box.dispose();
    // Face voltada pra cima = topo; o resto é fachada. Dois grupos = dois draw calls.
    const index = geometry.index!;
    const normal = geometry.getAttribute("normal");
    const side: number[] = [];
    const top: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const target = normal.getY(index.getX(i)) > 0.5 ? top : side;
      target.push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
    geometry.setIndex([...side, ...top]);
    geometry.addGroup(0, side.length, 0);
    geometry.addGroup(side.length, top.length, 1);
    geometry.setAttribute("aProjPosition", geometry.getAttribute("position"));
    geometry.setAttribute("aProjNormal", geometry.getAttribute("normal"));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    lodGeometries.set(shape, geometry);
  }
  return geometry;
}

/**
 * Mesh do formato pedido. `defaultGeometry` só é usada quando shape = `default`
 * (o chamador reaproveita a geometria que já tem em mãos).
 */
export function createBuildingShapeMesh(
  shape: BuildingShape,
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
  defaultGeometry: THREE.BufferGeometry,
): THREE.Mesh {
  if (shape === "default") {
    return new THREE.Mesh(defaultGeometry, [facadeMaterial, topMaterial]);
  }
  const mesh = SHAPE_BUILDERS[shape](facadeMaterial, topMaterial);
  const geometry = mesh.geometry;
  if (
    !geometryBatches.has(geometry) &&
    geometry.groups.length > new Set(geometry.groups.map((group) => group.materialIndex)).size
  ) {
    // Só índice/grupos novos: posições, normais e UVs compartilham os buffers originais.
    const batched = new THREE.BufferGeometry();
    batched.attributes = { ...geometry.attributes };
    batched.setIndex(geometry.index);
    batched.groups = geometry.groups.map((group) => ({ ...group }));
    batched.boundingBox = geometry.boundingBox;
    batched.boundingSphere = geometry.boundingSphere;
    mergeGroups(batched);
    const pair = { original: geometry, batched };
    geometryBatches.set(geometry, pair);
    geometryBatches.set(batched, pair);
    geometry.addEventListener("dispose", () => {
      batched.dispose();
      geometryBatches.delete(geometry);
      geometryBatches.delete(batched);
    });
  }
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  setBuildingShapeMeshBatching(mesh, materials.every((material) => !material.transparent));
  return mesh;
}

/** Descarta as geometrias compartilhadas (cache module-level) de todos os formatos. */
export function disposeBuildingShapeSharedResources(): void {
  disposeFloorKits();
  for (const geometry of lodGeometries.values()) geometry.dispose();
  lodGeometries.clear();
  disposeTwistedBuildingSharedResources();
  disposeOctagonalBuildingSharedResources();
  disposeSetbackBuildingSharedResources();
  disposeTaperedBuildingSharedResources();
  disposeChryslerBuildingSharedResources();
  disposeHearstBuildingSharedResources();
  disposeEmpireBuildingSharedResources();
  disposeTaipeiBuildingSharedResources();
  disposeOneTradeBuildingSharedResources();
  disposeYachthouseBuildingSharedResources();
  disposeResidentialBuildingSharedResources();
  disposeApartmentBuildingSharedResources();
  disposeGourmetBuildingSharedResources();
  disposeLoftBuildingSharedResources();
}
