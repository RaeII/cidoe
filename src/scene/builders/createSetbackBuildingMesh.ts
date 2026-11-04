import * as THREE from "three";

type SetbackTier = {
  bottom: number;
  top: number;
  footprintScale: number;
};

export type SetbackTierFootprint = {
  bottomY: number;
  topY: number;
  width: number;
  depth: number;
};

const SETBACK_TIERS: SetbackTier[] = [
  { bottom: 0, top: 0.34, footprintScale: 1 },
  { bottom: 0.34, top: 0.68, footprintScale: 0.76 },
  { bottom: 0.68, top: 1, footprintScale: 0.54 },
];

let sharedSetbackGeometry: THREE.BufferGeometry | null = null;

export function getSetbackFootprintScaleAtHeightRatio(heightRatio: number): number {
  const clamped = Math.max(0, Math.min(1, heightRatio));
  const tier =
    SETBACK_TIERS.find(({ bottom, top }) => clamped >= bottom && clamped <= top) ??
    SETBACK_TIERS[SETBACK_TIERS.length - 1];
  return tier.footprintScale;
}

export function getSetbackTierFootprints(
  width = 1,
  depth = 1,
  height = 1,
): SetbackTierFootprint[] {
  return SETBACK_TIERS.map((tier) => ({
    bottomY: tier.bottom * height,
    topY: tier.top * height,
    width: width * tier.footprintScale,
    depth: depth * tier.footprintScale,
  }));
}

function pushVertex(
  positions: number[],
  normals: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  x: number,
  y: number,
  z: number,
  normal: THREE.Vector3,
): void {
  positions.push(x, y, z);
  normals.push(normal.x, normal.y, normal.z);
  projectionPositions.push(x, y, z);
  projectionNormals.push(normal.x, normal.y, normal.z);
}

function pushQuad(
  positions: number[],
  normals: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  corners: Array<[number, number, number]>,
  normal: THREE.Vector3,
): void {
  const order = [0, 1, 2, 0, 2, 3];
  for (const index of order) {
    const [x, y, z] = corners[index];
    pushVertex(
      positions,
      normals,
      projectionPositions,
      projectionNormals,
      x,
      y,
      z,
      normal,
    );
  }
}

function addVerticalTierFaces(
  positions: number[],
  normals: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  tier: SetbackTier,
): void {
  const halfW = tier.footprintScale / 2;
  const halfD = tier.footprintScale / 2;
  const y0 = tier.bottom - 0.5;
  const y1 = tier.top - 0.5;

  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [-halfW, y0, halfD],
      [halfW, y0, halfD],
      [halfW, y1, halfD],
      [-halfW, y1, halfD],
    ],
    new THREE.Vector3(0, 0, 1),
  );
  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [halfW, y0, -halfD],
      [-halfW, y0, -halfD],
      [-halfW, y1, -halfD],
      [halfW, y1, -halfD],
    ],
    new THREE.Vector3(0, 0, -1),
  );
  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [halfW, y0, halfD],
      [halfW, y0, -halfD],
      [halfW, y1, -halfD],
      [halfW, y1, halfD],
    ],
    new THREE.Vector3(1, 0, 0),
  );
  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [-halfW, y0, -halfD],
      [-halfW, y0, halfD],
      [-halfW, y1, halfD],
      [-halfW, y1, -halfD],
    ],
    new THREE.Vector3(-1, 0, 0),
  );
}

function addTopRect(
  positions: number[],
  normals: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  halfW: number,
  halfD: number,
  y: number,
): void {
  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [-halfW, y, -halfD],
      [-halfW, y, halfD],
      [halfW, y, halfD],
      [halfW, y, -halfD],
    ],
    new THREE.Vector3(0, 1, 0),
  );
}

function addTopRing(
  positions: number[],
  normals: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  outerScale: number,
  innerScale: number,
  y: number,
): void {
  const outerW = outerScale / 2;
  const outerD = outerScale / 2;
  const innerW = innerScale / 2;
  const innerD = innerScale / 2;
  const normal = new THREE.Vector3(0, 1, 0);

  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [-outerW, y, innerD],
      [-outerW, y, outerD],
      [outerW, y, outerD],
      [outerW, y, innerD],
    ],
    normal,
  );
  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [-outerW, y, -outerD],
      [-outerW, y, -innerD],
      [outerW, y, -innerD],
      [outerW, y, -outerD],
    ],
    normal,
  );
  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [innerW, y, -innerD],
      [innerW, y, innerD],
      [outerW, y, innerD],
      [outerW, y, -innerD],
    ],
    normal,
  );
  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [-outerW, y, -innerD],
      [-outerW, y, innerD],
      [-innerW, y, innerD],
      [-innerW, y, -innerD],
    ],
    normal,
  );
}

function buildSetbackGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const projectionPositions: number[] = [];
  const projectionNormals: number[] = [];

  const sideStart = 0;
  for (const tier of SETBACK_TIERS) {
    addVerticalTierFaces(
      positions,
      normals,
      projectionPositions,
      projectionNormals,
      tier,
    );
  }
  const sideCount = positions.length / 3 - sideStart;

  const topStart = positions.length / 3;
  for (let i = 0; i < SETBACK_TIERS.length - 1; i++) {
    const current = SETBACK_TIERS[i];
    const next = SETBACK_TIERS[i + 1];
    addTopRing(
      positions,
      normals,
      projectionPositions,
      projectionNormals,
      current.footprintScale,
      next.footprintScale,
      current.top - 0.5,
    );
  }
  const topTier = SETBACK_TIERS[SETBACK_TIERS.length - 1];
  addTopRect(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    topTier.footprintScale / 2,
    topTier.footprintScale / 2,
    0.5,
  );
  const topCount = positions.length / 3 - topStart;

  const bottomStart = positions.length / 3;
  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [-0.5, -0.5, 0.5],
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
    ],
    new THREE.Vector3(0, -1, 0),
  );
  const bottomCount = positions.length / 3 - bottomStart;

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(normals), 3),
  );
  geometry.setAttribute(
    "aProjPosition",
    new THREE.BufferAttribute(new Float32Array(projectionPositions), 3),
  );
  geometry.setAttribute(
    "aProjNormal",
    new THREE.BufferAttribute(new Float32Array(projectionNormals), 3),
  );

  geometry.addGroup(sideStart, sideCount, 0);
  geometry.addGroup(topStart, topCount, 1);
  geometry.addGroup(bottomStart, bottomCount, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function getSetbackGeometry(): THREE.BufferGeometry {
  if (!sharedSetbackGeometry) {
    sharedSetbackGeometry = buildSetbackGeometry();
  }
  return sharedSetbackGeometry;
}

export function createSetbackBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(getSetbackGeometry(), [facadeMaterial, topMaterial]);
  return mesh;
}

export function disposeSetbackBuildingSharedResources(): void {
  if (sharedSetbackGeometry) {
    sharedSetbackGeometry.dispose();
    sharedSetbackGeometry = null;
  }
}
