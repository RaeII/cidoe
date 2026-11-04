import * as THREE from "three";
import {
  createBuildingShapeMesh,
  createUnitBuildingGeometry,
  isBuildingShape,
} from "./createBuildingShapeMesh";
import {
  createEdgeLightMesh,
  disposeEdgeLightMesh,
  isEdgeLightType,
} from "./createEdgeLightMesh";
import {
  createRooftopMesh,
  disposeRooftopMesh,
  isRooftopType,
} from "./createRooftopMesh";
import type { BuildingCustomization, BuildingShape, EdgeLightType, RooftopType } from "../types";
import type { FacadeTextureSet } from "../textures/facadeTextureLoader";
import { createSignMesh, disposeSignMesh } from "./createSignMesh";
import { createHologramMesh, disposeHologramMesh, positionHologram, setHologramImage, setHologramOpacity, setHologramTint, tickHologram } from "./createHologramMesh";
import { setEmpireBuildingMeshColor } from "./createEmpireBuildingMesh";
import { getResidentialRoofOffset, RESIDENTIAL_ROOFTOP_SCALE, setResidentialStoneMaps } from "./createResidentialBuildingMesh";
import { APARTMENT_ROOFTOP_SCALE } from "./createApartmentBuildingMesh";
import { GOURMET_ROOFTOP_SCALE } from "./createGourmetBuildingMesh";
import { LOFT_ROOFTOP_SCALE } from "./createLoftBuildingMesh";
import {
  getYachthouseRoofOffset,
  YACHTHOUSE_PREVIEW_HEIGHT,
  YACHTHOUSE_ROOFTOP_SCALE,
  YACHTHOUSE_TOWER_CENTERS,
} from "./createYachthouseBuildingMesh";
import { createParapetGeometry, createParapetMaterial, getParapetHeightScale } from "./createParapetMesh";

/** O que mostrar. `key` vem do catálogo — pode não ter builder no front. */
export type PreviewSubject = {
  kind: "shape" | "rooftop" | "edgeLight";
  key: string;
};

export type ResolvedSubject =
  | { kind: "shape"; shape: BuildingShape }
  | { kind: "rooftop"; type: Exclude<RooftopType, "none"> }
  | { kind: "edgeLight"; type: Exclude<EdgeLightType, "none"> };

// Prédio-base e elevação da câmera por tipo. O alvo tem que dominar o quadro:
// topo pede prédio baixo com câmera alta; formato pede prédio alto (geometria é
// 1×1×1 — sem esticar, Empire/Chrysler viram cubos).
const VIEW: Record<PreviewSubject["kind"], { height: number; elevation: number }> = {
  shape: { height: 3, elevation: 0.42 },
  rooftop: { height: 0.8, elevation: 0.95 },
  edgeLight: { height: 2.2, elevation: 0.55 },
};

const FOV = 32;

/** Aparência completa para a criação do edifício; omitida nas miniaturas do Passe. */
export type BuildingPreviewAppearance = {
  customization: BuildingCustomization;
  facadeTextures?: FacadeTextureSet | null;
  topTextures?: FacadeTextureSet | null;
  onReady?: () => void;
};

/**
 * Key do catálogo -> builder. `null` = sem builder no front, ou `none`
 * (ausência de acessório) — quem chama mostra placeholder em vez de canvas.
 */
export function resolveSubject({ kind, key }: PreviewSubject): ResolvedSubject | null {
  if (kind === "shape") return isBuildingShape(key) ? { kind, shape: key } : null;
  if (kind === "rooftop") {
    return isRooftopType(key) && key !== "none" ? { kind, type: key } : null;
  }
  return isEdgeLightType(key) && key !== "none" ? { kind, type: key } : null;
}

/** Prédio + acessório, prontos pra cena. */
function buildSubject(resolved: ResolvedSubject, appearance?: BuildingPreviewAppearance) {
  const customization = appearance?.customization;
  const shape = customization?.buildingShape ?? (resolved.kind === "shape" ? resolved.shape : "default");
  // Yatchcasa é esbelta: altura própria (= a da geometria padrão do builder).
  const height = resolved.kind === "shape" && shape === "yachthouse"
    ? YACHTHOUSE_PREVIEW_HEIGHT
    : VIEW[resolved.kind].height;
  const accessory =
    !customization && resolved.kind === "rooftop"
      ? createRooftopMesh(resolved.type, { width: 1, depth: 1 })
      : !customization && resolved.kind === "edgeLight"
        ? createEdgeLightMesh(resolved.type, { width: 1, depth: 1, height }, shape)
        : null;

  const facadeMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3ab,
    roughness: 0.72,
    metalness: 0.1,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: 0x6d7378,
    roughness: 0.86,
    metalness: 0.04,
  });
  const boxGeometry = createUnitBuildingGeometry();
  const building = createBuildingShapeMesh(shape, facadeMat, topMat, boxGeometry);
  building.name = "building";
  building.scale.set(1, height, 1);

  const ownedTextures: THREE.Texture[] = [];
  function applyMaps(material: THREE.MeshStandardMaterial, maps?: FacadeTextureSet | null) {
    if (!maps || material.userData.textureless) return;
    for (const [slot, map] of [["map", maps.color], ["normalMap", maps.normal], ["roughnessMap", maps.roughness], ["metalnessMap", maps.metalness]] as const) {
      if (!map) continue;
      const texture = map.clone();
      const transform = customization?.textureTransform;
      const tiling = customization?.tilingScale ?? 1;
      texture.repeat.set((transform?.scaleX ?? 1) * tiling, (transform?.scaleY ?? 1) * tiling * height);
      texture.offset.set(transform?.offsetX ?? 0, transform?.offsetY ?? 0);
      texture.needsUpdate = true;
      material[slot] = texture;
      ownedTextures.push(texture);
    }
    material.needsUpdate = true;
  }
  if (customization) {
    if (shape === "empire") setEmpireBuildingMeshColor(building, customization.color);
    else facadeMat.color.set(customization.color);
    topMat.color.set("#b9b6b1");
    if (shape === "residential" || shape === "apartment" || shape === "gourmet" || shape === "loft") setResidentialStoneMaps(facadeMat, appearance?.topTextures ?? null);
    else applyMaps(facadeMat, appearance?.facadeTextures);
    applyMaps(topMat, appearance?.topTextures);
  }

  const root = new THREE.Group();
  root.add(building);
  const parapetGeometry = createParapetGeometry(shape);
  const parapetMaterial = createParapetMaterial();
  parapetMaterial.color.copy(topMat.color).multiplyScalar(0.8);
  if (parapetGeometry) {
    const parapet = new THREE.Mesh(parapetGeometry, parapetMaterial);
    parapet.position.y = height / 2;
    parapet.scale.y = getParapetHeightScale(building.scale);
    root.add(parapet);
  }
  if (accessory) {
    // Topo do prédio pro rooftop, base pro LED (o grupo cresce até `height`).
    accessory.position.setY(resolved.kind === "rooftop" ? height / 2 : -height / 2);
    root.add(accessory);
  }

  const rooftops: THREE.Group[] = [];
  let edgeLight: THREE.Group | null = null;
  let sign: THREE.Group | null = null;
  let hologram: ReturnType<typeof createHologramMesh> | null = null;
  let disposed = false;
  if (customization) {
    const centers = shape === "yachthouse" ? YACHTHOUSE_TOWER_CENTERS : [0];
    for (const x of centers) {
      const scale = shape === "residential" ? RESIDENTIAL_ROOFTOP_SCALE
        : shape === "apartment" ? APARTMENT_ROOFTOP_SCALE
          : shape === "gourmet" ? GOURMET_ROOFTOP_SCALE
          : shape === "loft" ? LOFT_ROOFTOP_SCALE
          : shape === "yachthouse" ? YACHTHOUSE_ROOFTOP_SCALE : 1;
      const rooftop = createRooftopMesh(customization.rooftopType, { width: scale, depth: scale });
      if (rooftop) {
        rooftop.name = "rooftop";
        const roofHeight = shape === "yachthouse" ? getYachthouseRoofOffset(height) : shape === "residential" ? getResidentialRoofOffset(height) : height / 2;
        rooftop.position.set(x, roofHeight, 0);
        root.add(rooftop);
        rooftops.push(rooftop);
      }
    }
    edgeLight = createEdgeLightMesh(customization.edgeLightType, { width: 1, depth: 1, height }, shape);
    if (edgeLight) {
      edgeLight.name = "edgeLight";
      edgeLight.position.y = -height / 2;
      root.add(edgeLight);
    }
    sign = createSignMesh(customization.signText, 1, 1, height, customization.signSides, shape);
    if (sign) {
      sign.name = "sign";
      root.add(sign);
    }
    if (customization.hologramImage) {
      const footprint = { width: 1, depth: 1, height };
      hologram = createHologramMesh(footprint, { color: customization.hologramColor, opacity: customization.hologramOpacity });
      hologram.group.name = "hologram";
      positionHologram(hologram, new THREE.Vector3(), footprint);
      root.add(hologram.group);
      const entry = hologram;
      void setHologramImage(entry, customization.hologramImage, footprint).then(() => {
        if (disposed) return;
        positionHologram(entry, new THREE.Vector3(), footprint);
        appearance?.onReady?.();
      }).catch((error: unknown) => { if (!disposed) console.warn("Falha ao carregar holograma da prévia", error); });
    }
  }

  const dispose = () => {
    disposed = true;
    const materials = Array.isArray(building.material) ? building.material : [building.material];
    for (const material of new Set([...materials, facadeMat, topMat])) material.dispose();
    for (const texture of ownedTextures) texture.dispose();
    // Só a caixa é nossa: geometrias de formato/acessório são cache dos builders.
    boxGeometry.dispose();
    parapetGeometry?.dispose();
    parapetMaterial.dispose();
    if (accessory) {
      (resolved.kind === "rooftop" ? disposeRooftopMesh : disposeEdgeLightMesh)(accessory);
    }
    for (const rooftop of rooftops) disposeRooftopMesh(rooftop);
    if (edgeLight) disposeEdgeLightMesh(edgeLight);
    if (sign) disposeSignMesh(sign);
    if (hologram) disposeHologramMesh(hologram);
  };

  const bounds = () => {
    const box = frameBox(root);
    if (hologram) box.union(new THREE.Box3().setFromObject(hologram.group));
    return box;
  };
  const tick = (elapsed: number, deltaMs: number) => { if (hologram) tickHologram(hologram, elapsed, deltaMs); };
  const updateStyle = (next: BuildingCustomization) => {
    if (shape === "empire") setEmpireBuildingMeshColor(building, next.color);
    else facadeMat.color.set(next.color);
    if (hologram) {
      setHologramTint(hologram, next.hologramColor);
      setHologramOpacity(hologram, next.hologramOpacity);
    }
  };
  return { root, bounds, tick, hasAnimation: () => hologram !== null, updateStyle, dispose };
}

/**
 * Caixa que manda no enquadramento, ignorando volumétrico (transparente sem
 * depthWrite): o feixe do holofote tem 10 unidades e deixaria o prédio um ponto.
 */
export function frameBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.updateWorldMatrix(false, true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.every((m) => m.transparent && m.depthWrite === false)) return;
    box.expandByObject(mesh);
  });
  return box;
}

/**
 * Cena mínima com o assunto, pro preview do admin ([[personalizacoes]]). Fora da
 * cena 3D não há HDRI nem ambiente, então traz luz própria (sem sombra — mesma
 * regra do resto do projeto). Quem chama cuida do renderer e do dispose.
 */
export function createPreviewScene(resolved: ResolvedSubject, appearance?: BuildingPreviewAppearance) {
  const built = buildSubject(resolved, appearance);

  const scene = new THREE.Scene();
  // Halo do LED é aditivo: some em fundo claro.
  if (resolved.kind === "edgeLight" || appearance) scene.background = new THREE.Color(0x101923);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb9d0ff, 0.9);
  fill.position.set(-5, 2, -4);
  scene.add(fill);
  scene.add(built.root);

  const sphere = built.bounds().getBoundingSphere(new THREE.Sphere());
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);

  /** Aplica a proporção e devolve a distância que faz a esfera envolvente caber. */
  const frame = (aspect: number) => {
    built.bounds().getBoundingSphere(sphere);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const halfFov = THREE.MathUtils.degToRad(FOV) / 2;
    // Aspecto < 1 corta na horizontal: afasta na mesma proporção.
    return (sphere.radius / Math.sin(halfFov) / Math.min(1, aspect)) * 1.06;
  };

  /** Câmera na diagonal padrão. Separado de `frame` pra resize não matar o orbit. */
  const place = (distance: number) => {
    camera.position
      .set(1, VIEW[resolved.kind].elevation, 1)
      .normalize()
      .multiplyScalar(distance)
      .add(sphere.center);
    camera.lookAt(sphere.center);
  };

  return { scene, camera, center: sphere.center, frame, place, tick: built.tick, hasAnimation: built.hasAnimation, updateStyle: built.updateStyle, dispose: built.dispose };
}
