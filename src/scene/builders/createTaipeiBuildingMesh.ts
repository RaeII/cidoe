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

type CornerSign = {
  sx: number;
  sz: number;
};

export type TaipeiTierFootprint = {
  bottomY: number;
  topY: number;
  width: number;
  depth: number;
};

const TAIPEI_MATERIAL = {
  facade: 0,
  trim: 1,
} as const;

const TAIPEI_RAW_HEIGHT = 435.39;
export const TAIPEI_SIGN_Y_OFFSET_RATIO = 0.18;

let sharedTaipeiGeometry: THREE.BufferGeometry | null = null;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function widthAt(bottomWidth: number, topWidth: number, t: number): number {
  const clamped = THREE.MathUtils.clamp(t, 0, 1);
  return bottomWidth + (topWidth - bottomWidth) * clamped;
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

// Scratch reaproveitado: um Vector3 novo por vértice (e um BoxGeometry + toNonIndexed por
// caixa) dominava o 1º build (~20 ms, tarefa longa no celular). Mesma saída: o índice é
// percorrido na ordem que o toNonIndexed expandiria.
const scratchPoint = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchProjectionNormal = new THREE.Vector3();
const scratchNormalMatrix = new THREE.Matrix3();
// Caixa unitária compartilhada; appendBox escala pela matriz.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

function pushVertex(
  buffers: GeometryBuffers,
  point: THREE.Vector3,
  normal: THREE.Vector3,
): void {
  const projectionNormal = getProjectionNormal(normal, scratchProjectionNormal);
  buffers.positions.push(point.x, point.y, point.z);
  buffers.normals.push(normal.x, normal.y, normal.z);
  buffers.projectionPositions.push(point.x, point.y, point.z);
  buffers.projectionNormals.push(
    projectionNormal.x,
    projectionNormal.y,
    projectionNormal.z,
  );
}

function appendGeometry(
  buffers: GeometryBuffers,
  geometry: THREE.BufferGeometry,
  materialIndex: number,
  matrix = new THREE.Matrix4(),
  disposeSource = true,
): void {
  const index = geometry.index;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const normalMatrix = scratchNormalMatrix.getNormalMatrix(matrix);
  const start = buffers.positions.length / 3;
  const vertexCount = index ? index.count : position.count;

  for (let k = 0; k < vertexCount; k++) {
    const i = index ? index.getX(k) : k;
    const point = scratchPoint.fromBufferAttribute(position, i).applyMatrix4(matrix);
    const vertexNormal = normal
      ? scratchNormal.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize()
      : scratchNormal.set(0, 1, 0);
    pushVertex(buffers, point, vertexNormal);
  }

  const count = buffers.positions.length / 3 - start;
  if (count > 0) {
    buffers.groups.push({ start, count, materialIndex });
  }

  if (disposeSource) geometry.dispose();
}

function composeMatrix(
  x: number,
  y: number,
  z: number,
  rotationY = 0,
  scale = new THREE.Vector3(1, 1, 1),
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
    scale,
  );
}

function appendBox(
  buffers: GeometryBuffers,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  materialIndex: number = TAIPEI_MATERIAL.trim,
  rotationY = 0,
): void {
  // Escala na matriz em vez de um BoxGeometry por caixa. Lado zero deixaria a matriz
  // normal singular → caminho antigo.
  if (width !== 0 && height !== 0 && depth !== 0) {
    appendGeometry(
      buffers,
      UNIT_BOX,
      materialIndex,
      composeMatrix(x, y, z, rotationY, new THREE.Vector3(width, height, depth)),
      false,
    );
    return;
  }
  appendGeometry(
    buffers,
    new THREE.BoxGeometry(width, height, depth),
    materialIndex,
    composeMatrix(x, y, z, rotationY),
  );
}

function appendCylinder(
  buffers: GeometryBuffers,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegments: number,
  y: number,
): void {
  appendGeometry(
    buffers,
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    TAIPEI_MATERIAL.trim,
    composeMatrix(0, y, 0),
  );
}

function appendSphere(
  buffers: GeometryBuffers,
  radius: number,
  widthSegments: number,
  heightSegments: number,
  x: number,
  y: number,
  z: number,
  scale = new THREE.Vector3(1, 1, 1),
): void {
  appendGeometry(
    buffers,
    new THREE.SphereGeometry(radius, widthSegments, heightSegments),
    TAIPEI_MATERIAL.trim,
    composeMatrix(x, y, z, 0, scale),
  );
}

function pushQuad(
  positions: number[],
  indices: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  d: THREE.Vector3,
): void {
  const start = positions.length / 3;
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
  indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function pushFan(
  positions: number[],
  indices: number[],
  points: THREE.Vector3[],
  reverse = false,
): void {
  const center = points
    .reduce((acc, point) => acc.add(point), new THREE.Vector3())
    .multiplyScalar(1 / points.length);
  const centerIndex = positions.length / 3;
  positions.push(center.x, center.y, center.z);

  const firstIndex = positions.length / 3;
  points.forEach((point) => positions.push(point.x, point.y, point.z));

  for (let i = 0; i < points.length; i++) {
    const a = firstIndex + i;
    const b = firstIndex + ((i + 1) % points.length);
    if (reverse) indices.push(centerIndex, b, a);
    else indices.push(centerIndex, a, b);
  }
}

function chamferedFootprint(
  width: number,
  depth: number,
  cutRatio = 0.105,
): THREE.Vector3[] {
  const cut = Math.min(width, depth) * cutRatio;
  const halfW = width / 2;
  const halfD = depth / 2;

  return [
    new THREE.Vector3(-halfW + cut, 0, halfD),
    new THREE.Vector3(halfW - cut, 0, halfD),
    new THREE.Vector3(halfW, 0, halfD - cut),
    new THREE.Vector3(halfW, 0, -halfD + cut),
    new THREE.Vector3(halfW - cut, 0, -halfD),
    new THREE.Vector3(-halfW + cut, 0, -halfD),
    new THREE.Vector3(-halfW, 0, -halfD + cut),
    new THREE.Vector3(-halfW, 0, halfD - cut),
  ];
}

function createTaperedBoxGeometry(
  bottomWidth: number,
  bottomDepth: number,
  topWidth: number,
  topDepth: number,
  height: number,
  cornerCutRatio = 0.105,
): THREE.BufferGeometry {
  const y0 = -height / 2;
  const y1 = height / 2;
  const bottom = chamferedFootprint(bottomWidth, bottomDepth, cornerCutRatio)
    .map((point) => point.setY(y0));
  const top = chamferedFootprint(topWidth, topDepth, cornerCutRatio)
    .map((point) => point.setY(y1));
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < bottom.length; i++) {
    const next = (i + 1) % bottom.length;
    pushQuad(positions, indices, bottom[i], bottom[next], top[next], top[i]);
  }

  pushFan(positions, indices, top, false);
  pushFan(positions, indices, bottom, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function appendTaperedBox(
  buffers: GeometryBuffers,
  bottomWidth: number,
  bottomDepth: number,
  topWidth: number,
  topDepth: number,
  height: number,
  y: number,
  materialIndex: number = TAIPEI_MATERIAL.facade,
  cornerCutRatio = 0.105,
): void {
  appendGeometry(
    buffers,
    createTaperedBoxGeometry(
      bottomWidth,
      bottomDepth,
      topWidth,
      topDepth,
      height,
      cornerCutRatio,
    ),
    materialIndex,
    composeMatrix(0, y, 0),
  );
}

function cornerChamferSegment(
  width: number,
  depth: number,
  sx: number,
  sz: number,
  cutRatio = 0.11,
): { a: THREE.Vector3; b: THREE.Vector3 } {
  const cut = Math.min(width, depth) * cutRatio;
  const halfW = width / 2;
  const halfD = depth / 2;

  return {
    a: new THREE.Vector3(sx * (halfW - cut), 0, sz * halfD),
    b: new THREE.Vector3(sx * halfW, 0, sz * (halfD - cut)),
  };
}

function appendSlopedCornerPlate(
  buffers: GeometryBuffers,
  baseY: number,
  height: number,
  bottomWidth: number,
  bottomDepth: number,
  topWidth: number,
  topDepth: number,
  sx: number,
  sz: number,
  insetFactor = 0.5,
  outwardOffset = 0.18,
  cornerCutRatio = 0.11,
): void {
  const bottom = cornerChamferSegment(bottomWidth, bottomDepth, sx, sz, cornerCutRatio);
  const top = cornerChamferSegment(topWidth, topDepth, sx, sz, cornerCutRatio);
  const outward = new THREE.Vector3(sx, 0, sz).normalize();

  const makeInsetPair = (
    segment: { a: THREE.Vector3; b: THREE.Vector3 },
    y: number,
  ) => {
    const center = segment.a.clone().lerp(segment.b, 0.5);
    const tangent = segment.b.clone().sub(segment.a).normalize();
    const half = segment.a.distanceTo(segment.b) * insetFactor * 0.5;

    return {
      p0: center.clone().addScaledVector(tangent, -half).setY(y).addScaledVector(outward, outwardOffset),
      p1: center.clone().addScaledVector(tangent, half).setY(y).addScaledVector(outward, outwardOffset),
    };
  };

  const bottomPair = makeInsetPair(bottom, baseY);
  const topPair = makeInsetPair(top, baseY + height);
  let b0 = bottomPair.p0;
  let b1 = bottomPair.p1;
  let t0 = topPair.p0;
  let t1 = topPair.p1;
  const faceNormal = new THREE.Vector3()
    .crossVectors(b1.clone().sub(b0), t1.clone().sub(b0))
    .normalize();

  if (faceNormal.dot(outward) < 0) {
    [b0, b1] = [b1, b0];
    [t0, t1] = [t1, t0];
  }

  const positions: number[] = [];
  const indices: number[] = [];
  pushQuad(positions, indices, b0, b1, t1, t0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  appendGeometry(buffers, geometry, TAIPEI_MATERIAL.trim);
}

function addCornerWallDetails(
  buffers: GeometryBuffers,
  baseY: number,
  height: number,
  bottomWidth: number,
  bottomDepth: number,
  topWidth: number,
  topDepth: number,
  scale = 1,
  cornerCutRatio = 0.11,
): void {
  const detailBaseY = baseY + height * 0.08;
  const detailHeight = height * 0.84;
  const corners: CornerSign[] = [
    { sx: 1, sz: 1 },
    { sx: -1, sz: 1 },
    { sx: 1, sz: -1 },
    { sx: -1, sz: -1 },
  ];

  corners.forEach(({ sx, sz }) => {
    appendSlopedCornerPlate(
      buffers,
      detailBaseY,
      detailHeight,
      widthAt(bottomWidth, topWidth, 0.08),
      widthAt(bottomDepth, topDepth, 0.08),
      widthAt(bottomWidth, topWidth, 0.92),
      widthAt(bottomDepth, topDepth, 0.92),
      sx,
      sz,
      0.82,
      0.19 * scale,
      cornerCutRatio,
    );
    appendSlopedCornerPlate(
      buffers,
      detailBaseY + detailHeight * 0.04,
      detailHeight * 0.92,
      widthAt(bottomWidth, topWidth, 0.115),
      widthAt(bottomDepth, topDepth, 0.115),
      widthAt(bottomWidth, topWidth, 0.885),
      widthAt(bottomDepth, topDepth, 0.885),
      sx,
      sz,
      0.24,
      0.26 * scale,
      cornerCutRatio,
    );
  });
}

function addEave(
  buffers: GeometryBuffers,
  y: number,
  width: number,
  depth: number,
  scale = 1,
): void {
  appendBox(buffers, width + 5.8 * scale, 1.05 * scale, 1.8 * scale, 0, y, depth / 2 + 1.05 * scale);
  appendBox(buffers, width + 5.8 * scale, 1.05 * scale, 1.8 * scale, 0, y, -depth / 2 - 1.05 * scale);
  appendBox(buffers, 1.8 * scale, 1.05 * scale, depth + 5.8 * scale, width / 2 + 1.05 * scale, y, 0);
  appendBox(buffers, 1.8 * scale, 1.05 * scale, depth + 5.8 * scale, -width / 2 - 1.05 * scale, y, 0);

  appendBox(buffers, width + 3.8 * scale, 0.48 * scale, 0.8 * scale, 0, y + 1.05 * scale, depth / 2 + 1.85 * scale);
  appendBox(buffers, width + 3.8 * scale, 0.48 * scale, 0.8 * scale, 0, y + 1.05 * scale, -depth / 2 - 1.85 * scale);
  appendBox(buffers, 0.8 * scale, 0.48 * scale, depth + 3.8 * scale, width / 2 + 1.85 * scale, y + 1.05 * scale, 0);
  appendBox(buffers, 0.8 * scale, 0.48 * scale, depth + 3.8 * scale, -width / 2 - 1.85 * scale, y + 1.05 * scale, 0);

  const cornerOffsetX = width / 2 + 1.42 * scale;
  const cornerOffsetZ = depth / 2 + 1.42 * scale;
  const rotations = [
    { sx: 1, sz: 1, r: Math.PI / 4 },
    { sx: -1, sz: 1, r: -Math.PI / 4 },
    { sx: 1, sz: -1, r: -Math.PI / 4 },
    { sx: -1, sz: -1, r: Math.PI / 4 },
  ];

  rotations.forEach(({ sx, sz, r }) => {
    appendBox(buffers, 3.0 * scale, 1.12 * scale, 0.66 * scale, sx * cornerOffsetX, y + 0.12 * scale, sz * cornerOffsetZ, TAIPEI_MATERIAL.trim, r);
    appendBox(buffers, 2.0 * scale, 0.46 * scale, 0.34 * scale, sx * (cornerOffsetX + 0.08 * scale), y + 1.03 * scale, sz * (cornerOffsetZ + 0.08 * scale), TAIPEI_MATERIAL.trim, r);
  });
}

function addCornerClasp(
  buffers: GeometryBuffers,
  y: number,
  width: number,
  depth: number,
  scale = 1,
): void {
  const corners: CornerSign[] = [
    { sx: 1, sz: 1 },
    { sx: -1, sz: 1 },
    { sx: 1, sz: -1 },
    { sx: -1, sz: -1 },
  ];

  corners.forEach(({ sx, sz }) => {
    const x = sx * (width / 2 + 1.55 * scale);
    const z = sz * (depth / 2 + 1.55 * scale);
    appendSphere(
      buffers,
      0.58 * scale,
      16,
      10,
      x,
      y,
      z,
      new THREE.Vector3(1, 0.62, 1),
    );
    appendBox(buffers, 1.5 * scale, 0.28 * scale, 0.22 * scale, x - sx * 0.55 * scale, y, z);
    appendBox(buffers, 0.22 * scale, 0.28 * scale, 1.5 * scale, x, y, z - sz * 0.55 * scale);
    appendBox(buffers, 0.26 * scale, 1.35 * scale, 0.26 * scale, x, y - 0.82 * scale, z);
  });
}

function addLayeredModule(
  buffers: GeometryBuffers,
  baseY: number,
  height: number,
  bottomWidth: number,
  bottomDepth: number,
  topWidth: number,
  topDepth: number,
): void {
  appendTaperedBox(
    buffers,
    bottomWidth,
    bottomDepth,
    topWidth,
    topDepth,
    height,
    baseY + height / 2,
    TAIPEI_MATERIAL.facade,
    0.11,
  );
  addCornerWallDetails(buffers, baseY, height, bottomWidth, bottomDepth, topWidth, topDepth);
  addCornerClasp(buffers, baseY + height - 1.35, topWidth, topDepth, 0.95);
  addEave(buffers, baseY + height, topWidth, topDepth);
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
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(
    new THREE.Matrix4().makeScale(1 / size.x, 1 / size.y, 1 / size.z),
  );

  for (let i = 0; i < buffers.positions.length; i += 3) {
    const x = (buffers.positions[i] - box.min.x) / size.x - 0.5;
    const y = (buffers.positions[i + 1] - box.min.y) / size.y - 0.5;
    const z = (buffers.positions[i + 2] - box.min.z) / size.z - 0.5;
    buffers.positions[i] = x;
    buffers.positions[i + 1] = y;
    buffers.positions[i + 2] = z;
    buffers.projectionPositions[i] = x;
    buffers.projectionPositions[i + 1] = y;
    buffers.projectionPositions[i + 2] = z;

    const normal = scratchNormal.set(
      buffers.normals[i],
      buffers.normals[i + 1],
      buffers.normals[i + 2],
    ).applyMatrix3(normalMatrix).normalize();
    const projectionNormal = getProjectionNormal(normal, scratchProjectionNormal);
    buffers.normals[i] = normal.x;
    buffers.normals[i + 1] = normal.y;
    buffers.normals[i + 2] = normal.z;
    buffers.projectionNormals[i] = projectionNormal.x;
    buffers.projectionNormals[i + 1] = projectionNormal.y;
    buffers.projectionNormals[i + 2] = projectionNormal.z;
  }
}

function buildTaipeiGeometry(): THREE.BufferGeometry {
  const buffers: GeometryBuffers = {
    positions: [],
    normals: [],
    projectionPositions: [],
    projectionNormals: [],
    groups: [],
  };

  appendBox(buffers, 78, 6, 58, 0, 3, 0);
  appendBox(buffers, 70, 13, 50, 0, 12.5, 0, TAIPEI_MATERIAL.facade);
  appendBox(buffers, 58, 9, 42, 0, 23.5, 0, TAIPEI_MATERIAL.facade);
  appendBox(buffers, 36, 10, 12, 0, 12.8, 25.9);
  appendBox(buffers, 13, 7, 9, -22, 13.2, 27.5);
  appendBox(buffers, 13, 7, 9, 22, 13.2, 27.5);
  addEave(buffers, 29.8, 62, 45, 1.15);

  appendTaperedBox(buffers, 58, 44, 43, 34, 38, 49, TAIPEI_MATERIAL.facade, 0.095);
  addCornerWallDetails(buffers, 30, 38, 58, 44, 43, 34, 1.05);
  addCornerClasp(buffers, 67.6, 43, 34, 0.9);
  addEave(buffers, 69, 43, 34, 1.05);

  const moduleHeight = 30.6;
  const firstModuleBaseY = 69.2;
  const moduleOverlap = 0.18;
  const moduleStep = moduleHeight - moduleOverlap;
  const modules = Array.from({ length: 8 }, (_, index) => {
    const baseY = firstModuleBaseY + index * moduleStep;
    const bottomWidth = 38.6 - index * 1.78;
    const bottomDepth = 30.9 - index * 1.42;
    const topWidth = bottomWidth + 8.2;
    const topDepth = bottomDepth + 6.25;
    return { baseY, height: moduleHeight, bottomWidth, bottomDepth, topWidth, topDepth };
  });

  modules.forEach((module) => {
    addLayeredModule(
      buffers,
      module.baseY,
      module.height,
      module.bottomWidth,
      module.bottomDepth,
      module.topWidth,
      module.topDepth,
    );
  });

  const lastModule = modules[modules.length - 1];
  const crownBaseY = lastModule.baseY + lastModule.height - 0.1;

  appendTaperedBox(buffers, 31, 25, 26, 21, 16, crownBaseY + 8, TAIPEI_MATERIAL.trim, 0.12);
  addCornerWallDetails(buffers, crownBaseY, 16, 31, 25, 26, 21, 0.72);
  addCornerClasp(buffers, crownBaseY + 15.1, 26, 21, 0.64);
  addEave(buffers, crownBaseY + 16, 26, 21, 0.82);

  appendTaperedBox(buffers, 25, 20, 20, 16, 13, crownBaseY + 22.5, TAIPEI_MATERIAL.facade, 0.12);
  addCornerWallDetails(buffers, crownBaseY + 16, 13, 25, 20, 20, 16, 0.58);
  addEave(buffers, crownBaseY + 29, 20, 16, 0.62);

  appendTaperedBox(buffers, 17, 13.5, 13, 10, 12, crownBaseY + 35, TAIPEI_MATERIAL.facade, 0.13);
  addCornerWallDetails(buffers, crownBaseY + 29, 12, 17, 13.5, 13, 10, 0.46);
  addEave(buffers, crownBaseY + 41, 13, 10, 0.5);

  appendTaperedBox(buffers, 11.5, 9, 8, 6.5, 10, crownBaseY + 46, TAIPEI_MATERIAL.trim, 0.14);
  addCornerWallDetails(buffers, crownBaseY + 41, 10, 11.5, 9, 8, 6.5, 0.34);
  addEave(buffers, crownBaseY + 51, 8, 6.5, 0.4);

  appendCylinder(buffers, 4.2, 5.6, 5.8, 32, crownBaseY + 54);
  appendCylinder(buffers, 2.7, 3.5, 7.5, 32, crownBaseY + 60.65);
  appendCylinder(buffers, 1.15, 2.0, 26, 24, crownBaseY + 77.4);
  appendCylinder(buffers, 0.45, 0.8, 31, 20, crownBaseY + 105.9);
  appendSphere(buffers, 1.35, 24, 16, 0, crownBaseY + 122.75, 0);

  for (let i = 0; i < 5; i++) {
    const radius = 1.45 - i * 0.15;
    appendCylinder(buffers, radius, radius, 0.45, 24, crownBaseY + 67 + i * 7.2);
  }

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

function getTaipeiGeometry(): THREE.BufferGeometry {
  if (!sharedTaipeiGeometry) {
    sharedTaipeiGeometry = buildTaipeiGeometry();
  }
  return sharedTaipeiGeometry;
}

export function getTaipeiFootprintScaleAtHeightRatio(heightRatio: number): number {
  const y = clamp01(heightRatio);

  if (y < 30 / TAIPEI_RAW_HEIGHT) return 1;
  if (y < 69 / TAIPEI_RAW_HEIGHT) return THREE.MathUtils.lerp(0.74, 0.56, (y - 30 / TAIPEI_RAW_HEIGHT) / (39 / TAIPEI_RAW_HEIGHT));
  if (y < 313 / TAIPEI_RAW_HEIGHT) return THREE.MathUtils.lerp(0.6, 0.43, (y - 69 / TAIPEI_RAW_HEIGHT) / (244 / TAIPEI_RAW_HEIGHT));
  if (y < 364 / TAIPEI_RAW_HEIGHT) return THREE.MathUtils.lerp(0.38, 0.11, (y - 313 / TAIPEI_RAW_HEIGHT) / (51 / TAIPEI_RAW_HEIGHT));
  return THREE.MathUtils.lerp(0.08, 0.02, (y - 364 / TAIPEI_RAW_HEIGHT) / (71.39 / TAIPEI_RAW_HEIGHT));
}

export function getTaipeiTierFootprints(
  width = 1,
  depth = 1,
  height = 1,
): TaipeiTierFootprint[] {
  const levels = [0, 30, 69, 99.8, 130.22, 160.64, 191.06, 221.48, 251.9, 282.32, 313, 329, 342, 354, 364, TAIPEI_RAW_HEIGHT];

  return levels.slice(0, -1).map((bottom, index) => {
    const top = levels[index + 1];
    const middleRatio = ((bottom + top) / 2) / TAIPEI_RAW_HEIGHT;
    const scale = getTaipeiFootprintScaleAtHeightRatio(middleRatio);
    return {
      bottomY: (bottom / TAIPEI_RAW_HEIGHT) * height,
      topY: (top / TAIPEI_RAW_HEIGHT) * height,
      width: width * scale,
      depth: depth * scale,
    };
  });
}

export function createTaipeiBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(getTaipeiGeometry(), [facadeMaterial, topMaterial]);
  return mesh;
}

export function disposeTaipeiBuildingSharedResources(): void {
  if (sharedTaipeiGeometry) {
    sharedTaipeiGeometry.dispose();
    sharedTaipeiGeometry = null;
  }
}
