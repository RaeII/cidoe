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

export type EmpireTierFootprint = {
  bottomY: number;
  topY: number;
  width: number;
  depth: number;
};

const EMPIRE_REFERENCE_WIDTH = 42;
const EMPIRE_REFERENCE_DEPTH = 28;
const EMPIRE_REFERENCE_HEIGHT = 166;
const EMPIRE_NORMALIZE_WIDTH = 44;
const EMPIRE_NORMALIZE_DEPTH = 30;

const EMPIRE_MATERIAL = {
  limestone: 0,
  roof: 1,
  limestoneLight: 2,
  limestoneDark: 3,
  window: 4,
  darkWindow: 5,
  metal: 6,
  darkMetal: 7,
} as const;

const EMPIRE_TIERS = [
  { bottom: 0, top: 8, width: 42, depth: 28 },
  { bottom: 8, top: 18, width: 34, depth: 24 },
  { bottom: 18, top: 28, width: 28, depth: 21 },
  { bottom: 28, top: 90, width: 23, depth: 18 },
  { bottom: 90, top: 100, width: 18.8, depth: 15.4 },
  { bottom: 100, top: 108, width: 14.4, depth: 11.6 },
  { bottom: 108, top: 113.8, width: 10.6, depth: 8.4 },
  { bottom: 113.8, top: 118.6, width: 7.3, depth: 6 },
] as const;

let sharedEmpireGeometry: THREE.BufferGeometry | null = null;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sourceToUnitPosition(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(
    x / EMPIRE_NORMALIZE_WIDTH,
    y / EMPIRE_REFERENCE_HEIGHT - 0.5,
    z / EMPIRE_NORMALIZE_DEPTH,
  );
}

function getProjectionNormal(normal: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
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

// Scratch reaproveitado: o Empire tem milhares de vértices. Um Vector3 novo por vértice
// e um BoxGeometry + toNonIndexed por caixa faziam o 1º build custar ~25 ms (tarefa longa
// no celular). Mesma saída: o índice é percorrido na ordem que o toNonIndexed expandiria.
const scratchPoint = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const scratchProjectionNormal = new THREE.Vector3();
const scratchNormalMatrix = new THREE.Matrix3();
const scratchBoxMatrix = new THREE.Matrix4();
const scratchBoxRotation = new THREE.Quaternion();
const scratchBoxScale = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
// Caixa unitária compartilhada; addBox escala pela matriz. Nunca descartada (24 vértices).
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

function appendGeometry(
  buffers: GeometryBuffers,
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  materialIndex: number,
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
    const vertexNormal = scratchNormal
      .fromBufferAttribute(normal, i)
      .applyNormalMatrix(normalMatrix)
      .normalize();
    const projectionNormal = getProjectionNormal(vertexNormal, scratchProjectionNormal);

    buffers.positions.push(point.x, point.y, point.z);
    buffers.normals.push(vertexNormal.x, vertexNormal.y, vertexNormal.z);
    buffers.projectionPositions.push(point.x, point.y, point.z);
    buffers.projectionNormals.push(
      projectionNormal.x,
      projectionNormal.y,
      projectionNormal.z,
    );
  }

  const count = buffers.positions.length / 3 - start;
  if (count > 0) {
    buffers.groups.push({ start, count, materialIndex });
  }
}

function addBox(
  buffers: GeometryBuffers,
  size: [number, number, number],
  position: [number, number, number],
  materialIndex: number,
  rotationY = 0,
): void {
  // Escala na matriz em vez de um BoxGeometry por caixa. Lado zero deixaria a matriz
  // normal singular → caminho antigo.
  if (size[0] !== 0 && size[1] !== 0 && size[2] !== 0) {
    scratchBoxMatrix.compose(
      sourceToUnitPosition(position[0], position[1], position[2]),
      scratchBoxRotation.setFromAxisAngle(Y_AXIS, rotationY),
      scratchBoxScale.set(
        size[0] / EMPIRE_NORMALIZE_WIDTH,
        size[1] / EMPIRE_REFERENCE_HEIGHT,
        size[2] / EMPIRE_NORMALIZE_DEPTH,
      ),
    );
    appendGeometry(buffers, UNIT_BOX, scratchBoxMatrix, materialIndex);
    return;
  }
  const geometry = new THREE.BoxGeometry(
    size[0] / EMPIRE_NORMALIZE_WIDTH,
    size[1] / EMPIRE_REFERENCE_HEIGHT,
    size[2] / EMPIRE_NORMALIZE_DEPTH,
  );
  const matrix = new THREE.Matrix4().compose(
    sourceToUnitPosition(position[0], position[1], position[2]),
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      rotationY,
    ),
    new THREE.Vector3(1, 1, 1),
  );
  appendGeometry(buffers, geometry, matrix, materialIndex);
  geometry.dispose();
}

function addVolume(
  buffers: GeometryBuffers,
  width: number,
  depth: number,
  height: number,
  y: number,
  materialIndex: number,
): void {
  addBox(buffers, [width, height, depth], [0, y + height / 2, 0], materialIndex);
}

function addCylinder(
  buffers: GeometryBuffers,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  materialIndex: number,
  segments = 32,
): void {
  const geometry = new THREE.CylinderGeometry(
    radiusTop,
    radiusBottom,
    height,
    segments,
    1,
    false,
  );
  const matrix = new THREE.Matrix4().compose(
    sourceToUnitPosition(position[0], position[1], position[2]),
    new THREE.Quaternion(),
    new THREE.Vector3(
      1 / EMPIRE_NORMALIZE_WIDTH,
      1 / EMPIRE_REFERENCE_HEIGHT,
      1 / EMPIRE_NORMALIZE_DEPTH,
    ),
  );
  appendGeometry(buffers, geometry, matrix, materialIndex);
  geometry.dispose();
}

function addCone(
  buffers: GeometryBuffers,
  radius: number,
  height: number,
  position: [number, number, number],
  materialIndex: number,
  segments = 32,
): void {
  const geometry = new THREE.ConeGeometry(radius, height, segments);
  const matrix = new THREE.Matrix4().compose(
    sourceToUnitPosition(position[0], position[1], position[2]),
    new THREE.Quaternion(),
    new THREE.Vector3(
      1 / EMPIRE_NORMALIZE_WIDTH,
      1 / EMPIRE_REFERENCE_HEIGHT,
      1 / EMPIRE_NORMALIZE_DEPTH,
    ),
  );
  appendGeometry(buffers, geometry, matrix, materialIndex);
  geometry.dispose();
}

function addFacadeWindows(
  buffers: GeometryBuffers,
  params: {
    face: "front" | "back" | "left" | "right";
    width: number;
    depth: number;
    yStart: number;
    yEnd: number;
    columns: number;
    rows: number;
    bayWidth: number;
    bayHeight: number;
    inset?: number;
    materialIndex?: number;
  },
): void {
  const {
    face,
    width,
    depth,
    yStart,
    yEnd,
    columns,
    rows,
    bayWidth,
    bayHeight,
    inset = 0.09,
    materialIndex = EMPIRE_MATERIAL.window,
  } = params;
  const horizontalSpan = face === "front" || face === "back" ? width : depth;
  const verticalSpan = yEnd - yStart;
  const columnPitch = horizontalSpan / columns;
  const rowPitch = verticalSpan / rows;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const u = -horizontalSpan / 2 + columnPitch * (col + 0.5);
      const y = yStart + rowPitch * (row + 0.5);

      if (face === "front") {
        addBox(
          buffers,
          [bayWidth, bayHeight, 0.055],
          [u, y, depth / 2 + inset],
          materialIndex,
        );
      } else if (face === "back") {
        addBox(
          buffers,
          [bayWidth, bayHeight, 0.055],
          [u, y, -depth / 2 - inset],
          materialIndex,
        );
      } else if (face === "right") {
        addBox(
          buffers,
          [0.055, bayHeight, bayWidth],
          [width / 2 + inset, y, u],
          materialIndex,
        );
      } else {
        addBox(
          buffers,
          [0.055, bayHeight, bayWidth],
          [-width / 2 - inset, y, u],
          materialIndex,
        );
      }
    }
  }
}

function addVerticalPierSet(
  buffers: GeometryBuffers,
  params: {
    face: "front" | "back" | "left" | "right";
    width: number;
    depth: number;
    yStart: number;
    yEnd: number;
    count: number;
    pierWidth: number;
    offset?: number;
  },
): void {
  const {
    face,
    width,
    depth,
    yStart,
    yEnd,
    count,
    pierWidth,
    offset = 0.18,
  } = params;
  const span = face === "front" || face === "back" ? width : depth;
  const pitch = span / count;
  const h = yEnd - yStart;

  for (let i = 0; i <= count; i++) {
    const u = -span / 2 + i * pitch;
    if (face === "front") {
      addBox(
        buffers,
        [pierWidth, h, 0.28],
        [u, yStart + h / 2, depth / 2 + offset],
        EMPIRE_MATERIAL.limestoneLight,
      );
    } else if (face === "back") {
      addBox(
        buffers,
        [pierWidth, h, 0.28],
        [u, yStart + h / 2, -depth / 2 - offset],
        EMPIRE_MATERIAL.limestoneLight,
      );
    } else if (face === "right") {
      addBox(
        buffers,
        [0.28, h, pierWidth],
        [width / 2 + offset, yStart + h / 2, u],
        EMPIRE_MATERIAL.limestoneLight,
      );
    } else {
      addBox(
        buffers,
        [0.28, h, pierWidth],
        [-width / 2 - offset, yStart + h / 2, u],
        EMPIRE_MATERIAL.limestoneLight,
      );
    }
  }
}

function addHorizontalBand(
  buffers: GeometryBuffers,
  width: number,
  depth: number,
  y: number,
  thickness: number,
  overhang: number,
  materialIndex: number,
): void {
  addBox(
    buffers,
    [width + overhang, thickness, depth + overhang],
    [0, y, 0],
    materialIndex,
  );
}

function addWindowBaysOnVolume(
  buffers: GeometryBuffers,
  width: number,
  depth: number,
  yStart: number,
  yEnd: number,
  colsFront: number,
  colsSide: number,
  rows: number,
): void {
  addFacadeWindows(buffers, {
    face: "front",
    width,
    depth,
    yStart,
    yEnd,
    columns: colsFront,
    rows,
    bayWidth: 0.54,
    bayHeight: 0.86,
  });
  addFacadeWindows(buffers, {
    face: "back",
    width,
    depth,
    yStart,
    yEnd,
    columns: colsFront,
    rows,
    bayWidth: 0.54,
    bayHeight: 0.86,
  });
  addFacadeWindows(buffers, {
    face: "right",
    width,
    depth,
    yStart,
    yEnd,
    columns: colsSide,
    rows,
    bayWidth: 0.54,
    bayHeight: 0.86,
  });
  addFacadeWindows(buffers, {
    face: "left",
    width,
    depth,
    yStart,
    yEnd,
    columns: colsSide,
    rows,
    bayWidth: 0.54,
    bayHeight: 0.86,
  });

  addVerticalPierSet(buffers, { face: "front", width, depth, yStart, yEnd, count: colsFront, pierWidth: 0.12 });
  addVerticalPierSet(buffers, { face: "back", width, depth, yStart, yEnd, count: colsFront, pierWidth: 0.12 });
  addVerticalPierSet(buffers, { face: "right", width, depth, yStart, yEnd, count: colsSide, pierWidth: 0.12 });
  addVerticalPierSet(buffers, { face: "left", width, depth, yStart, yEnd, count: colsSide, pierWidth: 0.12 });
}

function addPortal(buffers: GeometryBuffers, x: number, z: number): void {
  addBox(buffers, [2.05, 5.6, 0.42], [x, 2.9, z], EMPIRE_MATERIAL.limestoneLight);
  addBox(buffers, [1.26, 4.5, 0.47], [x, 2.45, z + 0.05], EMPIRE_MATERIAL.darkWindow);
  addBox(buffers, [1.85, 0.45, 0.5], [x, 5.35, z + 0.08], EMPIRE_MATERIAL.limestoneDark);
  addBox(buffers, [0.18, 4.6, 0.58], [x - 0.82, 2.72, z + 0.1], EMPIRE_MATERIAL.limestoneDark);
  addBox(buffers, [0.18, 4.6, 0.58], [x + 0.82, 2.72, z + 0.1], EMPIRE_MATERIAL.limestoneDark);
}

function buildEmpireGeometry(): THREE.BufferGeometry {
  const buffers: GeometryBuffers = {
    positions: [],
    normals: [],
    projectionPositions: [],
    projectionNormals: [],
    groups: [],
  };

  addVolume(buffers, 42, 28, 8, 0, EMPIRE_MATERIAL.limestone);
  addVolume(buffers, 34, 24, 10, 8, EMPIRE_MATERIAL.limestone);
  addVolume(buffers, 28, 21, 10, 18, EMPIRE_MATERIAL.limestone);
  addVolume(buffers, 23, 18, 62, 28, EMPIRE_MATERIAL.limestone);
  addVolume(buffers, 18.8, 15.4, 10, 90, EMPIRE_MATERIAL.limestoneLight);
  addVolume(buffers, 14.4, 11.6, 8, 100, EMPIRE_MATERIAL.limestone);
  addVolume(buffers, 10.6, 8.4, 5.8, 108, EMPIRE_MATERIAL.limestoneLight);
  addVolume(buffers, 7.3, 6, 4.8, 113.8, EMPIRE_MATERIAL.limestone);

  addHorizontalBand(buffers, 42, 28, 8.08, 0.34, 0.7, EMPIRE_MATERIAL.roof);
  addHorizontalBand(buffers, 34, 24, 18.08, 0.32, 0.6, EMPIRE_MATERIAL.roof);
  addHorizontalBand(buffers, 28, 21, 28.08, 0.32, 0.55, EMPIRE_MATERIAL.roof);
  addHorizontalBand(buffers, 23, 18, 90.08, 0.38, 0.5, EMPIRE_MATERIAL.limestoneDark);
  addHorizontalBand(buffers, 18.8, 15.4, 100.08, 0.32, 0.45, EMPIRE_MATERIAL.limestoneDark);
  addHorizontalBand(buffers, 14.4, 11.6, 108.08, 0.28, 0.38, EMPIRE_MATERIAL.limestoneDark);
  addHorizontalBand(buffers, 10.6, 8.4, 113.88, 0.28, 0.34, EMPIRE_MATERIAL.limestoneDark);

  addWindowBaysOnVolume(buffers, 42, 28, 1.2, 7.2, 16, 10, 4);
  addWindowBaysOnVolume(buffers, 34, 24, 9.4, 17.2, 13, 9, 5);
  addWindowBaysOnVolume(buffers, 28, 21, 19.2, 27.1, 11, 8, 5);
  addWindowBaysOnVolume(buffers, 23, 18, 30, 88.8, 9, 7, 36);
  addWindowBaysOnVolume(buffers, 18.8, 15.4, 91.3, 98.8, 7, 5, 5);
  addWindowBaysOnVolume(buffers, 14.4, 11.6, 101.2, 106.8, 5, 4, 4);

  addBox(buffers, [3.2, 59.2, 0.11], [0, 59.2, 18 / 2 + 0.34], EMPIRE_MATERIAL.darkWindow);
  addBox(buffers, [3.2, 59.2, 0.11], [0, 59.2, -18 / 2 - 0.34], EMPIRE_MATERIAL.darkWindow);
  addBox(buffers, [0.11, 59.2, 2.7], [23 / 2 + 0.34, 59.2, 0], EMPIRE_MATERIAL.darkWindow);
  addBox(buffers, [0.11, 59.2, 2.7], [-23 / 2 - 0.34, 59.2, 0], EMPIRE_MATERIAL.darkWindow);

  for (const x of [-10.2, -7.7, -4.9, 4.9, 7.7, 10.2]) {
    addBox(buffers, [0.34, 62.2, 0.42], [x, 59.1, 18 / 2 + 0.44], EMPIRE_MATERIAL.limestoneLight);
    addBox(buffers, [0.34, 62.2, 0.42], [x, 59.1, -18 / 2 - 0.44], EMPIRE_MATERIAL.limestoneLight);
  }

  for (const z of [-8, -5.2, 5.2, 8]) {
    addBox(buffers, [0.42, 62.2, 0.34], [23 / 2 + 0.44, 59.1, z], EMPIRE_MATERIAL.limestoneLight);
    addBox(buffers, [0.42, 62.2, 0.34], [-23 / 2 - 0.44, 59.1, z], EMPIRE_MATERIAL.limestoneLight);
  }

  addPortal(buffers, -8, 28 / 2 + 0.24);
  addPortal(buffers, 8, 28 / 2 + 0.24);
  addPortal(buffers, 0, 28 / 2 + 0.28);

  addBox(buffers, [41.2, 0.18, 27.2], [0, 8.42, 0], EMPIRE_MATERIAL.roof);
  addBox(buffers, [33.2, 0.18, 23.2], [0, 18.42, 0], EMPIRE_MATERIAL.roof);
  addBox(buffers, [27.2, 0.18, 20.2], [0, 28.42, 0], EMPIRE_MATERIAL.roof);

  addCylinder(buffers, 4.5, 4.9, 3, [0, 120.1, 0], EMPIRE_MATERIAL.limestoneDark, 48);
  addCylinder(buffers, 3.8, 4.2, 4.2, [0, 123.7, 0], EMPIRE_MATERIAL.metal, 48);
  addCylinder(buffers, 2.75, 3.15, 8, [0, 129.8, 0], EMPIRE_MATERIAL.darkMetal, 48);
  addCylinder(buffers, 1.65, 2.15, 5, [0, 136.3, 0], EMPIRE_MATERIAL.metal, 48);
  addCone(buffers, 1.6, 5.2, [0, 141.4, 0], EMPIRE_MATERIAL.darkMetal, 48);
  addCylinder(buffers, 0.28, 0.34, 14, [0, 151, 0], EMPIRE_MATERIAL.darkMetal, 24);
  addCylinder(buffers, 0.12, 0.16, 8, [0, 162, 0], EMPIRE_MATERIAL.darkMetal, 16);

  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const x = Math.cos(angle) * 3.15;
    const z = Math.sin(angle) * 3.15;
    addBox(
      buffers,
      [0.18, 8.8, 0.18],
      [x, 129.7, z],
      EMPIRE_MATERIAL.limestoneLight,
      -angle,
    );
  }

  for (const x of [-6.4, -3.2, 3.2, 6.4]) {
    addBox(buffers, [0.3, 10.8, 0.38], [x, 95.2, 15.4 / 2 + 0.32], EMPIRE_MATERIAL.limestoneLight);
    addBox(buffers, [0.3, 10.8, 0.38], [x, 95.2, -15.4 / 2 - 0.32], EMPIRE_MATERIAL.limestoneLight);
  }

  for (const z of [-5.2, -2.4, 2.4, 5.2]) {
    addBox(buffers, [0.38, 10.8, 0.3], [18.8 / 2 + 0.32, 95.2, z], EMPIRE_MATERIAL.limestoneLight);
    addBox(buffers, [0.38, 10.8, 0.3], [-18.8 / 2 - 0.32, 95.2, z], EMPIRE_MATERIAL.limestoneLight);
  }

  addBox(buffers, [16.4, 0.7, 13], [0, 111.6, 0], EMPIRE_MATERIAL.limestoneDark);
  addBox(buffers, [12.4, 0.65, 9.8], [0, 116.6, 0], EMPIRE_MATERIAL.limestoneDark);
  addBox(buffers, [8.6, 0.55, 7], [0, 119, 0], EMPIRE_MATERIAL.limestoneDark);

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

function getEmpireGeometry(): THREE.BufferGeometry {
  if (!sharedEmpireGeometry) {
    sharedEmpireGeometry = buildEmpireGeometry();
  }
  return sharedEmpireGeometry;
}

export function clearTextureSlots(material: THREE.Material): void {
  material.userData.textureless = true;

  if (material instanceof THREE.MeshStandardMaterial) {
    material.map = null;
    material.normalMap = null;
    material.roughnessMap = null;
    material.metalnessMap = null;
    material.bumpMap = null;
    material.displacementMap = null;
    material.displacementScale = 0;
    material.emissiveMap = null;
    material.emissiveIntensity = 0;
    material.needsUpdate = true;
  }
}

function setMaterialColor(material: THREE.Material, color: THREE.Color | number): void {
  if (material instanceof THREE.MeshStandardMaterial) {
    material.color.set(color);
    material.needsUpdate = true;
  }
}

function configureBaseMaterials(
  facadeMaterial: THREE.Material,
  roofMaterial: THREE.Material,
): void {
  clearTextureSlots(facadeMaterial);
  clearTextureSlots(roofMaterial);

  if (facadeMaterial instanceof THREE.MeshStandardMaterial) {
    facadeMaterial.color.set(0xcdbf9e);
    facadeMaterial.roughness = 0.82;
    facadeMaterial.metalness = 0.02;
  }

  if (roofMaterial instanceof THREE.MeshStandardMaterial) {
    roofMaterial.color.set(0x3d2418);
    roofMaterial.roughness = 0.72;
    roofMaterial.metalness = 0.04;
  }
}

function createExtraMaterial(
  color: number,
  roughness: number,
  metalness: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
  });
}

export function getEmpireFootprintScaleAtHeightRatio(
  heightRatio: number,
): { x: number; z: number } {
  const y = clamp01(heightRatio) * EMPIRE_REFERENCE_HEIGHT;
  const tier =
    EMPIRE_TIERS.find((entry) => y >= entry.bottom && y <= entry.top) ??
    EMPIRE_TIERS[EMPIRE_TIERS.length - 1];

  return {
    x: tier.width / EMPIRE_REFERENCE_WIDTH,
    z: tier.depth / EMPIRE_REFERENCE_DEPTH,
  };
}

export function getEmpireTierFootprints(
  width = 1,
  depth = 1,
  height = 1,
): EmpireTierFootprint[] {
  return EMPIRE_TIERS.map((tier) => ({
    bottomY: (tier.bottom / EMPIRE_REFERENCE_HEIGHT) * height,
    topY: (tier.top / EMPIRE_REFERENCE_HEIGHT) * height,
    width: width * (tier.width / EMPIRE_REFERENCE_WIDTH),
    depth: depth * (tier.depth / EMPIRE_REFERENCE_DEPTH),
  }));
}

export function setEmpireBuildingMeshColor(mesh: THREE.Mesh, color: string): void {
  const base = new THREE.Color(color);
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.22);
  const dark = base.clone().multiplyScalar(0.72);
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  setMaterialColor(materials[EMPIRE_MATERIAL.limestone], base);
  setMaterialColor(materials[EMPIRE_MATERIAL.limestoneLight], light);
  setMaterialColor(materials[EMPIRE_MATERIAL.limestoneDark], dark);
}

export function createEmpireBuildingMesh(
  facadeMaterial: THREE.Material,
  roofMaterial: THREE.Material,
): THREE.Mesh {
  configureBaseMaterials(facadeMaterial, roofMaterial);

  const limestoneLight = createExtraMaterial(0xe2d5b6, 0.78, 0.02);
  const limestoneDark = createExtraMaterial(0x9d9178, 0.86, 0.01);
  const windowMat = createExtraMaterial(0x17222a, 0.38, 0.28);
  const darkWindowMat = createExtraMaterial(0x0c1217, 0.42, 0.22);
  const metalMat = createExtraMaterial(0x73797d, 0.32, 0.72);
  const darkMetalMat = createExtraMaterial(0x2b343b, 0.42, 0.62);

  const mesh = new THREE.Mesh(getEmpireGeometry(), [
    facadeMaterial,
    roofMaterial,
    limestoneLight,
    limestoneDark,
    windowMat,
    darkWindowMat,
    metalMat,
    darkMetalMat,
  ]);

  return mesh;
}

export function disposeEmpireBuildingSharedResources(): void {
  if (sharedEmpireGeometry) {
    sharedEmpireGeometry.dispose();
    sharedEmpireGeometry = null;
  }
}
