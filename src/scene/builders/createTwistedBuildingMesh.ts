import * as THREE from "three";

const TWIST_HEIGHT_SEGMENTS = 24;
// 90° do chão ao topo (estilo Cayan Tower). Exportado para que outros builders
// (LED de arestas, etc) possam acompanhar a curva torcida do edifício.
export const TWIST_TOTAL_ANGLE = Math.PI / 2;

let sharedTwistedGeometry: THREE.BufferGeometry | null = null;

function buildTwistedGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(
    1,
    1,
    1,
    1,
    TWIST_HEIGHT_SEGMENTS,
    1,
  );

  // Snapshot da posição/normal axis-aligned ANTES do twist. O shader triplanar
  // usa esses atributos para selecionar projeção e calcular UV — caso contrário,
  // a normal pós-twist atravessa a fronteira XY/ZY no meio do prédio e cria
  // uma costura visível.
  const projPositions = new Float32Array(geometry.attributes.position.array);
  const projNormals = new Float32Array(geometry.attributes.normal.array);
  geometry.setAttribute("aProjPosition", new THREE.BufferAttribute(projPositions, 3));
  geometry.setAttribute("aProjNormal", new THREE.BufferAttribute(projNormals, 3));

  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const angle = (y + 0.5) * TWIST_TOTAL_ANGLE;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    pos.setX(i, x * c - z * s);
    pos.setZ(i, x * s + z * c);
  }
  pos.needsUpdate = true;

  // Mesmo mapeamento da geometria base: topo (group materialIndex=2) → 1, demais → 0.
  for (const group of geometry.groups) {
    group.materialIndex = group.materialIndex === 2 ? 1 : 0;
  }

  geometry.computeVertexNormals();
  return geometry;
}

function getTwistedGeometry(): THREE.BufferGeometry {
  if (!sharedTwistedGeometry) {
    sharedTwistedGeometry = buildTwistedGeometry();
  }
  return sharedTwistedGeometry;
}

/**
 * Cria um Mesh torcido (twisted tower) reaproveitando uma geometria compartilhada.
 * O mesh tem volume unitário (1×1×1) — o caller deve aplicar escala/posição
 * por meio de `mesh.scale` e `mesh.position` para ajustar à doação.
 */
export function createTwistedBuildingMesh(
  facadeMaterial: THREE.Material,
  topMaterial: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(getTwistedGeometry(), [facadeMaterial, topMaterial]);
  return mesh;
}

/** Descarta a geometria compartilhada. Chamar apenas no dispose final do manager. */
export function disposeTwistedBuildingSharedResources(): void {
  if (sharedTwistedGeometry) {
    sharedTwistedGeometry.dispose();
    sharedTwistedGeometry = null;
  }
}
