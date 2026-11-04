import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingShape } from "../types";
import { pickIndex } from "../utils/random";
import { getOctagonalFootprintPoints } from "./createOctagonalBuildingMesh";
import { getSetbackFootprintScaleAtHeightRatio } from "./createSetbackBuildingMesh";
import { getTaperedFootprintScaleAtHeightRatio } from "./createTaperedBuildingMesh";
import { getHearstRingFootprintPoints, HEARST_RING_COUNT } from "./createHearstBuildingMesh";

// Alturas relativas à largura da cobertura: parede, friso e capeamento.
const PROFILES = [
  [[0, 0.065, 1, 0.91, 0.78], [0.065, 0.016, 1.018, 0.898, 1]],
  [[0, 0.085, 1, 0.91, 0.78], [0.085, 0.012, 0.99, 0.92, 0.38], [0.097, 0.018, 1.025, 0.89, 1]],
  [[0, 0.018, 1.025, 0.90, 0.9], [0.018, 0.045, 1, 0.91, 0.72], [0.063, 0.012, 1.018, 0.90, 0.88], [0.075, 0.022, 1.045, 0.88, 1]],
] as const;

/** Anéis vazados: a laje existente fica aparente no centro, abaixo da borda. */
export function createParapetGeometry(shape: BuildingShape, variant = 0): THREE.BufferGeometry | null {
  let footprintScale = 1;
  let points: Array<{ x: number; z: number }>;
  switch (shape) {
    case "setback": footprintScale = getSetbackFootprintScaleAtHeightRatio(1); break;
    case "tapered": footprintScale = getTaperedFootprintScaleAtHeightRatio(1); break;
    case "default": case "twisted": case "octagonal": case "hearst": break;
    // Esses formatos já têm coroamento, cobertura ou pináculo próprio.
    default: return null;
  }
  if (shape === "octagonal") points = getOctagonalFootprintPoints();
  else if (shape === "hearst") points = getHearstRingFootprintPoints(1, 1, HEARST_RING_COUNT);
  else points = [{ x: -0.5, z: -0.5 }, { x: 0.5, z: -0.5 }, { x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }];
  // Twisted termina em 90°: a planta quadrada coincide com a do default.
  const parts = PROFILES[variant].map(([y, height, outer, inner, shade]) => {
    const contour = (scale: number) => points.map(({ x, z }) =>
      new THREE.Vector2(x * scale * footprintScale, z * scale * footprintScale));
    const ring = new THREE.Shape(contour(outer));
    ring.holes.push(new THREE.Path(contour(inner).reverse()));
    const geometry = new THREE.ExtrudeGeometry(ring, { depth: height * footprintScale, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, y * footprintScale, 0);
    // Friso escuro + capeamento claro dão relevo mesmo com iluminação só por IBL.
    const colors = new Float32Array(geometry.getAttribute("position").count * 3).fill(shade);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  // Mesma projeção em coordenadas de mundo usada pela textura da laje.
  geometry.setAttribute("aProjPosition", geometry.getAttribute("position").clone());
  geometry.setAttribute("aProjNormal", geometry.getAttribute("normal").clone());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function getParapetHeightScale(scale: THREE.Vector3): number {
  return Math.min(scale.x, scale.z, scale.y * 0.9);
}

export function createParapetMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#b9b6b1").multiplyScalar(0.8),
    roughness: 1, metalness: 0, clearcoat: 0, specularIntensity: 0,
    envMapIntensity: 0, vertexColors: true,
  });
}

type ParapetBuilding = {
  id: number;
  shape: BuildingShape;
  position: THREE.Vector3;
  scale: THREE.Vector3;
};

/** Um draw call por formato/modelo; nada de um Mesh por edifício. */
export function createBuildingParapets(scene: THREE.Scene, compositeFocus = false) {
  const material = createParapetMaterial();
  const focusMaterial = material.clone();
  const materials = [material, focusMaterial];
  const geometries = new Map<string, THREE.BufferGeometry | null>();
  const batches: Array<{
    mesh: THREE.InstancedMesh;
    entries: Array<ParapetBuilding & { visible: boolean }>;
  }> = [];
  const dummy = new THREE.Object3D();
  const rendered = new Map<number, { mesh: THREE.Mesh; index: number | null; baseY: number }>();
  let focusedId: number | null = null;
  let highlight: THREE.Mesh | null = null;

  const place = (building: ParapetBuilding) => {
    dummy.position.copy(building.position);
    dummy.position.y += building.scale.y / 2;
    dummy.scale.set(building.scale.x, getParapetHeightScale(building.scale), building.scale.z);
    dummy.updateMatrix();
  };

  const refresh = () => {
    rendered.clear();
    if (highlight) highlight.visible = false;
    for (const { mesh, entries } of batches) {
      let count = 0;
      for (const entry of entries) {
        if (!entry.visible) continue;
        place(entry);
        if (entry.id === focusedId) {
          if (!highlight) {
            highlight = new THREE.Mesh(mesh.geometry, focusMaterial);
            if (compositeFocus) highlight.layers.set(2);
            scene.add(highlight);
          }
          highlight.geometry = mesh.geometry;
          highlight.position.copy(dummy.position);
          highlight.scale.copy(dummy.scale);
          highlight.visible = true;
          rendered.set(entry.id, { mesh: highlight, index: null, baseY: dummy.position.y });
        } else {
          rendered.set(entry.id, { mesh, index: count, baseY: dummy.position.y });
          mesh.setMatrixAt(count++, dummy.matrix);
        }
      }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  };

  const clearBatches = () => {
    for (const { mesh } of batches) {
      scene.remove(mesh);
      mesh.dispose();
    }
    batches.length = 0;
  };

  return {
    materials,
    setVerticalOffset(id: number, offset: number) {
      const target = rendered.get(id);
      if (!target) return;
      if (target.index === null) target.mesh.position.y = target.baseY + offset;
      else {
        const mesh = target.mesh as THREE.InstancedMesh;
        mesh.getMatrixAt(target.index, dummy.matrix);
        dummy.matrix.elements[13] = target.baseY + offset;
        mesh.setMatrixAt(target.index, dummy.matrix);
        mesh.instanceMatrix.addUpdateRange(target.index * 16, 16);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.boundingSphere = null;
      }
    },
    updateTexture(topMaterial: THREE.MeshStandardMaterial) {
      for (const target of materials) {
        const mapsChanged = target.map !== topMaterial.map ||
          target.normalMap !== topMaterial.normalMap || target.bumpMap !== topMaterial.bumpMap;
        target.color.copy(topMaterial.color).multiplyScalar(0.8);
        target.map = topMaterial.map;
        target.normalMap = topMaterial.normalMap;
        target.normalScale.copy(topMaterial.normalScale);
        target.bumpMap = topMaterial.bumpMap;
        target.bumpScale = topMaterial.bumpScale;
        // Sem displacement nas bordas finas, nem parâmetros de reflexo da laje.
        if (mapsChanged) target.needsUpdate = true;
      }
    },
    rebuild(buildings: ParapetBuilding[]) {
      clearBatches();
      const grouped = new Map<string, ParapetBuilding[]>();
      for (const building of buildings) {
        const variant = pickIndex(building.id, 83, PROFILES.length);
        const key = `${building.shape}:${variant}`;
        if (!geometries.has(key)) geometries.set(key, createParapetGeometry(building.shape, variant));
        if (!geometries.get(key)) continue;
        let entries = grouped.get(key);
        if (!entries) { entries = []; grouped.set(key, entries); }
        entries.push(building);
      }
      for (const [key, entries] of grouped) {
        const mesh = new THREE.InstancedMesh(geometries.get(key)!, material, entries.length);
        if (compositeFocus) mesh.layers.set(1);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(mesh);
        batches.push({ mesh, entries: entries.map((entry) => ({ ...entry, visible: true })) });
      }
      refresh();
    },
    updateVisibility(isVisible: (position: THREE.Vector3) => boolean) {
      let changed = false;
      for (const { entries } of batches) {
        for (const entry of entries) {
          const visible = isVisible(entry.position);
          if (visible !== entry.visible) { entry.visible = visible; changed = true; }
        }
      }
      if (changed) refresh();
    },
    setFocus(id: number | null) {
      focusedId = id;
      const transparent = !compositeFocus && id !== null;
      material.opacity = transparent ? 0.15 : 1;
      material.depthWrite = !transparent;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      refresh();
    },
    dispose() {
      rendered.clear();
      clearBatches();
      if (highlight) scene.remove(highlight);
      for (const geometry of geometries.values()) geometry?.dispose();
      geometries.clear();
      material.dispose();
      focusMaterial.dispose();
    },
  };
}
