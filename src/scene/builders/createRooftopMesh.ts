import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { RooftopType } from "../types";

type RooftopFootprint = {
  width: number;
  depth: number;
};

type RooftopFactory = (footprint?: RooftopFootprint) => THREE.Group;

const SPOTLIGHT_SCALE = 0.75;
const SPOTLIGHT_LENS_RADIUS = 0.04 * SPOTLIGHT_SCALE;
const SPOTLIGHT_BEAM_HEIGHT = 10.0;

const HELIPAD_DECK_HEIGHT = 0.035;
const HELIPAD_ROOF_CLEARANCE = 0.006;
const HELIPAD_PAINT_THICKNESS = 0.004;
const GARDEN_ROOF_CLEARANCE = 0.008;
const GARDEN_DECK_HEIGHT = 0.045;
const GARDEN_SOIL_HEIGHT = 0.026;
const GARDEN_PLANTER_HEIGHT = 0.11;
const GARDEN_PLANTER_WIDTH = 0.09;
const GARDEN_RAIL_HEIGHT = 0.2;
const GARDEN_TREE_COUNT = 4;
const GARDEN_BRANCHES_PER_TREE = 5;
const GARDEN_LEAF_CARDS_PER_TREE = 15;

const SPOTLIGHT_HOUSING_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x222222,
  roughness: 0.4,
  metalness: 0.6,
});

const SPOTLIGHT_LENS_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffcc,
  emissive: new THREE.Color(0xffffaa),
  emissiveIntensity: 2.5,
  roughness: 0.1,
  metalness: 0.0,
});

const SPOTLIGHT_BEAM_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffdd,
  emissive: new THREE.Color(0xffffaa),
  emissiveIntensity: 1.25,
  transparent: true,
  vertexColors: true,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const SPOTLIGHT_BASE_GEOMETRY = new THREE.CylinderGeometry(
  0.06 * SPOTLIGHT_SCALE,
  0.08 * SPOTLIGHT_SCALE,
  0.05 * SPOTLIGHT_SCALE,
  8,
);
const SPOTLIGHT_HOUSING_GEOMETRY = new THREE.CylinderGeometry(
  0.04 * SPOTLIGHT_SCALE,
  0.07 * SPOTLIGHT_SCALE,
  0.12 * SPOTLIGHT_SCALE,
  8,
);
const SPOTLIGHT_LENS_GEOMETRY = new THREE.CircleGeometry(SPOTLIGHT_LENS_RADIUS, 12);

const HELIPAD_DECK_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x2f3436,
  roughness: 0.88,
  metalness: 0.04,
});

const HELIPAD_RIM_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x3f4548,
  roughness: 0.62,
  metalness: 0.42,
});

const HELIPAD_PAINT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xe8edf1,
  roughness: 0.78,
  metalness: 0.0,
});

const HELIPAD_LIGHT_BASE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x151719,
  roughness: 0.42,
  metalness: 0.65,
});

const HELIPAD_GREEN_LENS_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xbfffee,
  emissive: new THREE.Color(0x36ffc6),
  emissiveIntensity: 1.6,
  roughness: 0.18,
  metalness: 0.0,
});

const HELIPAD_UTILITY_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x596166,
  roughness: 0.72,
  metalness: 0.38,
});

const GARDEN_DECK_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x3f4240,
  roughness: 0.82,
  metalness: 0.04,
});

const GARDEN_POOL_COPING_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xc3b79d,
  roughness: 0.86,
  metalness: 0.0,
});

const GARDEN_POOL_TILE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x7fb2c8,
  roughness: 0.58,
  metalness: 0.0,
});

const GARDEN_PLANTER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x59534a,
  roughness: 0.78,
  metalness: 0.08,
});

const GARDEN_SOIL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x24170f,
  roughness: 0.96,
  metalness: 0.0,
});

const GARDEN_GRASS_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x4f6840,
  roughness: 0.98,
  metalness: 0.0,
});

const GARDEN_LEAF_CARD_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  alphaTest: 0.08,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const GARDEN_LEAF_DARK_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x1f5d32,
  roughness: 0.86,
  metalness: 0.0,
});

const GARDEN_LEAF_LIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x5d9b55,
  roughness: 0.88,
  metalness: 0.0,
});

const GARDEN_TRUNK_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x6a4630,
  roughness: 0.82,
  metalness: 0.0,
});

const GARDEN_WOOD_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x76583a,
  roughness: 0.78,
  metalness: 0.05,
});

// Standard em vez de Physical: transmission > 0 dispara um render extra da cena
// inteira (transmission pass) — custo altíssimo pra uma piscina de topo.
const GARDEN_WATER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x5fb7d5,
  roughness: 0.03,
  metalness: 0.0,
  transparent: true,
  opacity: 0.62,
  envMapIntensity: 0.9,
});

const GARDEN_POOL_CAUSTIC_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xcdf8ff,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
});

const GARDEN_WARM_LIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffdd99,
  emissive: new THREE.Color(0xffb64d),
  emissiveIntensity: 1.35,
  roughness: 0.24,
  metalness: 0.0,
});

const HELICOPTER_BODY_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x1f272c,
  roughness: 0.44,
  metalness: 0.46,
});

// Vidro escuro integrado ao casco: sem superfície opaca atrás ou sorting de transparência.
const HELICOPTER_WINDOW_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x294c60,
  roughness: 0.12,
  metalness: 0.3,
  envMapIntensity: 1.2,
});

const HELICOPTER_TRIM_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xc7d0d3,
  roughness: 0.36,
  metalness: 0.42,
});

const HELICOPTER_ROTOR_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x111416,
  roughness: 0.38,
  metalness: 0.72,
});

const HELICOPTER_SKID_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x4e565b,
  roughness: 0.42,
  metalness: 0.74,
});

const HELICOPTER_NAV_LIGHT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffe7c2,
  emissive: new THREE.Color(0xffaa44),
  emissiveIntensity: 1.25,
  roughness: 0.18,
  metalness: 0.0,
});

// 32 segmentos bastam para o raio pequeno do helipad (96 era imperceptível e 3× o custo).
const HELIPAD_DECK_GEOMETRY = new THREE.CylinderGeometry(
  1,
  1,
  HELIPAD_DECK_HEIGHT,
  32,
  1,
  false,
);
const HELIPAD_RIM_GEOMETRY = new THREE.TorusGeometry(1, 0.016, 8, 32);
const HELIPAD_OUTER_RING_GEOMETRY = new THREE.RingGeometry(0.78, 0.9, 32);
const HELIPAD_STRIP_GEOMETRY = new THREE.BoxGeometry(1, HELIPAD_PAINT_THICKNESS, 1);
const HELIPAD_LIGHT_BASE_GEOMETRY = new THREE.CylinderGeometry(1, 1, 0.018, 12);
const HELIPAD_LIGHT_LENS_GEOMETRY = new THREE.CylinderGeometry(1, 1, 0.012, 12);
const HELIPAD_UTILITY_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const GARDEN_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const GARDEN_TRUNK_GEOMETRY = new THREE.CylinderGeometry(0.56, 1, 1, 7);
const GARDEN_BRANCH_GEOMETRY = new THREE.CylinderGeometry(0.35, 1, 1, 6);
const GARDEN_LEAF_CARD_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const GARDEN_SHRUB_GEOMETRY = new THREE.SphereGeometry(1, 8, 6);
const GARDEN_LIGHT_GEOMETRY = new THREE.SphereGeometry(1, 8, 5);
const HELICOPTER_BODY_GEOMETRY = new THREE.SphereGeometry(0.5, 16, 8);
const HELICOPTER_CABIN_GEOMETRY = createHelicopterCabinHullGeometry();
const HELICOPTER_FIN_GEOMETRY = createHelicopterFinGeometry();
const HELICOPTER_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const HELICOPTER_SKID_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 8);
const HELICOPTER_TAIL_BOOM_GEOMETRY = new THREE.CylinderGeometry(0.42, 1, 1, 10);
const HELICOPTER_MAST_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 10);
const HELICOPTER_LIGHT_GEOMETRY = new THREE.SphereGeometry(1, 8, 5);
let gardenGrassTexture: THREE.CanvasTexture | null = null;
let gardenWoodTexture: THREE.CanvasTexture | null = null;
let gardenPoolTileTexture: THREE.CanvasTexture | null = null;
let gardenPoolWaterNormalTexture: THREE.CanvasTexture | null = null;
let gardenPoolCausticTexture: THREE.CanvasTexture | null = null;
let gardenLeafCardTexture: THREE.CanvasTexture | null = null;

/** Cria um feixe com alpha gradiente via vertex colors (opaco na fonte, transparente no topo). */
function createBeamGeometry(
  sourceRadius: number,
  endRadius: number,
  height: number,
  segments: number,
): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(
    sourceRadius,
    endRadius,
    height,
    segments,
    4,
    true,
  );
  const pos = geo.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 4);

  // Após rotation.x = PI, Y mais alto fica embaixo (fonte) e Y mais baixo fica em cima.
  const halfH = height / 2;
  for (let i = 0; i < count; i++) {
    const y = pos.getY(i);
    const t = (y + halfH) / height;
    const alpha = t * t * 0.18;
    colors[i * 4] = 1;
    colors[i * 4 + 1] = 1;
    colors[i * 4 + 2] = 0.9;
    colors[i * 4 + 3] = alpha;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  return geo;
}

/** Casco único; os vidros substituem faces, com molduras na própria malha. Frente = +X. */
function createHelicopterCabinHullGeometry(): THREE.BufferGeometry {
  const sections = [
    { x: -0.42, top: 0.46, shoulder: 0.4, bottom: 0.34, width: 0.055 },
    { x: -0.25, top: 0.59, shoulder: 0.34, bottom: 0.2, width: 0.145 },
    { x: -0.065, top: 0.6, shoulder: 0.34, bottom: 0.2, width: 0.155 },
    { x: 0.12, top: 0.59, shoulder: 0.34, bottom: 0.2, width: 0.155 },
    { x: 0.38, top: 0.34, shoulder: 0.28, bottom: 0.22, width: 0.11 },
    { x: 0.5, top: 0.3, shoulder: 0.27, bottom: 0.24, width: 0.045 },
  ];
  const rings = sections.map(({ x, top, shoulder, bottom, width }) => [
    new THREE.Vector3(x, top, 0),
    new THREE.Vector3(x, top, width * 0.72),
    new THREE.Vector3(x, shoulder, width),
    new THREE.Vector3(x, bottom + 0.035, width * 0.85),
    new THREE.Vector3(x, bottom, width * 0.5),
    new THREE.Vector3(x, bottom, -width * 0.5),
    new THREE.Vector3(x, bottom + 0.035, -width * 0.85),
    new THREE.Vector3(x, shoulder, -width),
    new THREE.Vector3(x, top, -width * 0.72),
  ]);
  const surfaces: number[][] = [[], [], []]; // pintura, vidro, barriga clara
  const addQuad = (corners: THREE.Vector3[], material: number) => {
    for (const i of [0, 1, 2, 0, 2, 3]) surfaces[material].push(...corners[i].toArray());
  };

  for (let section = 0; section < rings.length - 1; section++) {
    for (let edge = 0; edge < rings[section].length; edge++) {
      const next = (edge + 1) % rings[section].length;
      const corners = [rings[section][edge], rings[section][next], rings[section + 1][next], rings[section + 1][edge]];
      const sideWindow = section >= 1 && section <= 3 && (edge === 1 || edge === 7);
      const windshield = section === 3 && (edge === 0 || edge === 8);
      if (sideWindow || windshield) {
        // Interpolação na mesma face garante encaixe, sem painéis flutuantes ou z-fighting.
        const point = (u: number, v: number) => corners[0].clone().lerp(corners[1], u)
          .lerp(corners[3].clone().lerp(corners[2], u), v);
        const inset = [point(0.09, 0.08), point(0.91, 0.08), point(0.91, 0.92), point(0.09, 0.92)];
        addQuad(inset, 1);
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          addQuad([corners[i], corners[j], inset[j], inset[i]], 0);
        }
      } else {
        addQuad(corners, edge >= 2 && edge <= 6 ? 2 : 0);
      }
    }
  }

  for (const index of [0, rings.length - 1]) {
    const ring = rings[index];
    const center = new THREE.Vector3(sections[index].x, (sections[index].top + sections[index].bottom) / 2, 0);
    for (let edge = 0; edge < ring.length; edge++) {
      const next = (edge + 1) % ring.length;
      const triangle = index === 0 ? [center, ring[next], ring[edge]] : [center, ring[edge], ring[next]];
      for (const vertex of triangle) surfaces[0].push(...vertex.toArray());
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(surfaces.flat(), 3));
  let start = 0;
  surfaces.forEach((positions, material) => {
    geometry.addGroup(start, positions.length / 3, material);
    start += positions.length / 3;
  });
  geometry.computeVertexNormals();
  return geometry;
}

function createHelicopterFinGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.08, 0.46);
  shape.lineTo(-1.12, 0.73);
  shape.lineTo(-1.035, 0.73);
  shape.lineTo(-0.92, 0.48);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false, steps: 1 });
  geometry.translate(0, 0, -0.009);
  return geometry;
}

const SPOTLIGHT_BEAM_GEOMETRY = createBeamGeometry(
  SPOTLIGHT_LENS_RADIUS,
  0.22,
  SPOTLIGHT_BEAM_HEIGHT,
  16,
);

const SHARED_ROOFTOP_GEOMETRIES: THREE.BufferGeometry[] = [
  SPOTLIGHT_BASE_GEOMETRY,
  SPOTLIGHT_HOUSING_GEOMETRY,
  SPOTLIGHT_LENS_GEOMETRY,
  SPOTLIGHT_BEAM_GEOMETRY,
  HELIPAD_DECK_GEOMETRY,
  HELIPAD_RIM_GEOMETRY,
  HELIPAD_OUTER_RING_GEOMETRY,
  HELIPAD_STRIP_GEOMETRY,
  HELIPAD_LIGHT_BASE_GEOMETRY,
  HELIPAD_LIGHT_LENS_GEOMETRY,
  HELIPAD_UTILITY_GEOMETRY,
  GARDEN_BOX_GEOMETRY,
  GARDEN_TRUNK_GEOMETRY,
  GARDEN_BRANCH_GEOMETRY,
  GARDEN_LEAF_CARD_GEOMETRY,
  GARDEN_SHRUB_GEOMETRY,
  GARDEN_LIGHT_GEOMETRY,
  HELICOPTER_BODY_GEOMETRY,
  HELICOPTER_CABIN_GEOMETRY,
  HELICOPTER_FIN_GEOMETRY,
  HELICOPTER_BOX_GEOMETRY,
  HELICOPTER_SKID_GEOMETRY,
  HELICOPTER_TAIL_BOOM_GEOMETRY,
  HELICOPTER_MAST_GEOMETRY,
  HELICOPTER_LIGHT_GEOMETRY,
];

const SHARED_ROOFTOP_MATERIALS: THREE.Material[] = [
  SPOTLIGHT_HOUSING_MATERIAL,
  SPOTLIGHT_LENS_MATERIAL,
  SPOTLIGHT_BEAM_MATERIAL,
  HELIPAD_DECK_MATERIAL,
  HELIPAD_RIM_MATERIAL,
  HELIPAD_PAINT_MATERIAL,
  HELIPAD_LIGHT_BASE_MATERIAL,
  HELIPAD_GREEN_LENS_MATERIAL,
  HELIPAD_UTILITY_MATERIAL,
  GARDEN_DECK_MATERIAL,
  GARDEN_POOL_COPING_MATERIAL,
  GARDEN_POOL_TILE_MATERIAL,
  GARDEN_PLANTER_MATERIAL,
  GARDEN_SOIL_MATERIAL,
  GARDEN_GRASS_MATERIAL,
  GARDEN_LEAF_CARD_MATERIAL,
  GARDEN_LEAF_DARK_MATERIAL,
  GARDEN_LEAF_LIGHT_MATERIAL,
  GARDEN_TRUNK_MATERIAL,
  GARDEN_WOOD_MATERIAL,
  GARDEN_WATER_MATERIAL,
  GARDEN_POOL_CAUSTIC_MATERIAL,
  GARDEN_WARM_LIGHT_MATERIAL,
  HELICOPTER_BODY_MATERIAL,
  HELICOPTER_WINDOW_MATERIAL,
  HELICOPTER_TRIM_MATERIAL,
  HELICOPTER_ROTOR_MATERIAL,
  HELICOPTER_SKID_MATERIAL,
  HELICOPTER_NAV_LIGHT_MATERIAL,
];

function setShadowRole(
  mesh: THREE.Mesh,
  castsShadow: boolean,
  receivesShadow: boolean,
): void {
  mesh.userData.rooftopCastsShadow = castsShadow;
  mesh.userData.rooftopReceivesShadow = receivesShadow;
}

function configureGardenTexture(
  texture: THREE.CanvasTexture,
  repeatX: number,
  repeatY: number,
): THREE.CanvasTexture {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 2;
  texture.needsUpdate = true;
  return texture;
}

function configureGardenNormalTexture(
  texture: THREE.CanvasTexture,
  repeatX: number,
  repeatY: number,
): THREE.CanvasTexture {
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 2;
  texture.needsUpdate = true;
  return texture;
}

function getGardenGrassMaterial(): THREE.MeshStandardMaterial {
  if (!gardenGrassTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.fillStyle = "#536b42";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 520; i++) {
        const x = (i * 37) % 128;
        const y = (i * 61) % 128;
        const length = 5 + (i % 7);
        const lean = ((i % 9) - 4) * 0.35;
        ctx.strokeStyle = i % 5 === 0
          ? "rgba(105, 131, 74, 0.62)"
          : i % 3 === 0
            ? "rgba(47, 79, 38, 0.56)"
            : "rgba(72, 105, 55, 0.5)";
        ctx.lineWidth = i % 11 === 0 ? 1.4 : 0.75;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean, y - length);
        ctx.stroke();
      }

      for (let i = 0; i < 90; i++) {
        const x = (i * 53) % 128;
        const y = (i * 29) % 128;
        ctx.fillStyle = i % 2 === 0
          ? "rgba(36, 62, 31, 0.22)"
          : "rgba(130, 143, 91, 0.2)";
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    gardenGrassTexture = configureGardenTexture(new THREE.CanvasTexture(canvas), 4, 4);
  }

  GARDEN_GRASS_MATERIAL.map = gardenGrassTexture;
  GARDEN_GRASS_MATERIAL.needsUpdate = true;
  return GARDEN_GRASS_MATERIAL;
}

function getGardenWoodMaterial(): THREE.MeshStandardMaterial {
  if (!gardenWoodTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      const base = ctx.createLinearGradient(0, 0, 128, 0);
      base.addColorStop(0, "#6b4e31");
      base.addColorStop(0.42, "#8a6844");
      base.addColorStop(1, "#5b3f27");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 34; i++) {
        const y = (i * 11) % 128;
        const offset = (i % 5) * 6;
        ctx.strokeStyle = i % 3 === 0
          ? "rgba(45, 29, 17, 0.42)"
          : "rgba(151, 112, 70, 0.36)";
        ctx.lineWidth = i % 4 === 0 ? 2.1 : 1.1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(32, y + offset - 12, 76, y - offset + 10, 128, y + (i % 7) - 3);
        ctx.stroke();
      }

      for (let i = 0; i < 4; i++) {
        const x = 24 + i * 27;
        const y = 24 + ((i * 31) % 74);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((i - 1.5) * 0.34);
        ctx.strokeStyle = "rgba(48, 31, 18, 0.5)";
        ctx.fillStyle = "rgba(84, 54, 31, 0.24)";
        ctx.beginPath();
        ctx.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, 2.2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    gardenWoodTexture = configureGardenTexture(new THREE.CanvasTexture(canvas), 2.8, 1.4);
  }

  GARDEN_WOOD_MATERIAL.map = gardenWoodTexture;
  GARDEN_WOOD_MATERIAL.needsUpdate = true;
  return GARDEN_WOOD_MATERIAL;
}

function getGardenPoolTileMaterial(): THREE.MeshStandardMaterial {
  if (!gardenPoolTileTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.fillStyle = "#76abc3";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let y = 0; y <= 128; y += 16) {
        ctx.strokeStyle = "rgba(219, 245, 250, 0.58)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(128, y + 0.5);
        ctx.stroke();
      }

      for (let x = 0; x <= 128; x += 16) {
        ctx.strokeStyle = "rgba(38, 112, 138, 0.34)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, 128);
        ctx.stroke();
      }

      for (let i = 0; i < 80; i++) {
        const x = (i * 43) % 128;
        const y = (i * 71) % 128;
        ctx.fillStyle = i % 2 === 0
          ? "rgba(255, 255, 255, 0.14)"
          : "rgba(42, 116, 145, 0.12)";
        ctx.fillRect(x, y, 2, 2);
      }
    }

    gardenPoolTileTexture = configureGardenTexture(new THREE.CanvasTexture(canvas), 3, 2);
  }

  GARDEN_POOL_TILE_MATERIAL.map = gardenPoolTileTexture;
  GARDEN_POOL_TILE_MATERIAL.needsUpdate = true;
  return GARDEN_POOL_TILE_MATERIAL;
}

function getGardenPoolWaterMaterial(): THREE.MeshStandardMaterial {
  if (!gardenPoolWaterNormalTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.fillStyle = "rgb(128, 128, 255)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < 36; i++) {
        const y = (i * 17) % 128;
        ctx.strokeStyle = i % 2 === 0
          ? "rgba(103, 146, 255, 0.72)"
          : "rgba(154, 118, 255, 0.5)";
        ctx.lineWidth = i % 3 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(32, y - 10, 70, y + 12, 128, y - 4);
        ctx.stroke();
      }
    }

    gardenPoolWaterNormalTexture = configureGardenNormalTexture(
      new THREE.CanvasTexture(canvas),
      2.5,
      2,
    );
  }

  GARDEN_WATER_MATERIAL.normalMap = gardenPoolWaterNormalTexture;
  GARDEN_WATER_MATERIAL.normalScale.set(0.18, 0.18);
  GARDEN_WATER_MATERIAL.needsUpdate = true;
  return GARDEN_WATER_MATERIAL;
}

function getGardenPoolCausticMaterial(): THREE.MeshBasicMaterial {
  if (!gardenPoolCausticTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(235, 255, 255, 0.62)";
      ctx.lineWidth = 2;

      for (let i = 0; i < 18; i++) {
        const x = (i * 31) % 128;
        const y = (i * 47) % 128;
        ctx.beginPath();
        ctx.moveTo(x - 28, y);
        ctx.bezierCurveTo(x - 10, y - 13, x + 18, y + 15, x + 42, y - 5);
        ctx.stroke();
      }
    }

    gardenPoolCausticTexture = configureGardenTexture(new THREE.CanvasTexture(canvas), 2, 1.4);
  }

  GARDEN_POOL_CAUSTIC_MATERIAL.map = gardenPoolCausticTexture;
  GARDEN_POOL_CAUSTIC_MATERIAL.needsUpdate = true;
  return GARDEN_POOL_CAUSTIC_MATERIAL;
}

function getGardenLeafCardMaterial(): THREE.MeshBasicMaterial {
  if (!gardenLeafCardTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      const leaves = [
        [36, 42, 26, 13, -0.65, "#245f34"],
        [62, 36, 31, 14, 0.25, "#367a40"],
        [88, 45, 26, 12, 0.72, "#5a914e"],
        [45, 67, 34, 15, 0.62, "#2f743b"],
        [76, 68, 36, 16, -0.38, "#6a9f58"],
        [56, 91, 29, 13, -0.85, "#225a32"],
        [92, 91, 25, 12, 0.45, "#4f8845"],
        [28, 88, 22, 10, 0.18, "#5f9952"],
      ] as const;

      for (const [x, y, rx, ry, rotation, color] of leaves) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(18, 54, 27, 0.34)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-rx * 0.55, 0);
        ctx.lineTo(rx * 0.62, 0);
        ctx.stroke();
        ctx.restore();
      }
    }

    gardenLeafCardTexture = new THREE.CanvasTexture(canvas);
    gardenLeafCardTexture.colorSpace = THREE.SRGBColorSpace;
    gardenLeafCardTexture.needsUpdate = true;
  }

  GARDEN_LEAF_CARD_MATERIAL.map = gardenLeafCardTexture;
  GARDEN_LEAF_CARD_MATERIAL.needsUpdate = true;
  return GARDEN_LEAF_CARD_MATERIAL;
}

function setCylinderBetween(
  mesh: THREE.InstancedMesh,
  index: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  dummy: THREE.Object3D,
): void {
  const direction = end.clone().sub(start);
  const length = direction.length();
  if (length <= 0.001) return;

  dummy.position.copy(start).add(end).multiplyScalar(0.5);
  dummy.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.multiplyScalar(1 / length),
  );
  dummy.scale.set(radius, length, radius);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function createSpotlights(): THREE.Group {
  const group = new THREE.Group();

  // 4 holofotes, um em cada canto do edifício
  const corners: [number, number][] = [
    [-0.35, -0.35],
    [0.35, -0.35],
    [-0.35, 0.35],
    [0.35, 0.35],
  ];

  for (const [cx, cz] of corners) {
    const spot = new THREE.Group();

    // Base cilíndrica
    const base = new THREE.Mesh(
      SPOTLIGHT_BASE_GEOMETRY,
      SPOTLIGHT_HOUSING_MATERIAL,
    );
    base.position.y = 0.025 * SPOTLIGHT_SCALE;
    setShadowRole(base, true, true);
    spot.add(base);

    // Corpo do holofote (cilindro cônico apontando para cima)
    const housing = new THREE.Mesh(
      SPOTLIGHT_HOUSING_GEOMETRY,
      SPOTLIGHT_HOUSING_MATERIAL,
    );
    housing.position.y = 0.11 * SPOTLIGHT_SCALE;
    setShadowRole(housing, true, true);
    spot.add(housing);

    // Lente emissiva no topo do holofote
    const lens = new THREE.Mesh(
      SPOTLIGHT_LENS_GEOMETRY,
      SPOTLIGHT_LENS_MATERIAL,
    );
    lens.rotation.x = -Math.PI / 2;
    lens.position.y = 0.17 * SPOTLIGHT_SCALE;
    setShadowRole(lens, false, false);
    spot.add(lens);

    // Feixe de luz com fade gradual (opaco na fonte, transparente no topo)
    const beam = new THREE.Mesh(SPOTLIGHT_BEAM_GEOMETRY, SPOTLIGHT_BEAM_MATERIAL);
    beam.rotation.x = Math.PI;
    beam.position.y = lens.position.y + SPOTLIGHT_BEAM_HEIGHT / 2;
    setShadowRole(beam, false, false);
    spot.add(beam);

    spot.position.set(cx, 0, cz);
    group.add(spot);
  }

  return group;
}

function createHelipad(footprint?: RooftopFootprint): THREE.Group {
  const group = new THREE.Group();
  const width = Math.max(1, footprint?.width ?? 1);
  const depth = Math.max(1, footprint?.depth ?? 1);
  const radius = THREE.MathUtils.clamp(Math.min(width, depth) * 0.34, 0.34, 0.88);
  const deckTopY = HELIPAD_ROOF_CLEARANCE + HELIPAD_DECK_HEIGHT;
  const paintY = deckTopY + HELIPAD_PAINT_THICKNESS / 2 + 0.001;

  const deck = new THREE.Mesh(HELIPAD_DECK_GEOMETRY, HELIPAD_DECK_MATERIAL);
  deck.scale.set(radius, 1, radius);
  deck.position.y = HELIPAD_ROOF_CLEARANCE + HELIPAD_DECK_HEIGHT / 2;
  setShadowRole(deck, true, true);
  group.add(deck);

  const rim = new THREE.Mesh(HELIPAD_RIM_GEOMETRY, HELIPAD_RIM_MATERIAL);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(radius, radius, radius);
  rim.position.y = deckTopY + 0.006;
  setShadowRole(rim, true, true);
  group.add(rim);

  const outerRing = new THREE.Mesh(HELIPAD_OUTER_RING_GEOMETRY, HELIPAD_PAINT_MATERIAL);
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.scale.set(radius, radius, 1);
  outerRing.position.y = paintY;
  setShadowRole(outerRing, false, true);
  group.add(outerRing);

  const addPaintStrip = (
    widthScale: number,
    depthScale: number,
    x: number,
    z: number,
  ) => {
    const strip = new THREE.Mesh(HELIPAD_STRIP_GEOMETRY, HELIPAD_PAINT_MATERIAL);
    strip.scale.set(widthScale, 1, depthScale);
    strip.position.set(x, paintY + 0.002, z);
    setShadowRole(strip, false, true);
    group.add(strip);
  };

  const hBarWidth = radius * 0.16;
  const hBarLength = radius * 0.92;
  const hBarOffset = radius * 0.24;
  addPaintStrip(hBarWidth, hBarLength, -hBarOffset, 0);
  addPaintStrip(hBarWidth, hBarLength, hBarOffset, 0);
  addPaintStrip(hBarOffset * 2 + hBarWidth, hBarWidth, 0, 0);

  // Luzes de borda instanciadas: 2 draw calls (base + lente) em vez de 24 meshes.
  const lightCount = 12;
  const lightBaseRadius = THREE.MathUtils.clamp(radius * 0.035, 0.012, 0.026);
  const lightBases = new THREE.InstancedMesh(
    HELIPAD_LIGHT_BASE_GEOMETRY,
    HELIPAD_LIGHT_BASE_MATERIAL,
    lightCount,
  );
  const lightLenses = new THREE.InstancedMesh(
    HELIPAD_LIGHT_LENS_GEOMETRY,
    HELIPAD_GREEN_LENS_MATERIAL,
    lightCount,
  );
  const lightMatrix = new THREE.Matrix4();
  const lightQuat = new THREE.Quaternion();
  const lightPos = new THREE.Vector3();
  const lightScale = new THREE.Vector3();
  for (let i = 0; i < lightCount; i++) {
    const angle = (i / lightCount) * Math.PI * 2;
    const x = Math.cos(angle) * radius * 0.97;
    const z = Math.sin(angle) * radius * 0.97;

    lightPos.set(x, deckTopY + 0.009, z);
    lightScale.set(lightBaseRadius, 1, lightBaseRadius);
    lightMatrix.compose(lightPos, lightQuat, lightScale);
    lightBases.setMatrixAt(i, lightMatrix);

    lightPos.set(x, deckTopY + 0.024, z);
    lightScale.set(lightBaseRadius * 0.72, 1, lightBaseRadius * 0.72);
    lightMatrix.compose(lightPos, lightQuat, lightScale);
    lightLenses.setMatrixAt(i, lightMatrix);
  }
  lightBases.computeBoundingSphere();
  lightLenses.computeBoundingSphere();
  group.add(lightBases);
  group.add(lightLenses);

  const hatchHeight = 0.035;
  const hatch = new THREE.Mesh(HELIPAD_UTILITY_GEOMETRY, HELIPAD_UTILITY_MATERIAL);
  hatch.scale.set(radius * 0.34, hatchHeight, radius * 0.2);
  hatch.position.set(-radius * 0.42, HELIPAD_ROOF_CLEARANCE + hatchHeight / 2, radius * 1.18);
  setShadowRole(hatch, true, true);
  group.add(hatch);

  group.userData.helipadRadius = radius;
  return group;
}

function createGarden(footprint?: RooftopFootprint): THREE.Group {
  const group = new THREE.Group();
  const width = Math.max(1, footprint?.width ?? 1);
  const depth = Math.max(1, footprint?.depth ?? 1);
  const gardenW = THREE.MathUtils.clamp(width * 0.82, 0.72, 1.9);
  const gardenD = THREE.MathUtils.clamp(depth * 0.82, 0.72, 1.9);
  const deckTopY = GARDEN_ROOF_CLEARANCE + GARDEN_DECK_HEIGHT;
  const surfaceY = deckTopY + 0.004;
  const innerW = Math.max(0.38, gardenW - GARDEN_PLANTER_WIDTH * 2.4);
  const innerD = Math.max(0.38, gardenD - GARDEN_PLANTER_WIDTH * 2.4);

  const addBox = (
    material: THREE.Material,
    scale: [number, number, number],
    position: [number, number, number],
    castsShadow = true,
    receivesShadow = true,
  ) => {
    const mesh = new THREE.Mesh(GARDEN_BOX_GEOMETRY, material);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.position.set(position[0], position[1], position[2]);
    setShadowRole(mesh, castsShadow, receivesShadow);
    group.add(mesh);
    return mesh;
  };

  addBox(
    GARDEN_DECK_MATERIAL,
    [gardenW, GARDEN_DECK_HEIGHT, gardenD],
    [0, GARDEN_ROOF_CLEARANCE + GARDEN_DECK_HEIGHT / 2, 0],
  );

  addBox(
    getGardenGrassMaterial(),
    [innerW, 0.01, innerD],
    [0, surfaceY + 0.002, 0],
    false,
    true,
  );

  const planterY = deckTopY + GARDEN_PLANTER_HEIGHT / 2;
  const soilY = deckTopY + GARDEN_PLANTER_HEIGHT + GARDEN_SOIL_HEIGHT / 2 + 0.002;
  const frontZ = gardenD / 2 - GARDEN_PLANTER_WIDTH / 2;
  const sideX = gardenW / 2 - GARDEN_PLANTER_WIDTH / 2;
  addBox(GARDEN_PLANTER_MATERIAL, [gardenW, GARDEN_PLANTER_HEIGHT, GARDEN_PLANTER_WIDTH], [0, planterY, frontZ]);
  addBox(GARDEN_PLANTER_MATERIAL, [gardenW, GARDEN_PLANTER_HEIGHT, GARDEN_PLANTER_WIDTH], [0, planterY, -frontZ]);
  addBox(GARDEN_PLANTER_MATERIAL, [GARDEN_PLANTER_WIDTH, GARDEN_PLANTER_HEIGHT, gardenD], [sideX, planterY, 0]);
  addBox(GARDEN_PLANTER_MATERIAL, [GARDEN_PLANTER_WIDTH, GARDEN_PLANTER_HEIGHT, gardenD], [-sideX, planterY, 0]);
  addBox(GARDEN_SOIL_MATERIAL, [gardenW * 0.88, GARDEN_SOIL_HEIGHT, GARDEN_PLANTER_WIDTH * 0.56], [0, soilY, frontZ]);
  addBox(GARDEN_SOIL_MATERIAL, [gardenW * 0.88, GARDEN_SOIL_HEIGHT, GARDEN_PLANTER_WIDTH * 0.56], [0, soilY, -frontZ]);
  addBox(GARDEN_SOIL_MATERIAL, [GARDEN_PLANTER_WIDTH * 0.56, GARDEN_SOIL_HEIGHT, gardenD * 0.68], [sideX, soilY, 0]);
  addBox(GARDEN_SOIL_MATERIAL, [GARDEN_PLANTER_WIDTH * 0.56, GARDEN_SOIL_HEIGHT, gardenD * 0.68], [-sideX, soilY, 0]);

  const poolW = innerW * 0.42;
  const poolD = innerD * 0.3;
  const poolX = innerW * 0.23;
  const poolZ = -innerD * 0.22;
  const poolY = surfaceY + 0.01;
  const coping = 0.045;
  addBox(
    GARDEN_POOL_COPING_MATERIAL,
    [poolW + coping * 2, 0.018, poolD + coping * 2],
    [poolX, poolY, poolZ],
    true,
    true,
  );
  addBox(
    getGardenPoolTileMaterial(),
    [poolW, 0.018, poolD],
    [poolX, poolY + 0.004, poolZ],
    false,
    true,
  );
  addBox(
    getGardenPoolCausticMaterial(),
    [poolW * 0.9, 0.006, poolD * 0.82],
    [poolX, poolY + 0.017, poolZ],
    false,
    false,
  );
  addBox(
    getGardenPoolWaterMaterial(),
    [poolW * 0.92, 0.014, poolD * 0.84],
    [poolX, poolY + 0.026, poolZ],
    false,
    false,
  );

  const benchZ = innerD * 0.18;
  const woodMaterial = getGardenWoodMaterial();
  addBox(woodMaterial, [innerW * 0.34, 0.025, 0.055], [-innerW * 0.23, deckTopY + 0.075, benchZ]);
  addBox(woodMaterial, [innerW * 0.34, 0.08, 0.025], [-innerW * 0.23, deckTopY + 0.105, benchZ - 0.045]);
  addBox(woodMaterial, [0.025, 0.07, 0.025], [-innerW * 0.36, deckTopY + 0.035, benchZ]);
  addBox(woodMaterial, [0.025, 0.07, 0.025], [-innerW * 0.1, deckTopY + 0.035, benchZ]);

  const pergolaX = -innerW * 0.24;
  const pergolaZ = -innerD * 0.24;
  const pergolaH = 0.28;
  for (const x of [-0.12, 0.12]) {
    for (const z of [-0.1, 0.1]) {
      addBox(woodMaterial, [0.025, pergolaH, 0.025], [pergolaX + x, deckTopY + pergolaH / 2, pergolaZ + z]);
    }
  }
  addBox(woodMaterial, [0.32, 0.025, 0.025], [pergolaX, deckTopY + pergolaH, pergolaZ - 0.1]);
  addBox(woodMaterial, [0.32, 0.025, 0.025], [pergolaX, deckTopY + pergolaH, pergolaZ + 0.1]);
  addBox(woodMaterial, [0.025, 0.025, 0.28], [pergolaX - 0.12, deckTopY + pergolaH + 0.03, pergolaZ]);
  addBox(woodMaterial, [0.025, 0.025, 0.28], [pergolaX + 0.12, deckTopY + pergolaH + 0.03, pergolaZ]);

  const trunkMesh = new THREE.InstancedMesh(
    GARDEN_TRUNK_GEOMETRY,
    GARDEN_TRUNK_MATERIAL,
    GARDEN_TREE_COUNT,
  );
  const branchMesh = new THREE.InstancedMesh(
    GARDEN_BRANCH_GEOMETRY,
    GARDEN_TRUNK_MATERIAL,
    GARDEN_TREE_COUNT * GARDEN_BRANCHES_PER_TREE,
  );
  const leafCardMesh = new THREE.InstancedMesh(
    GARDEN_LEAF_CARD_GEOMETRY,
    getGardenLeafCardMaterial(),
    GARDEN_TREE_COUNT * GARDEN_LEAF_CARDS_PER_TREE,
  );
  const treePositions: Array<[number, number, number]> = [
    [-sideX, deckTopY + GARDEN_PLANTER_HEIGHT, -frontZ],
    [sideX, deckTopY + GARDEN_PLANTER_HEIGHT, -frontZ],
    [-sideX, deckTopY + GARDEN_PLANTER_HEIGHT, frontZ],
    [sideX, deckTopY + GARDEN_PLANTER_HEIGHT, frontZ],
  ];
  const dummy = new THREE.Object3D();
  let branchIndex = 0;
  let leafCardIndex = 0;
  treePositions.forEach(([x, y, z], index) => {
    const trunkH = 0.16 + (index % 2) * 0.035;
    const trunkBase = new THREE.Vector3(x * 0.9, y, z * 0.88);
    const trunkTop = new THREE.Vector3(x * 0.9, y + trunkH, z * 0.88);
    const treeYaw = index * 0.72;

    setCylinderBetween(trunkMesh, index, trunkBase, trunkTop, 0.02, dummy);

    for (let branch = 0; branch < GARDEN_BRANCHES_PER_TREE; branch++) {
      const angle = treeYaw + branch * 1.26;
      const branchStart = trunkBase.clone().setY(y + trunkH * (0.48 + branch * 0.085));
      const branchLength = 0.12 + (branch % 2) * 0.035;
      const branchEnd = new THREE.Vector3(
        trunkBase.x + Math.cos(angle) * branchLength,
        branchStart.y + 0.055 + (branch % 3) * 0.012,
        trunkBase.z + Math.sin(angle) * branchLength,
      );

      setCylinderBetween(
        branchMesh,
        branchIndex,
        branchStart,
        branchEnd,
        0.009 - branch * 0.0009,
        dummy,
      );
      branchIndex += 1;

      for (let card = 0; card < 3; card++) {
        const cardYaw = angle + card * 1.05;
        const cardLift = (card - 1) * 0.018;
        dummy.position.set(
          branchEnd.x + Math.cos(cardYaw) * 0.025,
          branchEnd.y + cardLift,
          branchEnd.z + Math.sin(cardYaw) * 0.025,
        );
        dummy.rotation.set(
          -0.16 + card * 0.15,
          cardYaw + Math.PI / 2,
          (card - 1) * 0.42,
        );
        dummy.scale.set(0.2 + card * 0.018, 0.15 + (branch % 2) * 0.02, 1);
        dummy.updateMatrix();
        leafCardMesh.setMatrixAt(leafCardIndex, dummy.matrix);
        leafCardIndex += 1;
      }
    }
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  branchMesh.instanceMatrix.needsUpdate = true;
  leafCardMesh.instanceMatrix.needsUpdate = true;
  setShadowRole(trunkMesh, true, true);
  setShadowRole(branchMesh, true, true);
  setShadowRole(leafCardMesh, false, false);
  group.add(trunkMesh, branchMesh, leafCardMesh);

  const shrubCount = 18;
  const shrubsDark = new THREE.InstancedMesh(
    GARDEN_SHRUB_GEOMETRY,
    GARDEN_LEAF_DARK_MATERIAL,
    Math.ceil(shrubCount / 2),
  );
  const shrubsLight = new THREE.InstancedMesh(
    GARDEN_SHRUB_GEOMETRY,
    GARDEN_LEAF_LIGHT_MATERIAL,
    Math.floor(shrubCount / 2),
  );
  let darkShrubIndex = 0;
  let lightShrubIndex = 0;
  for (let i = 0; i < shrubCount; i++) {
    const t = i / (shrubCount - 1);
    const side = i % 4;
    const edgeT = -0.42 + (t % 0.5) * 1.68;
    const x = side < 2 ? edgeT * gardenW : (side === 2 ? -sideX : sideX) * 0.96;
    const z = side < 2 ? (side === 0 ? -frontZ : frontZ) * 0.93 : edgeT * gardenD;
    const radius = 0.035 + (i % 3) * 0.009;
    dummy.position.set(x, deckTopY + GARDEN_PLANTER_HEIGHT + radius * 0.6, z);
    dummy.scale.set(radius * 1.2, radius * 0.75, radius);
    dummy.updateMatrix();
    if (i % 2 === 0) {
      shrubsDark.setMatrixAt(darkShrubIndex, dummy.matrix);
      darkShrubIndex += 1;
    } else {
      shrubsLight.setMatrixAt(lightShrubIndex, dummy.matrix);
      lightShrubIndex += 1;
    }
  }
  shrubsDark.instanceMatrix.needsUpdate = true;
  shrubsLight.instanceMatrix.needsUpdate = true;
  setShadowRole(shrubsDark, true, true);
  setShadowRole(shrubsLight, true, true);
  group.add(shrubsDark, shrubsLight);

  const lightCount = 8;
  const gardenLights = new THREE.InstancedMesh(GARDEN_LIGHT_GEOMETRY, GARDEN_WARM_LIGHT_MATERIAL, lightCount);
  for (let i = 0; i < lightCount; i++) {
    const angle = (i / lightCount) * Math.PI * 2 + Math.PI / 8;
    dummy.position.set(
      Math.cos(angle) * gardenW * 0.43,
      deckTopY + GARDEN_RAIL_HEIGHT * 0.8,
      Math.sin(angle) * gardenD * 0.43,
    );
    dummy.scale.set(0.018, 0.018, 0.018);
    dummy.updateMatrix();
    gardenLights.setMatrixAt(i, dummy.matrix);
  }
  gardenLights.instanceMatrix.needsUpdate = true;
  setShadowRole(gardenLights, false, false);
  group.add(gardenLights);

  const postCount = 16;
  const railPosts = new THREE.InstancedMesh(GARDEN_BOX_GEOMETRY, GARDEN_PLANTER_MATERIAL, postCount);
  for (let i = 0; i < postCount; i++) {
    const t = (i % 4) / 3 - 0.5;
    const side = Math.floor(i / 4);
    const x = side < 2 ? t * gardenW : (side === 2 ? -gardenW / 2 : gardenW / 2);
    const z = side < 2 ? (side === 0 ? -gardenD / 2 : gardenD / 2) : t * gardenD;
    dummy.position.set(x, deckTopY + GARDEN_RAIL_HEIGHT / 2, z);
    dummy.scale.set(0.018, GARDEN_RAIL_HEIGHT, 0.018);
    dummy.updateMatrix();
    railPosts.setMatrixAt(i, dummy.matrix);
  }
  railPosts.instanceMatrix.needsUpdate = true;
  setShadowRole(railPosts, true, true);
  group.add(railPosts);
  addBox(GARDEN_PLANTER_MATERIAL, [gardenW, 0.018, 0.018], [0, deckTopY + GARDEN_RAIL_HEIGHT, -gardenD / 2]);
  addBox(GARDEN_PLANTER_MATERIAL, [gardenW, 0.018, 0.018], [0, deckTopY + GARDEN_RAIL_HEIGHT, gardenD / 2]);
  addBox(GARDEN_PLANTER_MATERIAL, [0.018, 0.018, gardenD], [-gardenW / 2, deckTopY + GARDEN_RAIL_HEIGHT, 0]);
  addBox(GARDEN_PLANTER_MATERIAL, [0.018, 0.018, gardenD], [gardenW / 2, deckTopY + GARDEN_RAIL_HEIGHT, 0]);

  return group;
}

function createHelicopter(footprint?: RooftopFootprint): THREE.Group {
  const group = new THREE.Group();
  const roofSpan = Math.min(Math.max(1, footprint?.width ?? 1), Math.max(1, footprint?.depth ?? 1));
  const size = THREE.MathUtils.clamp(roofSpan * 0.82, 0.78, 1.66);

  // Todas as peças usam a mesma escala, inclusive mastros, folgas e tubos.
  const addMesh = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    scale: [number, number, number],
    position: [number, number, number],
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    setShadowRole(mesh, true, true);
    group.add(mesh);
    return mesh;
  };
  const addTube = (
    name: string,
    start: [number, number, number],
    end: [number, number, number],
    radius: number,
    geometry = HELICOPTER_SKID_GEOMETRY,
    material = HELICOPTER_SKID_MATERIAL,
  ) => {
    const direction = new THREE.Vector3(...end).sub(new THREE.Vector3(...start));
    const midpoint = new THREE.Vector3(...start).add(new THREE.Vector3(...end)).multiplyScalar(0.5);
    const mesh = addMesh(name, geometry, material, [radius, direction.length(), radius], [midpoint.x, midpoint.y, midpoint.z]);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  };

  addMesh("fuselage", HELICOPTER_CABIN_GEOMETRY,
    [HELICOPTER_BODY_MATERIAL, HELICOPTER_WINDOW_MATERIAL, HELICOPTER_TRIM_MATERIAL],
    [1, 1, 1], [0, 0, 0]);
  addMesh("engine-cowling", HELICOPTER_BODY_GEOMETRY, HELICOPTER_BODY_MATERIAL,
    [0.36, 0.2, 0.24], [-0.15, 0.585, 0]);
  addTube("tail-boom", [-0.39, 0.4, 0], [-1.055, 0.51, 0], 0.05,
    HELICOPTER_TAIL_BOOM_GEOMETRY, HELICOPTER_BODY_MATERIAL);
  addMesh("tail-fin", HELICOPTER_FIN_GEOMETRY, HELICOPTER_BODY_MATERIAL,
    [1, 1, 1], [0, 0, 0]);
  addMesh("tail-stabilizer", HELICOPTER_BOX_GEOMETRY, HELICOPTER_TRIM_MATERIAL,
    [0.15, 0.014, 0.34], [-0.84, 0.48, 0]);

  const rotorX = -0.09;
  const rotorY = 0.8;
  addTube("main-mast", [rotorX, 0.655, 0], [rotorX, rotorY, 0], 0.014);
  addMesh("main-hub", HELICOPTER_MAST_GEOMETRY, HELICOPTER_SKID_MATERIAL,
    [0.04, 0.032, 0.04], [rotorX, rotorY, 0]);
  for (let blade = 0; blade < 3; blade++) {
    const angle = blade * Math.PI * 2 / 3 + 0.2;
    // Uma pá radial por braço; barras centradas no eixo duplicavam o número de pás.
    const mesh = addMesh(`main-blade-${blade}`, HELICOPTER_BOX_GEOMETRY, HELICOPTER_ROTOR_MATERIAL,
      [0.625, 0.008, 0.038], [rotorX + Math.cos(angle) * 0.3475, rotorY, -Math.sin(angle) * 0.3475]);
    mesh.rotation.y = angle;
  }

  for (const side of [-1, 1]) {
    const z = side * 0.215;
    addTube(`skid-${side}`, [-0.34, 0.022, z], [0.35, 0.022, z], 0.012);
    addTube(`skid-toe-${side}`, [0.35, 0.022, z], [0.43, 0.065, z], 0.012);
    for (const x of [-0.2, 0.22]) {
      addTube(`skid-support-${side}-${x}`, [x, 0.03, z], [x, 0.255, side * 0.105], 0.009);
    }
  }

  // Eixo lateral preso à deriva; disco das pás afastado do boom e do estabilizador.
  const tailRotorX = -1.04;
  const tailRotorY = 0.565;
  const tailRotorZ = 0.09;
  addTube("tail-axle", [tailRotorX, tailRotorY, 0], [tailRotorX, tailRotorY, tailRotorZ + 0.012], 0.015);
  const tailHub = addMesh("tail-hub", HELICOPTER_MAST_GEOMETRY, HELICOPTER_SKID_MATERIAL,
    [0.025, 0.024, 0.025], [tailRotorX, tailRotorY, tailRotorZ]);
  tailHub.rotation.x = Math.PI / 2;
  for (let blade = 0; blade < 2; blade++) {
    const angle = blade * Math.PI + 0.65;
    const mesh = addMesh(`tail-blade-${blade}`, HELICOPTER_BOX_GEOMETRY, HELICOPTER_ROTOR_MATERIAL,
      [0.115, 0.022, 0.007], [tailRotorX + Math.cos(angle) * 0.0775, tailRotorY + Math.sin(angle) * 0.0775, tailRotorZ]);
    mesh.rotation.z = angle;
  }

  const light = addMesh("landing-light", HELICOPTER_LIGHT_GEOMETRY, HELICOPTER_NAV_LIGHT_MATERIAL,
    [0.012, 0.018, 0.018], [0.501, 0.27, 0]);
  setShadowRole(light, false, false);
  group.scale.setScalar(size);
  group.rotation.y = -Math.PI / 10;
  group.userData.helicopterSize = size;
  return group;
}

const FACTORIES: Record<Exclude<RooftopType, "none">, RooftopFactory> = {
  spotlights: createSpotlights,
  helipad: createHelipad,
  garden: createGarden,
  helicopter: createHelicopter,
};

/** Guard pra keys vindas do catálogo (banco pode ter opção sem builder). */
export function isRooftopType(key: string): key is RooftopType {
  return key === "none" || key in FACTORIES;
}

/**
 * Cria um Group Three.js para o acessório de topo do edifício.
 * Retorna null se o tipo for "none".
 * O grupo é posicionado com Y=0 na base (topo do edifício).
 */
export function createRooftopMesh(
  type: RooftopType,
  footprint?: RooftopFootprint,
): THREE.Group | null {
  if (type === "none") return null;
  const factory = FACTORIES[type];
  const group = factory(footprint);
  group.userData.rooftopType = type;

  return group;
}

/**
 * Funde as peças opacas soltas do acessório por material: uma draw call por material em vez
 * de uma por peça (jardim: 37 → 16 malhas). InstancedMesh fica como está; transparente
 * também (fundido, perderia a ordenação por profundidade entre as peças). Só para a cidade —
 * o preview e scripts/check-helicopter.mjs procuram peças por nome.
 */
export function mergeRooftopParts(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const toGroup = group.matrixWorld.clone().invert();
  const parts = new Map<string, THREE.Mesh[]>();
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)
      || mesh.material.transparent) return;
    // mergeGeometries exige o mesmo conjunto de atributos e de índice.
    const key = [mesh.material.uuid, mesh.renderOrder, Boolean(mesh.geometry.index),
      ...Object.keys(mesh.geometry.attributes).sort()].join("|");
    parts.set(key, [...(parts.get(key) ?? []), mesh]);
  });
  const merged: THREE.BufferGeometry[] = [];
  for (const meshes of parts.values()) {
    if (meshes.length < 2) continue;
    const pieces = meshes.map((mesh) =>
      mesh.geometry.clone().applyMatrix4(mesh.matrixWorld.clone().premultiply(toGroup)));
    const geometry = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    if (!geometry) continue;
    for (const mesh of meshes) mesh.removeFromParent();
    const mesh = new THREE.Mesh(geometry, meshes[0].material);
    mesh.renderOrder = meshes[0].renderOrder;
    group.add(mesh);
    merged.push(geometry);
  }
  group.userData.mergedGeometries = merged;
}

/** Libera referências do grupo. Geometrias e materiais são compartilhados no módulo. */
export function disposeRooftopMesh(group: THREE.Group): void {
  for (const child of group.children) {
    if (child instanceof THREE.InstancedMesh) child.dispose();
  }
  for (const geometry of group.userData.mergedGeometries ?? []) geometry.dispose();
  group.clear();
}

/** Descarta todos os recursos compartilhados. Chamar apenas no dispose final do manager. */
export function disposeRooftopSharedResources(): void {
  for (const geometry of SHARED_ROOFTOP_GEOMETRIES) {
    geometry.dispose();
  }
  for (const material of SHARED_ROOFTOP_MATERIALS) {
    material.dispose();
  }
  gardenGrassTexture?.dispose();
  gardenGrassTexture = null;
  gardenWoodTexture?.dispose();
  gardenWoodTexture = null;
  gardenPoolTileTexture?.dispose();
  gardenPoolTileTexture = null;
  gardenPoolWaterNormalTexture?.dispose();
  gardenPoolWaterNormalTexture = null;
  gardenPoolCausticTexture?.dispose();
  gardenPoolCausticTexture = null;
  gardenLeafCardTexture?.dispose();
  gardenLeafCardTexture = null;
}

/** @deprecated Use disposeRooftopSharedResources. Mantido para compatibilidade. */
export function disposeRooftopMaterials(): void {
  disposeRooftopSharedResources();
}
