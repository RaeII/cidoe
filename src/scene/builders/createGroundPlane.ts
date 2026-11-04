import * as THREE from "three";
import type { GroundSettings, HorizonSettings } from "../types";
import { getGroundMaterialValues } from "../utils/materials";

export type GroundPlaneRig = {
  mesh: THREE.Mesh;
  update: (settings: GroundSettings) => void;
  updateHorizon: (settings: HorizonSettings) => void;
  updateCamera: (camera: THREE.PerspectiveCamera) => void;
  dispose: () => void;
};

export function createGroundPlane(
  scene: THREE.Scene,
  groundSettings: GroundSettings,
  horizonSettings: HorizonSettings,
): GroundPlaneRig {
  const groundMaterialValues = getGroundMaterialValues(
    groundSettings.roughness,
    groundSettings.metalness,
    groundSettings.materialType,
  );
  // Plano local: coordenadas pequenas preservam a separação de 0.01u do relevo na GPU.
  // Unitário + escala: mudar o tamanho não recria geometria nem re-envia buffer à GPU.
  const geometry = new THREE.PlaneGeometry(1, 1);
  const circleGeometry = new THREE.CircleGeometry(0.5, 256);
  let horizon = horizonSettings;
  const forward = new THREE.Vector3();
  const viewSize = new THREE.Vector2();
  const material = new THREE.MeshStandardMaterial({
    color: groundSettings.color,
    roughness: groundMaterialValues.roughness,
    metalness: groundMaterialValues.metalness,
  });
  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  // Chão local abaixo do relevo (TERRAIN_GROUND_Y = -0.04), seguindo a câmera.
  // Não estender com fundo cinza: essa camada aparece como uma elevação atrás das montanhas.
  mesh.position.y = -0.05;
  scene.add(mesh);

  return {
    mesh,
    update(settings) {
      const values = getGroundMaterialValues(
        settings.roughness,
        settings.metalness,
        settings.materialType,
      );
      material.color.set(settings.color);
      material.roughness = values.roughness;
      material.metalness = values.metalness;
      material.needsUpdate = true;
    },
    updateHorizon(settings) {
      horizon = settings;
    },
    updateCamera(camera) {
      const distance = horizon.groundDistance;
      mesh.geometry = horizon.groundEdgeMode === "circular" ? circleGeometry : geometry;
      mesh.position.set(camera.position.x, -0.05, camera.position.z);
      mesh.rotation.set(-Math.PI / 2, 0, 0, "YXZ");
      mesh.scale.set(distance * 2, distance * 2, 1);
      if (horizon.groundEdgeMode !== "straight") return;

      // far mede profundidade, não raio. Incluir os cantos do frustum (aspect/FOV/zoom)
      // mantém as duas laterais e a borda traseira fora da imagem, inclusive em ultrawide.
      camera.getViewSize(camera.far, viewSize);
      const radius = Math.hypot(camera.far, viewSize.x / 2, viewSize.y / 2) * 1.01;
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-10) forward.set(0, 0, -1);
      forward.normalize();
      mesh.rotation.y = Math.atan2(-forward.x, -forward.z);
      // Única borda exposta: perpendicular à direção horizontal da câmera.
      // Projetada na órbita sem roll, continua reta mesmo com groundDistance < far.
      mesh.scale.set(radius * 2, radius + distance, 1);
      mesh.position.addScaledVector(forward, (distance - radius) / 2);
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      circleGeometry.dispose();
      material.dispose();
    },
  };
}
