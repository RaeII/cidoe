import * as THREE from "three";

const TAPER_HEIGHT_SEGMENTS = 28;
const TAPER_TOP_SCALE = 0.36;
const TAPER_PROFILE_EXPONENT = 1.45;

let sharedTaperedGeometry: THREE.BufferGeometry | null = null;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Escala do footprint em uma altura normalizada [0,1].
 *
 * 0 = base (100%), 1 = topo (TAPER_TOP_SCALE). O perfil usa uma curva easing
 * para reduzir massa gradualmente no começo e acelerar no terço superior,
 * aproximando a leitura de torres supertall afuniladas.
 */
export function getTaperedFootprintScaleAtHeightRatio(heightRatio: number): number {
  const t = Math.pow(clamp01(heightRatio), TAPER_PROFILE_EXPONENT);
  return 1 - (1 - TAPER_TOP_SCALE) * t;
}

function buildTaperedGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 1, TAPER_HEIGHT_SEGMENTS, 1);

  // Mantém projeção triplanar estável por face (igual ao eixo cardinal da caixa
  // original), evitando alternância XY/ZY induzida pela inclinação das normais
  // pós-deformação da fachada afunilada.
  const projPositions = new Float32Array(geometry.attributes.position.array);
  const projNormals = new Float32Array(geometry.attributes.normal.array);
  geometry.setAttribute("aProjPosition", new THREE.BufferAttribute(projPositions, 3));
  geometry.setAttribute("aProjNormal", new THREE.BufferAttribute(projNormals, 3));

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const heightRatio = y + 0.5;
    const footprintScale = getTaperedFootprintScaleAtHeightRatio(heightRatio);
    positions.setX(i, positions.getX(i) * footprintScale);
    positions.setZ(i, positions.getZ(i) * footprintScale);
  }
  positions.needsUpdate = true;

  for (const group of geometry.groups) {
    group.materialIndex = group.materialIndex === 2 ? 1 : 0;
  }

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function getTaperedGeometry(): THREE.BufferGeometry {
  if (!sharedTaperedGeometry) {
    sharedTaperedGeometry = buildTaperedGeometry();
  }
  return sharedTaperedGeometry;
}

export function createTaperedBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(getTaperedGeometry(), [facadeMaterial, topMaterial]);
  return mesh;
}

export function disposeTaperedBuildingSharedResources(): void {
  if (sharedTaperedGeometry) {
    sharedTaperedGeometry.dispose();
    sharedTaperedGeometry = null;
  }
}
