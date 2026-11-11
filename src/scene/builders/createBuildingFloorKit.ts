import * as THREE from "three";

// Kit modular dos formatos com andares (yachthouse, residential, apartment, gourmet, loft).
// A cena instancia módulos (térreo, andar-tipo, cobertura) em vez de uma geometria do prédio
// inteiro por nº de andares: draw calls fixos, sem cache por altura. Os módulos saem do
// builder real com 3 andares, recortado nos planos entre andares — o builder segue como
// única fonte da forma. `scripts/check-building-floor-kit.mjs` prova kit = builder.

export type FloorKitSpec = {
  /** Metros: térreo (até a base do 1º andar), pé-direito, tudo acima do último andar. */
  groundH: number;
  floorH: number;
  roofExtra: number;
  floorCount: (height: number) => number;
  /** Geometria unitária (grupos = slots de material) com `floors` andares. */
  geometry: (floors: number) => THREE.BufferGeometry;
};

export type FloorKitPart = "ground" | "floor" | "roof" | "shaft" | "single";

/**
 * - `ground`: térreo + 1º andar; `roof`: último andar + cobertura. X/Z unitários, Y em
 *   metros a partir da base do módulo.
 * - `shaft`: peças contínuas da torre (núcleo, pano de vidro, montante) na altura de um
 *   andar-tipo. Uma instância por edifício, esticada em Y — prisma vertical estica exato.
 * - `floor`: o que se repete por andar (laje, guarda-corpo, janela). Uma instância por
 *   andar-tipo; fora no edifício distante.
 * - `single`: prédio de 1 andar (térreo e cobertura dividem o andar). Geometria unitária.
 */
export type FloorKit = { spec: FloorKitSpec } & Record<FloorKitPart, THREE.BufferGeometry>;

// Ruído de float não vira lasca no plano de corte (metros).
const SNAP = 1e-4;

// Recorta o polígono no plano y; devolve o lado de baixo ou o de cima.
function clip(polygon: number[][], plane: number, below: boolean): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const aIn = below ? a[1] <= plane : a[1] >= plane;
    const bIn = below ? b[1] <= plane : b[1] >= plane;
    if (aIn) out.push(a);
    if (aIn === bIn) continue;
    const t = (plane - a[1]) / (b[1] - a[1]);
    const cut = a.map((value, k) => value + (b[k] - value) * t);
    cut[1] = plane;
    out.push(cut);
  }
  return out;
}

function buildFloorKit(spec: FloorKitSpec): FloorKit {
  const source = spec.geometry(3);
  const total = spec.groundH + 3 * spec.floorH + spec.roofExtra;
  const cutLow = spec.groundH + spec.floorH; // base do andar-tipo
  const cutHigh = cutLow + spec.floorH; // base do último andar

  // aProj* é o próprio position/normal nesses formatos — religado no fim.
  const names = ["position", "normal", ...Object.keys(source.attributes)
    .filter((name) => name !== "position" && name !== "normal" && !name.startsWith("aProj"))];
  const attributes = names.map((name) => source.getAttribute(name) as THREE.BufferAttribute);
  const stride = attributes.reduce((sum, attribute) => sum + attribute.itemSize, 0);
  const slotCount = 1 + Math.max(...source.groups.map((group) => group.materialIndex ?? 0));

  // Vértice = todos os atributos em sequência; posição em (x unitário, y metros, z unitário).
  const readVertex = (index: number): number[] => {
    const vertex: number[] = [];
    for (const { array, itemSize } of attributes) {
      for (let k = 0; k < itemSize; k++) vertex.push(array[index * itemSize + k]);
    }
    let y = (vertex[1] + 0.5) * total;
    if (Math.abs(y - cutLow) < SNAP) y = cutLow;
    if (Math.abs(y - cutHigh) < SNAP) y = cutHigh;
    vertex[1] = y;
    // Normal acompanha a troca de escala em Y (inversa transposta).
    const ny = vertex[4] / total;
    const length = Math.hypot(vertex[3], ny, vertex[5]) || 1;
    vertex[3] /= length;
    vertex[4] = ny / length;
    vertex[5] /= length;
    return vertex;
  };

  const parts = {} as Record<Exclude<FloorKitPart, "single">, number[][]>;
  for (const part of ["ground", "floor", "roof", "shaft"] as const) {
    parts[part] = Array.from({ length: slotCount }, () => []);
  }
  const emit = (target: number[], polygon: number[][], base: number) => {
    for (let i = 1; i < polygon.length - 1; i++) {
      const [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]];
      const area = Math.hypot(
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      );
      if (area < 1e-10) continue; // triângulo que só encosta no plano de corte
      for (const vertex of [a, b, c]) {
        for (let k = 0; k < stride; k++) target.push(k === 1 ? vertex[1] - base : vertex[k]);
      }
    }
  };

  const index = source.index;
  for (const { start, count, materialIndex: slot = 0 } of source.groups) {
    for (let i = start; i < start + count; i += 3) {
      const triangle = [0, 1, 2].map((k) => readVertex(index ? index.getX(i + k) : i + k));
      const low = Math.min(triangle[0][1], triangle[1][1], triangle[2][1]);
      const high = Math.max(triangle[0][1], triangle[1][1], triangle[2][1]);
      // Face chapada no plano de corte fica com o módulo de baixo — uma vez só.
      if (high <= cutLow) emit(parts.ground[slot], triangle, 0);
      else if (low >= cutLow && high <= cutHigh) emit(parts.floor[slot], triangle, cutLow);
      else if (low >= cutHigh) emit(parts.roof[slot], triangle, cutHigh);
      else {
        emit(parts.ground[slot], clip(triangle, cutLow, true), 0);
        // Atravessa o andar-tipo inteiro = peça contínua da torre.
        const part = low <= cutLow && high >= cutHigh ? parts.shaft : parts.floor;
        emit(part[slot], clip(clip(triangle, cutLow, false), cutHigh, true), cutLow);
        emit(parts.roof[slot], clip(triangle, cutHigh, false), cutHigh);
      }
    }
  }

  const assemble = (slots: number[][]): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    const data = slots.flat();
    let vertices = 0;
    slots.forEach((values, slot) => {
      if (values.length === 0) return;
      geometry.addGroup(vertices, values.length / stride, slot);
      vertices += values.length / stride;
    });
    let offset = 0;
    attributes.forEach(({ itemSize }, a) => {
      const array = new Float32Array(vertices * itemSize);
      for (let v = 0; v < vertices; v++) {
        for (let k = 0; k < itemSize; k++) array[v * itemSize + k] = data[v * stride + offset + k];
      }
      geometry.setAttribute(names[a], new THREE.BufferAttribute(array, itemSize));
      offset += itemSize;
    });
    // Mesmo buffer com dois nomes: shader triplanar lê aProj*, sem cópia na GPU.
    geometry.setAttribute("aProjPosition", geometry.getAttribute("position"));
    geometry.setAttribute("aProjNormal", geometry.getAttribute("normal"));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  };

  return {
    spec,
    ground: assemble(parts.ground),
    floor: assemble(parts.floor),
    roof: assemble(parts.roof),
    shaft: assemble(parts.shaft),
    single: spec.geometry(1),
  };
}

const kits = new Map<FloorKitSpec, FloorKit>();

export function getFloorKit(spec: FloorKitSpec): FloorKit {
  let kit = kits.get(spec);
  if (!kit) {
    kit = buildFloorKit(spec);
    kits.set(spec, kit);
  }
  return kit;
}

/**
 * Peças de um edifício de altura `height` centrado em y = 0: módulo, Y da base do módulo e
 * escala Y. `detail` = com as peças por andar; sem ele sobra a silhueta (LOD distante).
 */
export function forEachFloorKitPart(
  kit: FloorKit,
  height: number,
  detail: boolean,
  emit: (part: FloorKitPart, y: number, scaleY: number) => void,
): void {
  const { groundH, floorH, roofExtra } = kit.spec;
  const floors = kit.spec.floorCount(height);
  if (floors === 1) {
    emit("single", 0, height);
    return;
  }
  const unit = height / (groundH + floors * floorH + roofExtra); // mundo por metro
  const base = -height / 2;
  emit("ground", base, unit);
  emit("roof", base + (groundH + (floors - 1) * floorH) * unit, unit);
  if (floors === 2) return;
  emit("shaft", base + (groundH + floorH) * unit, unit * (floors - 2));
  if (!detail) return;
  for (let f = 1; f < floors - 1; f++) emit("floor", base + (groundH + f * floorH) * unit, unit);
}

/** `single` é do cache do builder; só os módulos recortados são daqui. */
export function disposeFloorKits(): void {
  for (const kit of kits.values()) {
    for (const part of ["ground", "floor", "roof", "shaft"] as const) kit[part].dispose();
  }
  kits.clear();
}
