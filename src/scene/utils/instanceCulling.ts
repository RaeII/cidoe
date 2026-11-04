import * as THREE from "three";

/**
 * Cull de distância para InstancedMesh do chão da cidade (lotes, calçadas, postes,
 * asfalto). Mesmo esquema dos prédios: as matrizes ficam num snapshot lógico e o
 * buffer renderizado é compactado só com as visíveis, então `count` corta vértices
 * de verdade — não é `visible = false` por objeto nem zero-scale.
 *
 * Meshes de um mesmo grupo compartilham o índice lógico (poste + luminária + mancha
 * de luz são a MESMA instância vista de três meshes) e somem juntos.
 */
export type InstanceCullGroup = {
  meshes: ReadonlyArray<THREE.InstancedMesh | null>;
  /** Matrizes lógicas por mesh (count * 16 floats). */
  logical: Float32Array[];
  /** Posição XZ de cada instância, lida da translação do primeiro mesh do grupo. */
  posX: Float32Array;
  posZ: Float32Array;
  count: number;
  visibleIndices: Int32Array;
  visibleCount: number;
  bounds: THREE.Sphere[];
};

// Índices visíveis do passe atual. Módulo-level pra não alocar a cada cull.
let keepScratch = new Int32Array(0);

/** Congela as matrizes já escritas nos meshes. Chamar no fim de cada rebuild. */
export function snapshotInstances(
  meshes: ReadonlyArray<THREE.InstancedMesh | null>,
  count: number,
): InstanceCullGroup | null {
  const first = meshes[0];
  if (!first || count === 0) return null;
  const logical = meshes.map((m) =>
    m ? (m.instanceMatrix.array as Float32Array).slice(0, count * 16) : new Float32Array(0),
  );
  const posX = new Float32Array(count);
  const posZ = new Float32Array(count);
  const src = logical[0];
  const bounds: THREE.Sphere[] = [];
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  for (const mesh of meshes) {
    if (!mesh) continue;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    mesh.geometry.computeBoundingBox();
    mesh.computeBoundingSphere(); // Inclui as instâncias temporariamente ocultas.
  }
  for (let i = 0; i < count; i++) {
    posX[i] = src[i * 16 + 12];
    posZ[i] = src[i * 16 + 14];
    box.makeEmpty();
    for (let mi = 0; mi < meshes.length; mi++) {
      const mesh = meshes[mi];
      if (!mesh) continue;
      matrix.fromArray(logical[mi], i * 16);
      box.union(part.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix));
    }
    bounds.push(box.getBoundingSphere(new THREE.Sphere()));
  }
  return { meshes, logical, posX, posZ, count, bounds,
    visibleIndices: Int32Array.from({ length: count }, (_, i) => i), visibleCount: count };
}

function writeCompact(group: InstanceCullGroup, kept: number, firstChanged: number): void {
  for (let mi = 0; mi < group.meshes.length; mi++) {
    const mesh = group.meshes[mi];
    if (!mesh) continue;
    const src = group.logical[mi];
    const dst = mesh.instanceMatrix.array as Float32Array;
    for (let k = firstChanged; k < kept; k++) {
      const s = keepScratch[k] * 16;
      const d = k * 16;
      for (let f = 0; f < 16; f++) dst[d + f] = src[s + f];
    }
    mesh.count = kept;
    if (firstChanged < kept) {
      mesh.instanceMatrix.addUpdateRange(firstChanged * 16, (kept - firstChanged) * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  group.visibleIndices.set(keepScratch.subarray(0, kept));
  group.visibleCount = kept;
}

/** Compacta o grupo com as instâncias aprovadas por `visible`. Retorna quantas sumiram. */
export function cullInstances(
  group: InstanceCullGroup | null,
  visible: (x: number, z: number) => boolean,
  frustum?: THREE.Frustum | null,
): number {
  if (!group) return 0;
  if (keepScratch.length < group.count) keepScratch = new Int32Array(group.count);
  let kept = 0;
  let firstChanged = group.count;
  for (let i = 0; i < group.count; i++) {
    if (!visible(group.posX[i], group.posZ[i]) || (frustum && !frustum.intersectsSphere(group.bounds[i]))) continue;
    if (kept >= group.visibleCount || group.visibleIndices[kept] !== i) firstChanged = Math.min(firstChanged, kept);
    keepScratch[kept++] = i;
  }
  if (firstChanged < kept || kept !== group.visibleCount) writeCompact(group, kept, firstChanged);
  return group.count - kept;
}

/** Devolve todas as instâncias — o probe de reflexo captura a cidade inteira. */
export function restoreInstances(group: InstanceCullGroup | null): void {
  cullInstances(group, () => true);
}
