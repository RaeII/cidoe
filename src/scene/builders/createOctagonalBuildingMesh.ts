import * as THREE from "three";

// Full length of each cardinal flat side as a fraction of the logical footprint.
// This creates a regular octagon inside a 1x1 square footprint.
export const OCTAGON_FLAT_SIDE_RATIO = Math.SQRT2 - 1;
const OCTAGON_HALF_FLAT_SIDE = OCTAGON_FLAT_SIDE_RATIO / 2;

type FootprintPoint = {
  x: number;
  z: number;
};

let sharedOctagonalGeometry: THREE.BufferGeometry | null = null;

export function getOctagonalFootprintPoints(
  width = 1,
  depth = 1,
): FootprintPoint[] {
  const halfW = width / 2;
  const halfD = depth / 2;
  const innerW = OCTAGON_HALF_FLAT_SIDE * width;
  const innerD = OCTAGON_HALF_FLAT_SIDE * depth;

  return [
    { x: -innerW, z: -halfD },
    { x: innerW, z: -halfD },
    { x: halfW, z: -innerD },
    { x: halfW, z: innerD },
    { x: innerW, z: halfD },
    { x: -innerW, z: halfD },
    { x: -halfW, z: innerD },
    { x: -halfW, z: -innerD },
  ];
}

function pushVertex(
  positions: number[],
  normals: number[],
  point: FootprintPoint,
  y: number,
  normal: THREE.Vector3,
): void {
  positions.push(point.x, y, point.z);
  normals.push(normal.x, normal.y, normal.z);
}

function pushFace(
  positions: number[],
  normals: number[],
  vertices: Array<{ point: FootprintPoint; y: number }>,
  normal: THREE.Vector3,
): void {
  for (const vertex of vertices) {
    pushVertex(positions, normals, vertex.point, vertex.y, normal);
  }
}

function getProjectionNormal(normal: THREE.Vector3): THREE.Vector3 {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);

  if (ay >= ax && ay >= az) {
    return new THREE.Vector3(0, Math.sign(normal.y) || 1, 0);
  }

  if (ax >= az) {
    return new THREE.Vector3(Math.sign(normal.x) || 1, 0, 0);
  }

  return new THREE.Vector3(0, 0, Math.sign(normal.z) || 1);
}

function buildOctagonalGeometry(): THREE.BufferGeometry {
  const points = getOctagonalFootprintPoints();
  const positions: number[] = [];
  const normals: number[] = [];
  const projectionNormals: number[] = [];
  const projectionPositions: number[] = [];

  const pushProjectionData = (
    startVertex: number,
    vertexCount: number,
    normal: THREE.Vector3,
  ) => {
    const projectionNormal = getProjectionNormal(normal);
    for (let i = 0; i < vertexCount; i++) {
      const positionIndex = (startVertex + i) * 3;
      projectionPositions.push(
        positions[positionIndex],
        positions[positionIndex + 1],
        positions[positionIndex + 2],
      );
      projectionNormals.push(
        projectionNormal.x,
        projectionNormal.y,
        projectionNormal.z,
      );
    }
  };

  const geometry = new THREE.BufferGeometry();

  const sideStart = positions.length / 3;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const edgeX = next.x - current.x;
    const edgeZ = next.z - current.z;
    const normal = new THREE.Vector3(edgeZ, 0, -edgeX).normalize();
    const vertexStart = positions.length / 3;

    pushFace(
      positions,
      normals,
      [
        { point: current, y: -0.5 },
        { point: next, y: 0.5 },
        { point: next, y: -0.5 },
        { point: current, y: -0.5 },
        { point: current, y: 0.5 },
        { point: next, y: 0.5 },
      ],
      normal,
    );
    pushProjectionData(vertexStart, 6, normal);
  }
  const sideCount = positions.length / 3 - sideStart;

  const topStart = positions.length / 3;
  const topCenter = { x: 0, z: 0 };
  const topNormal = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const vertexStart = positions.length / 3;
    pushFace(
      positions,
      normals,
      [
        { point: topCenter, y: 0.5 },
        { point: next, y: 0.5 },
        { point: current, y: 0.5 },
      ],
      topNormal,
    );
    pushProjectionData(vertexStart, 3, topNormal);
  }
  const topCount = positions.length / 3 - topStart;

  const bottomStart = positions.length / 3;
  const bottomNormal = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const vertexStart = positions.length / 3;
    pushFace(
      positions,
      normals,
      [
        { point: topCenter, y: -0.5 },
        { point: current, y: -0.5 },
        { point: next, y: -0.5 },
      ],
      bottomNormal,
    );
    pushProjectionData(vertexStart, 3, bottomNormal);
  }
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

function getOctagonalGeometry(): THREE.BufferGeometry {
  if (!sharedOctagonalGeometry) {
    sharedOctagonalGeometry = buildOctagonalGeometry();
  }
  return sharedOctagonalGeometry;
}

export function createOctagonalBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(getOctagonalGeometry(), [facadeMaterial, topMaterial]);
  return mesh;
}

export function disposeOctagonalBuildingSharedResources(): void {
  if (sharedOctagonalGeometry) {
    sharedOctagonalGeometry.dispose();
    sharedOctagonalGeometry = null;
  }
}
