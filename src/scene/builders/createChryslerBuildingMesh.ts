import * as THREE from "three";

type ChryslerTier = {
  bottom: number;
  top: number;
  scale: number;
  crown?: boolean;
};

export type ChryslerTierFootprint = {
  bottomY: number;
  topY: number;
  width: number;
  depth: number;
  crown: boolean;
};

// Proporções inspiradas no Chrysler Building (Art Déco):
// base volumosa, torre afunilada por setbacks sucessivos, coroa metálica escalonada
// e pináculo central.
const CHRYSLER_TIERS: ChryslerTier[] = [
  { bottom: 0.0, top: 0.2, scale: 1.0 },
  { bottom: 0.2, top: 0.48, scale: 0.82 },
  { bottom: 0.48, top: 0.68, scale: 0.7 },
  { bottom: 0.68, top: 0.8, scale: 0.58 },
  { bottom: 0.8, top: 0.875, scale: 0.48, crown: true },
  { bottom: 0.875, top: 0.925, scale: 0.4, crown: true },
  { bottom: 0.925, top: 0.96, scale: 0.33, crown: true },
  { bottom: 0.96, top: 0.982, scale: 0.26, crown: true },
];

const SPIRE_BASE_RATIO = 0.982;
const SPIRE_BASE_SCALE = 0.18;

let sharedChryslerGeometry: THREE.BufferGeometry | null = null;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function getChryslerFootprintScaleAtHeightRatio(heightRatio: number): number {
  const y = clamp01(heightRatio);

  if (y >= SPIRE_BASE_RATIO) {
    const t = (y - SPIRE_BASE_RATIO) / (1 - SPIRE_BASE_RATIO);
    return THREE.MathUtils.lerp(SPIRE_BASE_SCALE, 0.02, t);
  }

  const tier =
    CHRYSLER_TIERS.find((entry) => y >= entry.bottom && y <= entry.top) ??
    CHRYSLER_TIERS[CHRYSLER_TIERS.length - 1];

  return tier.scale;
}

export function getChryslerTierFootprints(
  width = 1,
  depth = 1,
  height = 1,
): ChryslerTierFootprint[] {
  return CHRYSLER_TIERS.map((tier) => ({
    bottomY: tier.bottom * height,
    topY: tier.top * height,
    width: width * tier.scale,
    depth: depth * tier.scale,
    crown: tier.crown === true,
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
  projectionNormal: THREE.Vector3,
): void {
  positions.push(x, y, z);
  normals.push(normal.x, normal.y, normal.z);
  projectionPositions.push(x, y, z);
  projectionNormals.push(projectionNormal.x, projectionNormal.y, projectionNormal.z);
}

function pushQuad(
  positions: number[],
  normals: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  corners: Array<[number, number, number]>,
  normal: THREE.Vector3,
  projectionNormal: THREE.Vector3,
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
      projectionNormal,
    );
  }
}

function addTierVerticalFaces(
  positions: number[],
  normals: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  tier: ChryslerTier,
): void {
  const halfW = tier.scale / 2;
  const halfD = tier.scale / 2;
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
    new THREE.Vector3(-1, 0, 0),
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
    normal,
  );
}

function addTopRect(
  positions: number[],
  normals: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  scale: number,
  y: number,
): void {
  const half = scale / 2;
  const normal = new THREE.Vector3(0, 1, 0);

  pushQuad(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    [
      [-half, y, -half],
      [-half, y, half],
      [half, y, half],
      [half, y, -half],
    ],
    normal,
    normal,
  );
}

function addSpire(
  positions: number[],
  normals: number[],
  projectionPositions: number[],
  projectionNormals: number[],
): void {
  const baseY = SPIRE_BASE_RATIO - 0.5;
  const topY = 0.5;
  const half = SPIRE_BASE_SCALE / 2;
  const apex = new THREE.Vector3(0, topY, 0);

  const base: Array<[number, number, number]> = [
    [-half, baseY, -half],
    [half, baseY, -half],
    [half, baseY, half],
    [-half, baseY, half],
  ];

  for (let i = 0; i < 4; i++) {
    const current = new THREE.Vector3(base[i][0], base[i][1], base[i][2]);
    const nextBase = base[(i + 1) % 4];
    const next = new THREE.Vector3(nextBase[0], nextBase[1], nextBase[2]);

    const faceNormal = new THREE.Vector3()
      .subVectors(next, current)
      .cross(new THREE.Vector3().subVectors(apex, current))
      .normalize();

    const projectionNormal = new THREE.Vector3(
      Math.abs(faceNormal.x) >= Math.abs(faceNormal.z)
        ? Math.sign(faceNormal.x) || 1
        : 0,
      1,
      Math.abs(faceNormal.z) > Math.abs(faceNormal.x)
        ? Math.sign(faceNormal.z) || 1
        : 0,
    ).normalize();

    pushVertex(
      positions,
      normals,
      projectionPositions,
      projectionNormals,
      current.x,
      current.y,
      current.z,
      faceNormal,
      projectionNormal,
    );
    pushVertex(
      positions,
      normals,
      projectionPositions,
      projectionNormals,
      next.x,
      next.y,
      next.z,
      faceNormal,
      projectionNormal,
    );
    pushVertex(
      positions,
      normals,
      projectionPositions,
      projectionNormals,
      apex.x,
      apex.y,
      apex.z,
      faceNormal,
      projectionNormal,
    );
  }
}

function buildChryslerGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const projectionPositions: number[] = [];
  const projectionNormals: number[] = [];

  const sideStart = 0;
  for (const tier of CHRYSLER_TIERS) {
    addTierVerticalFaces(
      positions,
      normals,
      projectionPositions,
      projectionNormals,
      tier,
    );
  }
  const sideCount = positions.length / 3 - sideStart;

  const topStart = positions.length / 3;
  for (let i = 0; i < CHRYSLER_TIERS.length - 1; i++) {
    const current = CHRYSLER_TIERS[i];
    const next = CHRYSLER_TIERS[i + 1];
    if (next.scale >= current.scale) continue;
    addTopRing(
      positions,
      normals,
      projectionPositions,
      projectionNormals,
      current.scale,
      next.scale,
      current.top - 0.5,
    );
  }

  addTopRect(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
    CHRYSLER_TIERS[CHRYSLER_TIERS.length - 1].scale,
    CHRYSLER_TIERS[CHRYSLER_TIERS.length - 1].top - 0.5,
  );

  addSpire(
    positions,
    normals,
    projectionPositions,
    projectionNormals,
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

function getChryslerGeometry(): THREE.BufferGeometry {
  if (!sharedChryslerGeometry) {
    sharedChryslerGeometry = buildChryslerGeometry();
  }
  return sharedChryslerGeometry;
}

export function createChryslerBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(getChryslerGeometry(), [facadeMaterial, topMaterial]);
  return mesh;
}

export function disposeChryslerBuildingSharedResources(): void {
  if (sharedChryslerGeometry) {
    sharedChryslerGeometry.dispose();
    sharedChryslerGeometry = null;
  }
}
