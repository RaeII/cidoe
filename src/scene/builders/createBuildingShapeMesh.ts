import * as THREE from "three";
import { mergeGroups } from "three/addons/utils/BufferGeometryUtils.js";
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
} from "./createEmpireBuildingMesh";
import {
  createTaipeiBuildingMesh,
  disposeTaipeiBuildingSharedResources,
} from "./createTaipeiBuildingMesh";
import {
  createOneTradeBuildingMesh,
  disposeOneTradeBuildingSharedResources,
} from "./createOneTradeBuildingMesh";

import {
  createYachthouseBuildingMesh,
  disposeYachthouseBuildingSharedResources,
} from "./createYachthouseBuildingMesh";
import {
  createResidentialBuildingMesh,
  disposeResidentialBuildingSharedResources,
} from "./createResidentialBuildingMesh";
import {
  createApartmentBuildingMesh,
  disposeApartmentBuildingSharedResources,
} from "./createApartmentBuildingMesh";
import {
  createGourmetBuildingMesh,
  disposeGourmetBuildingSharedResources,
} from "./createGourmetBuildingMesh";
import {
  createLoftBuildingMesh,
  disposeLoftBuildingSharedResources,
} from "./createLoftBuildingMesh";

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
