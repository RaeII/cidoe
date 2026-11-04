import * as THREE from "three";

type FootprintPoint = {
  x: number;
  z: number;
};

type GeometryGroup = {
  start: number;
  count: number;
  materialIndex: number;
};

type GeometryBuffers = {
  positions: number[];
  normals: number[];
  projectionPositions: number[];
  projectionNormals: number[];
  groups: GeometryGroup[];
};

const HEARST_REFERENCE_WIDTH = 31.5;
const HEARST_REFERENCE_DEPTH = 23.5;
const HEARST_SHALLOW_CHAMFER = 0.85;
const HEARST_DEEP_CHAMFER = 3.6;
export const HEARST_RING_COUNT = 16;
const HEARST_SIDE_COUNT = 8;
const HEARST_DIAGRID_STEP = 2;
const HEARST_DIAGRID_OFFSET = 0.018;
const HEARST_DIAGRID_RADIUS = 0.011;
const HEARST_RING_RADIUS = 0.006;
const HEARST_EDGE_RING_RADIUS = 0.011;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

let sharedHearstGeometry: THREE.BufferGeometry | null = null;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getRingChamferRatios(ringIndex: number): { x: number; z: number } {
  const chamfer = ringIndex % 2 === 0
    ? HEARST_SHALLOW_CHAMFER
    : HEARST_DEEP_CHAMFER;

  return {
    x: chamfer / HEARST_REFERENCE_WIDTH,
    z: chamfer / HEARST_REFERENCE_DEPTH,
  };
}

export function getHearstRingFootprintPoints(
  width = 1,
  depth = 1,
  ringIndex = 0,
): FootprintPoint[] {
  const halfW = width / 2;
  const halfD = depth / 2;
  const chamfer = getRingChamferRatios(Math.round(ringIndex));
  const chamferX = width * chamfer.x;
  const chamferZ = depth * chamfer.z;

  return [
    { x: -halfW + chamferX, z: -halfD },
    { x: halfW - chamferX, z: -halfD },
    { x: halfW, z: -halfD + chamferZ },
    { x: halfW, z: halfD - chamferZ },
    { x: halfW - chamferX, z: halfD },
    { x: -halfW + chamferX, z: halfD },
    { x: -halfW, z: halfD - chamferZ },
    { x: -halfW, z: -halfD + chamferZ },
  ];
}

export function getHearstFaceSpanRatio(
  axis: "x" | "z",
  heightRatio: number,
): number {
  const ringPosition = clamp01(heightRatio) * HEARST_RING_COUNT;
  const lower = Math.floor(ringPosition);
  const upper = Math.min(HEARST_RING_COUNT, lower + 1);
  const t = ringPosition - lower;
  const lowerChamfer = getRingChamferRatios(lower);
  const upperChamfer = getRingChamferRatios(upper);
  const chamferRatio = THREE.MathUtils.lerp(
    lowerChamfer[axis],
    upperChamfer[axis],
    t,
  );

  return Math.max(0.1, 1 - chamferRatio * 2);
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

function pushVertex(
  buffers: GeometryBuffers,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  projectionNormal: THREE.Vector3,
): void {
  buffers.positions.push(point.x, point.y, point.z);
  buffers.normals.push(normal.x, normal.y, normal.z);
  buffers.projectionPositions.push(point.x, point.y, point.z);
  buffers.projectionNormals.push(
    projectionNormal.x,
    projectionNormal.y,
    projectionNormal.z,
  );
}

function pushTriangle(
  buffers: GeometryBuffers,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  normal: THREE.Vector3,
  projectionNormal = getProjectionNormal(normal),
): void {
  pushVertex(buffers, a, normal, projectionNormal);
  pushVertex(buffers, b, normal, projectionNormal);
  pushVertex(buffers, c, normal, projectionNormal);
}

function addGroup(
  buffers: GeometryBuffers,
  start: number,
  materialIndex: number,
): void {
  const count = buffers.positions.length / 3 - start;
  if (count > 0) {
    buffers.groups.push({ start, count, materialIndex });
  }
}

function getRingPoints(ringIndex: number): THREE.Vector3[] {
  const y = -0.5 + ringIndex / HEARST_RING_COUNT;
  return getHearstRingFootprintPoints(1, 1, ringIndex).map(
    ({ x, z }) => new THREE.Vector3(x, y, z),
  );
}

function appendBufferGeometry(
  buffers: GeometryBuffers,
  geometry: THREE.BufferGeometry,
): void {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");

  for (let i = 0; i < position.count; i++) {
    const point = new THREE.Vector3(
      position.getX(i),
      position.getY(i),
      position.getZ(i),
    );
    const vertexNormal = new THREE.Vector3(
      normal.getX(i),
      normal.getY(i),
      normal.getZ(i),
    ).normalize();
    pushVertex(buffers, point, vertexNormal, getProjectionNormal(vertexNormal));
  }

  if (source !== geometry) {
    source.dispose();
  }
}

function addBeam(
  buffers: GeometryBuffers,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  radialSegments = 6,
): void {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length <= 1e-6) return;

  const center = new THREE.Vector3().copy(start).add(end).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    Y_AXIS,
    direction.normalize(),
  );
  const matrix = new THREE.Matrix4().compose(
    center,
    quaternion,
    new THREE.Vector3(1, 1, 1),
  );
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    length,
    radialSegments,
    1,
    false,
  );

  geometry.applyMatrix4(matrix);
  appendBufferGeometry(buffers, geometry);
  geometry.dispose();
}

function addTowerShell(buffers: GeometryBuffers, rings: THREE.Vector3[][]): void {
  const sideStart = buffers.positions.length / 3;

  for (let ring = 0; ring < HEARST_RING_COUNT; ring++) {
    const lower = rings[ring];
    const upper = rings[ring + 1];

    for (let edge = 0; edge < HEARST_SIDE_COUNT; edge++) {
      const a = lower[edge];
      const b = lower[(edge + 1) % HEARST_SIDE_COUNT];
      const c = upper[(edge + 1) % HEARST_SIDE_COUNT];
      const d = upper[edge];
      const edgeVector = new THREE.Vector3().subVectors(b, a);
      const normal = new THREE.Vector3(edgeVector.z, 0, -edgeVector.x).normalize();
      const projectionNormal = getProjectionNormal(normal);

      pushTriangle(buffers, a, d, b, normal, projectionNormal);
      pushTriangle(buffers, b, d, c, normal, projectionNormal);
    }
  }

  addGroup(buffers, sideStart, 0);

  const topStart = buffers.positions.length / 3;
  const top = rings[HEARST_RING_COUNT];
  const topCenter = new THREE.Vector3(0, 0.5, 0);
  const topNormal = new THREE.Vector3(0, 1, 0);
  for (let edge = 0; edge < HEARST_SIDE_COUNT; edge++) {
    pushTriangle(
      buffers,
      topCenter,
      top[(edge + 1) % HEARST_SIDE_COUNT],
      top[edge],
      topNormal,
      topNormal,
    );
  }
  addGroup(buffers, topStart, 1);

  const bottomStart = buffers.positions.length / 3;
  const bottom = rings[0];
  const bottomCenter = new THREE.Vector3(0, -0.5, 0);
  const bottomNormal = new THREE.Vector3(0, -1, 0);
  for (let edge = 0; edge < HEARST_SIDE_COUNT; edge++) {
    pushTriangle(
      buffers,
      bottomCenter,
      bottom[edge],
      bottom[(edge + 1) % HEARST_SIDE_COUNT],
      bottomNormal,
      bottomNormal,
    );
  }
  addGroup(buffers, bottomStart, 0);
}

function getFacadePoint(
  rings: THREE.Vector3[][],
  ringIndex: number,
  edgeIndex: number,
  t: number,
  offset = HEARST_DIAGRID_OFFSET,
): THREE.Vector3 {
  const ring = rings[THREE.MathUtils.clamp(ringIndex, 0, HEARST_RING_COUNT)];
  const edge = THREE.MathUtils.euclideanModulo(edgeIndex, HEARST_SIDE_COUNT);
  const a = ring[edge];
  const b = ring[(edge + 1) % HEARST_SIDE_COUNT];
  const point = new THREE.Vector3().copy(a).lerp(b, clamp01(t));
  const outward = new THREE.Vector3(point.x, 0, point.z);

  if (outward.lengthSq() > 1e-6) {
    outward.normalize().multiplyScalar(offset);
    point.add(outward);
  }

  return point;
}

function addHearstDiagrid(
  buffers: GeometryBuffers,
  rings: THREE.Vector3[][],
): void {
  const beamStart = buffers.positions.length / 3;
  const edgeModuleCounts = [4, 1, 3, 1, 4, 1, 3, 1];
  const facadeEdges = new Set([0, 2, 4, 6]);
  const megaBands = Math.floor(HEARST_RING_COUNT / HEARST_DIAGRID_STEP);

  for (let edge = 0; edge < HEARST_SIDE_COUNT; edge++) {
    if (!facadeEdges.has(edge)) continue;

    const modules = edgeModuleCounts[edge];

    for (let band = 0; band < megaBands; band++) {
      const lowerLevel = band * HEARST_DIAGRID_STEP;
      const upperLevel = Math.min(
        (band + 1) * HEARST_DIAGRID_STEP,
        HEARST_RING_COUNT,
      );
      const inverted = band % 2 === 1;

      for (let module = 0; module < modules; module++) {
        const left = module / modules;
        const center = (module + 0.5) / modules;
        const right = (module + 1) / modules;

        if (!inverted) {
          addBeam(
            buffers,
            getFacadePoint(rings, lowerLevel, edge, left),
            getFacadePoint(rings, upperLevel, edge, center),
            HEARST_DIAGRID_RADIUS,
          );
          addBeam(
            buffers,
            getFacadePoint(rings, lowerLevel, edge, right),
            getFacadePoint(rings, upperLevel, edge, center),
            HEARST_DIAGRID_RADIUS,
          );
        } else {
          addBeam(
            buffers,
            getFacadePoint(rings, lowerLevel, edge, center),
            getFacadePoint(rings, upperLevel, edge, left),
            HEARST_DIAGRID_RADIUS,
          );
          addBeam(
            buffers,
            getFacadePoint(rings, lowerLevel, edge, center),
            getFacadePoint(rings, upperLevel, edge, right),
            HEARST_DIAGRID_RADIUS,
          );
        }
      }
    }
  }

  for (let level = 0; level <= HEARST_RING_COUNT; level += HEARST_DIAGRID_STEP) {
    for (let edge = 0; edge < HEARST_SIDE_COUNT; edge++) {
      const isOuterRing = level === 0 || level === HEARST_RING_COUNT;
      addBeam(
        buffers,
        getFacadePoint(rings, level, edge, 0, HEARST_DIAGRID_OFFSET * 0.8),
        getFacadePoint(rings, level, edge, 1, HEARST_DIAGRID_OFFSET * 0.8),
        isOuterRing ? HEARST_EDGE_RING_RADIUS : HEARST_RING_RADIUS,
        5,
      );
    }
  }

  addGroup(buffers, beamStart, 1);
}

function buildHearstGeometry(): THREE.BufferGeometry {
  const buffers: GeometryBuffers = {
    positions: [],
    normals: [],
    projectionPositions: [],
    projectionNormals: [],
    groups: [],
  };
  const rings = Array.from({ length: HEARST_RING_COUNT + 1 }, (_, index) =>
    getRingPoints(index),
  );

  addTowerShell(buffers, rings);
  addHearstDiagrid(buffers, rings);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(buffers.positions), 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(buffers.normals), 3),
  );
  geometry.setAttribute(
    "aProjPosition",
    new THREE.BufferAttribute(new Float32Array(buffers.projectionPositions), 3),
  );
  geometry.setAttribute(
    "aProjNormal",
    new THREE.BufferAttribute(new Float32Array(buffers.projectionNormals), 3),
  );

  for (const group of buffers.groups) {
    geometry.addGroup(group.start, group.count, group.materialIndex);
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function getHearstGeometry(): THREE.BufferGeometry {
  if (!sharedHearstGeometry) {
    sharedHearstGeometry = buildHearstGeometry();
  }
  return sharedHearstGeometry;
}

export function createHearstBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(getHearstGeometry(), [facadeMaterial, topMaterial]);
  return mesh;
}

export function disposeHearstBuildingSharedResources(): void {
  if (sharedHearstGeometry) {
    sharedHearstGeometry.dispose();
    sharedHearstGeometry = null;
  }
}
