import * as THREE from "three";

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

export type OneTradeTierFootprint = {
  bottomY: number;
  topY: number;
  width: number;
  depth: number;
};

export type OneTradeLedFootprintRing = {
  y: number;
  points: Array<{ x: number; z: number }>;
};

const ONE_TRADE_MATERIAL = {
  facade: 0,
  trim: 1,
} as const;

const BASE_HEIGHT = 52;
const TOWER_BASE_Y = BASE_HEIGHT;
const TOWER_HEIGHT = 292;
const TOWER_TOP_Y = TOWER_BASE_Y + TOWER_HEIGHT;
const ONE_TRADE_RAW_HEIGHT = TOWER_TOP_Y + 152.1;
const ONE_TRADE_NORMALIZE_WIDTH = 95.8;
const ONE_TRADE_NORMALIZE_DEPTH = 95.8;

export const ONE_TRADE_SIGN_Y_OFFSET_RATIO = 0.14;

let sharedOneTradeGeometry: THREE.BufferGeometry | null = null;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function footprintFromChamferHalf(half: number, cutRatio: number): THREE.Vector3[] {
  const cut = half * THREE.MathUtils.clamp(cutRatio, 0.015, 0.985);
  return [
    new THREE.Vector3(-half + cut, 0, half),
    new THREE.Vector3(half - cut, 0, half),
    new THREE.Vector3(half, 0, half - cut),
    new THREE.Vector3(half, 0, -half + cut),
    new THREE.Vector3(half - cut, 0, -half),
    new THREE.Vector3(-half + cut, 0, -half),
    new THREE.Vector3(-half, 0, -half + cut),
    new THREE.Vector3(-half, 0, half - cut),
  ];
}

function oneTradeCrossSection(t: number): THREE.Vector3[] {
  const eased = smoothstep(t);
  const half = THREE.MathUtils.lerp(43.0, 35.6, clamp01(t));
  const cutRatio = THREE.MathUtils.lerp(0.035, 0.975, eased);
  return footprintFromChamferHalf(half, cutRatio);
}

function offsetFootprint(points: THREE.Vector3[], offset: number): THREE.Vector3[] {
  return points.map((point) => {
    const outward = point.clone().setY(0);
    if (outward.lengthSq() <= 1e-8) return point.clone();
    outward.normalize();
    return point.clone().addScaledVector(outward, offset);
  });
}

function getProjectionNormal(
  normal: THREE.Vector3,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);

  if (ay >= ax && ay >= az) {
    return target.set(0, Math.sign(normal.y) || 1, 0);
  }

  if (ax >= az) {
    return target.set(Math.sign(normal.x) || 1, 0, 0);
  }

  return target.set(0, 0, Math.sign(normal.z) || 1);
}

// Scratch reaproveitado: um Vector3 novo por vértice e um toNonIndexed por peça dominavam
// o 1º build (~18 ms, tarefa longa no celular). Mesma saída: o índice é percorrido na
// ordem que o toNonIndexed expandiria.
const scratchPoint = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchProjectionPoint = new THREE.Vector3();
const scratchProjectionNormal = new THREE.Vector3();
const scratchNormalMatrix = new THREE.Matrix3();

function createVerticalProjection(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): {
  normal: THREE.Vector3;
  tangent: THREE.Vector3;
} {
  const faceNormal = new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a))
    .normalize();
  const horizontalNormal = faceNormal.clone().setY(0);
  if (horizontalNormal.lengthSq() <= 1e-8) {
    horizontalNormal.set(0, 0, 1);
  } else {
    horizontalNormal.normalize();
  }

  const projectionNormal = getProjectionNormal(horizontalNormal);
  const tangent = new THREE.Vector3().subVectors(b, a).setY(0);
  if (tangent.lengthSq() <= 1e-8) {
    tangent.set(Math.abs(projectionNormal.z) >= Math.abs(projectionNormal.x) ? 1 : 0, 0, Math.abs(projectionNormal.x) > Math.abs(projectionNormal.z) ? 1 : 0);
  } else {
    tangent.normalize();
  }

  if (Math.abs(projectionNormal.x) >= Math.abs(projectionNormal.z)) {
    if (tangent.z < 0) tangent.multiplyScalar(-1);
  } else if (tangent.x < 0) {
    tangent.multiplyScalar(-1);
  }

  return { normal: projectionNormal, tangent };
}

function projectVerticalPoint(
  point: THREE.Vector3,
  tangent: THREE.Vector3,
  projectionNormal: THREE.Vector3,
): THREE.Vector3 {
  const u = point.x * tangent.x + point.z * tangent.z;

  if (Math.abs(projectionNormal.x) >= Math.abs(projectionNormal.z)) {
    return new THREE.Vector3(0, point.y, u);
  }

  return new THREE.Vector3(u, point.y, 0);
}

function pushProjectedQuad(
  positions: number[],
  indices: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
): void {
  const start = positions.length / 3;
  const projection = createVerticalProjection(a, b, c);
  const points = [a, b, c, d];

  for (const point of points) {
    const projectionPoint = projectVerticalPoint(
      point,
      projection.tangent,
      projection.normal,
    );
    positions.push(point.x, point.y, point.z);
    projectionPositions.push(projectionPoint.x, projectionPoint.y, projectionPoint.z);
    projectionNormals.push(
      projection.normal.x,
      projection.normal.y,
      projection.normal.z,
    );
  }

  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function pushProjectedFan(
  positions: number[],
  indices: number[],
  projectionPositions: number[],
  projectionNormals: number[],
  points: THREE.Vector3[],
  projectionNormal: THREE.Vector3,
  reverse = false,
): void {
  const center = points
    .reduce((acc, point) => acc.add(point), new THREE.Vector3())
    .multiplyScalar(1 / points.length);
  const centerIndex = positions.length / 3;
  positions.push(center.x, center.y, center.z);
  projectionPositions.push(center.x, center.y, center.z);
  projectionNormals.push(
    projectionNormal.x,
    projectionNormal.y,
    projectionNormal.z,
  );

  const firstIndex = positions.length / 3;
  points.forEach((point) => {
    positions.push(point.x, point.y, point.z);
    projectionPositions.push(point.x, point.y, point.z);
    projectionNormals.push(
      projectionNormal.x,
      projectionNormal.y,
      projectionNormal.z,
    );
  });

  for (let i = 0; i < points.length; i++) {
    const a = firstIndex + i;
    const b = firstIndex + ((i + 1) % points.length);
    if (reverse) indices.push(centerIndex, b, a);
    else indices.push(centerIndex, a, b);
  }
}

function createPrismGeometry(
  bottom: THREE.Vector3[],
  top: THREE.Vector3[],
  bottomY: number,
  topY: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const projectionPositions: number[] = [];
  const projectionNormals: number[] = [];
  const b = bottom.map((point) => point.clone().setY(bottomY));
  const t = top.map((point) => point.clone().setY(topY));

  for (let i = 0; i < b.length; i++) {
    const next = (i + 1) % b.length;
    pushProjectedQuad(
      positions,
      indices,
      projectionPositions,
      projectionNormals,
      b[i],
      b[next],
      t[next],
      t[i],
    );
  }

  pushProjectedFan(
    positions,
    indices,
    projectionPositions,
    projectionNormals,
    t,
    new THREE.Vector3(0, 1, 0),
    false,
  );
  pushProjectedFan(
    positions,
    indices,
    projectionPositions,
    projectionNormals,
    b,
    new THREE.Vector3(0, -1, 0),
    true,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    "aProjPosition",
    new THREE.Float32BufferAttribute(projectionPositions, 3),
  );
  geometry.setAttribute(
    "aProjNormal",
    new THREE.Float32BufferAttribute(projectionNormals, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createTowerFaceGeometry(
  faceIndex: number,
  baseY: number,
  height: number,
  segments = 56,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const projectionPositions: number[] = [];
  const projectionNormals: number[] = [];

  for (let segment = 0; segment < segments; segment++) {
    const t0 = segment / segments;
    const t1 = (segment + 1) / segments;
    const section0 = oneTradeCrossSection(t0).map((point) => point.setY(baseY + t0 * height));
    const section1 = oneTradeCrossSection(t1).map((point) => point.setY(baseY + t1 * height));
    const next = (faceIndex + 1) % 8;
    pushProjectedQuad(
      positions,
      indices,
      projectionPositions,
      projectionNormals,
      section0[faceIndex],
      section0[next],
      section1[next],
      section1[faceIndex],
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    "aProjPosition",
    new THREE.Float32BufferAttribute(projectionPositions, 3),
  );
  geometry.setAttribute(
    "aProjNormal",
    new THREE.Float32BufferAttribute(projectionNormals, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function composeMatrix(
  x: number,
  y: number,
  z: number,
  rotation = new THREE.Euler(),
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(rotation),
    new THREE.Vector3(1, 1, 1),
  );
}

function appendGeometry(
  buffers: GeometryBuffers,
  geometry: THREE.BufferGeometry,
  materialIndex: number,
  matrix = new THREE.Matrix4(),
): void {
  const index = geometry.index;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const projectionPosition = geometry.getAttribute("aProjPosition");
  const projectionNormal = geometry.getAttribute("aProjNormal");
  const normalMatrix = scratchNormalMatrix.getNormalMatrix(matrix);
  const start = buffers.positions.length / 3;
  const vertexCount = index ? index.count : position.count;

  for (let k = 0; k < vertexCount; k++) {
    const i = index ? index.getX(k) : k;
    const point = scratchPoint.fromBufferAttribute(position, i).applyMatrix4(matrix);
    const vertexNormal = normal
      ? scratchNormal.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize()
      : scratchNormal.set(0, 1, 0);
    const projectionPoint = projectionPosition
      ? scratchProjectionPoint.fromBufferAttribute(projectionPosition, i).applyMatrix4(matrix)
      : point;
    const projectionVertexNormal = projectionNormal
      ? scratchProjectionNormal
          .fromBufferAttribute(projectionNormal, i)
          .applyMatrix3(normalMatrix)
          .normalize()
      : vertexNormal;

    buffers.positions.push(point.x, point.y, point.z);
    buffers.normals.push(vertexNormal.x, vertexNormal.y, vertexNormal.z);
    buffers.projectionPositions.push(projectionPoint.x, projectionPoint.y, projectionPoint.z);
    buffers.projectionNormals.push(
      projectionVertexNormal.x,
      projectionVertexNormal.y,
      projectionVertexNormal.z,
    );
  }

  const count = buffers.positions.length / 3 - start;
  if (count > 0) {
    buffers.groups.push({ start, count, materialIndex });
  }

  geometry.dispose();
}

function appendBox(
  buffers: GeometryBuffers,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  materialIndex = ONE_TRADE_MATERIAL.trim,
): void {
  appendGeometry(
    buffers,
    new THREE.BoxGeometry(width, height, depth),
    materialIndex,
    composeMatrix(x, y, z),
  );
}

function appendCylinder(
  buffers: GeometryBuffers,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  y: number,
  segments = 32,
): void {
  appendGeometry(
    buffers,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    ONE_TRADE_MATERIAL.trim,
    composeMatrix(0, y, 0),
  );
}

function appendSphere(
  buffers: GeometryBuffers,
  radius: number,
  x: number,
  y: number,
  z: number,
): void {
  appendGeometry(
    buffers,
    new THREE.SphereGeometry(radius, 24, 16),
    ONE_TRADE_MATERIAL.trim,
    composeMatrix(x, y, z),
  );
}

function appendTorus(
  buffers: GeometryBuffers,
  radius: number,
  tube: number,
  y: number,
): void {
  appendGeometry(
    buffers,
    new THREE.TorusGeometry(radius, tube, 12, 84),
    ONE_TRADE_MATERIAL.trim,
    composeMatrix(0, y, 0, new THREE.Euler(Math.PI / 2, 0, 0)),
  );
}

function appendCylinderBetween(
  buffers: GeometryBuffers,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  segments = 12,
): void {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length <= 1e-6) return;

  direction.divideScalar(length);
  const center = new THREE.Vector3().copy(start).add(end).multiplyScalar(0.5);
  const matrix = new THREE.Matrix4().compose(
    center,
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction),
    new THREE.Vector3(1, 1, 1),
  );

  appendGeometry(
    buffers,
    new THREE.CylinderGeometry(radius, radius, length, segments),
    ONE_TRADE_MATERIAL.trim,
    matrix,
  );
}

function addBase(buffers: GeometryBuffers): void {
  const half = 45;
  const footprint = footprintFromChamferHalf(half, 0.02);
  appendGeometry(
    buffers,
    createPrismGeometry(footprint, footprint, 0, BASE_HEIGHT),
    ONE_TRADE_MATERIAL.facade,
  );

  const finSpacing = 4.9;
  for (let x = -half + 2; x <= half - 2; x += finSpacing) {
    appendBox(buffers, 0.28, BASE_HEIGHT * 0.84, 0.62, x, BASE_HEIGHT * 0.52, half + 0.48);
    appendBox(buffers, 0.28, BASE_HEIGHT * 0.84, 0.62, x, BASE_HEIGHT * 0.52, -half - 0.48);
  }

  for (let z = -half + 2; z <= half - 2; z += finSpacing) {
    appendBox(buffers, 0.62, BASE_HEIGHT * 0.84, 0.28, half + 0.48, BASE_HEIGHT * 0.52, z);
    appendBox(buffers, 0.62, BASE_HEIGHT * 0.84, 0.28, -half - 0.48, BASE_HEIGHT * 0.52, z);
  }

  for (let y = 7.2; y <= BASE_HEIGHT - 3.5; y += 7.2) {
    appendBox(buffers, half * 2 + 1.2, 0.24, 0.5, 0, y, half + 0.66);
    appendBox(buffers, half * 2 + 1.2, 0.24, 0.5, 0, y, -half - 0.66);
    appendBox(buffers, 0.5, 0.24, half * 2 + 1.2, half + 0.66, y, 0);
    appendBox(buffers, 0.5, 0.24, half * 2 + 1.2, -half - 0.66, y, 0);
  }

  appendBox(buffers, half * 2 + 5.8, 1.3, half * 2 + 5.8, 0, 0.65, 0);
  appendBox(buffers, half * 2 + 3.4, 1.05, 3.0, 0, BASE_HEIGHT + 1.0, half + 1.3);
  appendBox(buffers, half * 2 + 3.4, 1.05, 3.0, 0, BASE_HEIGHT + 1.0, -half - 1.3);
  appendBox(buffers, 3.0, 1.05, half * 2 + 3.4, half + 1.3, BASE_HEIGHT + 1.0, 0);
  appendBox(buffers, 3.0, 1.05, half * 2 + 3.4, -half - 1.3, BASE_HEIGHT + 1.0, 0);
}

function addTowerSkin(buffers: GeometryBuffers): void {
  for (let face = 0; face < 8; face++) {
    appendGeometry(
      buffers,
      createTowerFaceGeometry(face, TOWER_BASE_Y, TOWER_HEIGHT),
      ONE_TRADE_MATERIAL.facade,
    );
  }
}

function addTowerBands(buffers: GeometryBuffers): void {
  for (let row = 8; row < 88; row += 8) {
    const t = row / 92;
    const y = TOWER_BASE_Y + t * TOWER_HEIGHT;
    const footprint = offsetFootprint(oneTradeCrossSection(t), 0.26);
    appendGeometry(
      buffers,
      createPrismGeometry(footprint, footprint, y - 0.24, y + 0.24),
      ONE_TRADE_MATERIAL.trim,
    );
  }
}

function addTowerFacetRibs(buffers: GeometryBuffers): void {
  for (let vertexIndex = 0; vertexIndex < 8; vertexIndex++) {
    for (let segment = 0; segment < 18; segment++) {
      const t0 = segment / 18;
      const t1 = (segment + 1) / 18;
      const p0 = oneTradeCrossSection(t0)[vertexIndex].setY(TOWER_BASE_Y + t0 * TOWER_HEIGHT);
      const p1 = oneTradeCrossSection(t1)[vertexIndex].setY(TOWER_BASE_Y + t1 * TOWER_HEIGHT);
      const outward0 = p0.clone().setY(0).normalize();
      const outward1 = p1.clone().setY(0).normalize();
      appendCylinderBetween(
        buffers,
        p0.addScaledVector(outward0, 0.28),
        p1.addScaledVector(outward1, 0.28),
        0.18,
        10,
      );
    }
  }
}

function addTopParapetAndSpire(buffers: GeometryBuffers): void {
  const parapetFootprint = footprintFromChamferHalf(35.9, 0.975);
  appendGeometry(
    buffers,
    createPrismGeometry(parapetFootprint, parapetFootprint, TOWER_TOP_Y, TOWER_TOP_Y + 8.2),
    ONE_TRADE_MATERIAL.trim,
  );

  const mechanicalFootprint = footprintFromChamferHalf(20.2, 0.82);
  appendGeometry(
    buffers,
    createPrismGeometry(mechanicalFootprint, mechanicalFootprint, TOWER_TOP_Y + 6.95, TOWER_TOP_Y + 15.45),
    ONE_TRADE_MATERIAL.trim,
  );

  appendTorus(buffers, 14.4, 0.6, TOWER_TOP_Y + 17.1);
  appendCylinder(buffers, 2.35, 3.1, 13.2, TOWER_TOP_Y + 25.5, 36);
  appendCylinder(buffers, 0.72, 1.1, 99, TOWER_TOP_Y + 80.4, 32);

  for (let i = 0; i < 12; i++) {
    const y = TOWER_TOP_Y + 37 + i * 7.2;
    const radius = Math.max(0.55, 1.38 - i * 0.052);
    appendCylinder(buffers, radius + 0.2, radius + 0.2, 0.48, y, 28);
  }

  appendCylinder(buffers, 0.26, 0.48, 20, TOWER_TOP_Y + 141.5, 24);
  appendSphere(buffers, 1.15, 0, TOWER_TOP_Y + 152.1, 0);

  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const start = new THREE.Vector3(
      Math.cos(angle) * 14.1,
      TOWER_TOP_Y + 17.2,
      Math.sin(angle) * 14.1,
    );
    const end = new THREE.Vector3(0, TOWER_TOP_Y + 66.5, 0);
    appendCylinderBetween(buffers, start, end, 0.08, 8);
  }
}

function normalizeBuffers(buffers: GeometryBuffers): void {
  const box = new THREE.Box3();

  for (let i = 0; i < buffers.positions.length; i += 3) {
    box.expandByPoint(scratchPoint.set(
      buffers.positions[i],
      buffers.positions[i + 1],
      buffers.positions[i + 2],
    ));
  }

  const size = new THREE.Vector3();
  box.getSize(size);
  const scaleMatrix = new THREE.Matrix4().makeScale(
    1 / Math.max(size.x, 1e-6),
    1 / Math.max(size.y, 1e-6),
    1 / Math.max(size.z, 1e-6),
  );
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(scaleMatrix);
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;

  for (let i = 0; i < buffers.positions.length; i += 3) {
    const x = (buffers.positions[i] - centerX) / size.x;
    const y = (buffers.positions[i + 1] - box.min.y) / size.y - 0.5;
    const z = (buffers.positions[i + 2] - centerZ) / size.z;

    buffers.positions[i] = x;
    buffers.positions[i + 1] = y;
    buffers.positions[i + 2] = z;
    buffers.projectionPositions[i] = (buffers.projectionPositions[i] - centerX) / size.x;
    buffers.projectionPositions[i + 1] = (buffers.projectionPositions[i + 1] - box.min.y) / size.y - 0.5;
    buffers.projectionPositions[i + 2] = (buffers.projectionPositions[i + 2] - centerZ) / size.z;

    const normal = scratchNormal.set(
      buffers.normals[i],
      buffers.normals[i + 1],
      buffers.normals[i + 2],
    ).applyMatrix3(normalMatrix).normalize();
    const projectionSourceNormal = scratchProjectionPoint.set(
      buffers.projectionNormals[i],
      buffers.projectionNormals[i + 1],
      buffers.projectionNormals[i + 2],
    ).applyMatrix3(normalMatrix).normalize();
    const projectionNormal = getProjectionNormal(projectionSourceNormal, scratchProjectionNormal);

    buffers.normals[i] = normal.x;
    buffers.normals[i + 1] = normal.y;
    buffers.normals[i + 2] = normal.z;
    buffers.projectionNormals[i] = projectionNormal.x;
    buffers.projectionNormals[i + 1] = projectionNormal.y;
    buffers.projectionNormals[i + 2] = projectionNormal.z;
  }
}

function buildOneTradeGeometry(): THREE.BufferGeometry {
  const buffers: GeometryBuffers = {
    positions: [],
    normals: [],
    projectionPositions: [],
    projectionNormals: [],
    groups: [],
  };

  addBase(buffers);
  addTowerSkin(buffers);
  addTowerBands(buffers);
  addTowerFacetRibs(buffers);
  addTopParapetAndSpire(buffers);
  normalizeBuffers(buffers);

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

function getOneTradeGeometry(): THREE.BufferGeometry {
  if (!sharedOneTradeGeometry) {
    sharedOneTradeGeometry = buildOneTradeGeometry();
  }
  return sharedOneTradeGeometry;
}

export function getOneTradeFootprintScaleAtHeightRatio(heightRatio: number): number {
  const rawY = clamp01(heightRatio) * ONE_TRADE_RAW_HEIGHT;

  if (rawY <= BASE_HEIGHT) {
    return 1;
  }

  if (rawY <= TOWER_TOP_Y) {
    const t = (rawY - TOWER_BASE_Y) / TOWER_HEIGHT;
    const half = THREE.MathUtils.lerp(43.0, 35.6, clamp01(t));
    return (half * 2) / ONE_TRADE_NORMALIZE_WIDTH;
  }

  if (rawY <= TOWER_TOP_Y + 20) {
    return (35.9 * 2) / ONE_TRADE_NORMALIZE_WIDTH;
  }

  const spireT = (rawY - (TOWER_TOP_Y + 20)) / (ONE_TRADE_RAW_HEIGHT - TOWER_TOP_Y - 20);
  return THREE.MathUtils.lerp(0.18, 0.025, clamp01(spireT));
}

export function getOneTradeTierFootprints(
  width = 1,
  depth = 1,
  height = 1,
): OneTradeTierFootprint[] {
  const levels = [
    0,
    BASE_HEIGHT,
    TOWER_BASE_Y + TOWER_HEIGHT * 0.2,
    TOWER_BASE_Y + TOWER_HEIGHT * 0.4,
    TOWER_BASE_Y + TOWER_HEIGHT * 0.6,
    TOWER_BASE_Y + TOWER_HEIGHT * 0.8,
    TOWER_TOP_Y,
    TOWER_TOP_Y + 20,
    TOWER_TOP_Y + 80,
    ONE_TRADE_RAW_HEIGHT,
  ];

  return levels.slice(0, -1).map((bottom, index) => {
    const top = levels[index + 1];
    const middleRatio = ((bottom + top) / 2) / ONE_TRADE_RAW_HEIGHT;
    const scale = getOneTradeFootprintScaleAtHeightRatio(middleRatio);
    return {
      bottomY: (bottom / ONE_TRADE_RAW_HEIGHT) * height,
      topY: (top / ONE_TRADE_RAW_HEIGHT) * height,
      width: width * scale,
      depth: depth * scale * (ONE_TRADE_NORMALIZE_WIDTH / ONE_TRADE_NORMALIZE_DEPTH),
    };
  });
}

function getScaledOneTradePoints(
  points: THREE.Vector3[],
  width: number,
  depth: number,
): Array<{ x: number; z: number }> {
  return points.map((point) => ({
    x: (point.x / ONE_TRADE_NORMALIZE_WIDTH) * width,
    z: (point.z / ONE_TRADE_NORMALIZE_DEPTH) * depth,
  }));
}

export function getOneTradeLedFootprintRings(
  width = 1,
  depth = 1,
  height = 1,
): OneTradeLedFootprintRing[] {
  const baseFootprint = footprintFromChamferHalf(45, 0.02);
  const rings: OneTradeLedFootprintRing[] = [
    {
      y: 0,
      points: getScaledOneTradePoints(baseFootprint, width, depth),
    },
    {
      y: (BASE_HEIGHT / ONE_TRADE_RAW_HEIGHT) * height,
      points: getScaledOneTradePoints(baseFootprint, width, depth),
    },
  ];

  const towerSegments = 14;
  for (let i = 0; i <= towerSegments; i++) {
    const t = i / towerSegments;
    rings.push({
      y: ((TOWER_BASE_Y + TOWER_HEIGHT * t) / ONE_TRADE_RAW_HEIGHT) * height,
      points: getScaledOneTradePoints(oneTradeCrossSection(t), width, depth),
    });
  }

  const parapetFootprint = footprintFromChamferHalf(35.9, 0.975);
  rings.push({
    y: ((TOWER_TOP_Y + 8.2) / ONE_TRADE_RAW_HEIGHT) * height,
    points: getScaledOneTradePoints(parapetFootprint, width, depth),
  });

  return rings;
}

export function createOneTradeBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(getOneTradeGeometry(), [facadeMaterial, topMaterial]);
  return mesh;
}

export function disposeOneTradeBuildingSharedResources(): void {
  if (sharedOneTradeGeometry) {
    sharedOneTradeGeometry.dispose();
    sharedOneTradeGeometry = null;
  }
}
