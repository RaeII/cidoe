// node scripts/check-building-floor-kit.mjs — builders reais, sem servidor/navegador/GPU.
//
// Objetivo: provar que o kit modular da cena (térreo + andar-tipo × n + cobertura, ver
// src/scene/builders/createBuildingFloorKit.ts) desenha a MESMA superfície que o builder
// do formato, em vários nºs de andares, slot a slot:
//   - área por slot igual (pega peça duplicada ou faltando);
//   - amostras da superfície do builder caem no kit e vice-versa (pega peça fora do lugar);
//   - LOD distante (sem as peças por andar) é subconjunto do builder.
// Falha com assert. Rodar ao criar/alterar builder de formato com andares.
import assert from "node:assert/strict";
import { build } from "esbuild";

const threeUrl = import.meta.resolve("three");
const bundle = await build({
  stdin: {
    contents: ["createBuildingShapeMesh", "createBuildingFloorKit"]
      .map((name) => `export * from './src/scene/builders/${name}.ts';`).join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  plugins: [{ name: "shared-three", setup(builder) {
    builder.onResolve({ filter: /^three$/ }, () => ({ path: threeUrl, external: true }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

// Triângulos por slot: [ax, ay, az, bx, by, bz, cx, cy, cz], com y' = y * scaleY + offsetY.
function triangles(geometry, scaleY, offsetY, out) {
  const position = geometry.getAttribute("position");
  for (const { start, count, materialIndex } of geometry.groups) {
    const list = out[materialIndex] ??= [];
    for (let i = start; i < start + count; i += 3) {
      const triangle = [];
      for (let k = 0; k < 3; k++) {
        const v = geometry.index ? geometry.index.getX(i + k) : i + k;
        triangle.push(position.getX(v), position.getY(v) * scaleY + offsetY, position.getZ(v));
      }
      list.push(triangle);
    }
  }
  return out;
}

const area = ([ax, ay, az, bx, by, bz, cx, cy, cz]) => Math.hypot(
  (by - ay) * (cz - az) - (bz - az) * (cy - ay),
  (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
  (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
) / 2;

function onTriangle(p, [ax, ay, az, bx, by, bz, cx, cy, cz]) {
  const e0 = [bx - ax, by - ay, bz - az], e1 = [cx - ax, cy - ay, cz - az], vp = [p[0] - ax, p[1] - ay, p[2] - az];
  const n = [e0[1] * e1[2] - e0[2] * e1[1], e0[2] * e1[0] - e0[0] * e1[2], e0[0] * e1[1] - e0[1] * e1[0]];
  const length = Math.hypot(...n);
  if (length < 1e-14) return false;
  if (Math.abs((vp[0] * n[0] + vp[1] * n[1] + vp[2] * n[2]) / length) > 1e-5) return false;
  const d00 = e0[0] * e0[0] + e0[1] * e0[1] + e0[2] * e0[2];
  const d01 = e0[0] * e1[0] + e0[1] * e1[1] + e0[2] * e1[2];
  const d11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2];
  const d20 = vp[0] * e0[0] + vp[1] * e0[1] + vp[2] * e0[2];
  const d21 = vp[0] * e1[0] + vp[1] * e1[1] + vp[2] * e1[2];
  const denominator = d00 * d11 - d01 * d01;
  const v = (d11 * d20 - d01 * d21) / denominator;
  const w = (d00 * d21 - d01 * d20) / denominator;
  return v >= -1e-4 && w >= -1e-4 && v + w <= 1 + 1e-4;
}

// Gerador fixo: mesma amostragem toda vez.
let seed = 12345;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

// Toda amostra de `from` (proporcional à área) tem que cair em algum triângulo de `onto`.
function covered(from, onto, samples, label) {
  const total = from.reduce((sum, triangle) => sum + area(triangle), 0);
  for (const triangle of from) {
    const count = Math.ceil((area(triangle) / total) * samples);
    for (let s = 0; s < count; s++) {
      let u = random(), v = random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const p = [0, 1, 2].map((k) =>
        triangle[k] + (triangle[3 + k] - triangle[k]) * u + (triangle[6 + k] - triangle[k]) * v);
      assert.ok(onto.some((other) => onTriangle(p, other)), `${label}: ponto ${p.map((n) => n.toFixed(4))} sem par`);
    }
  }
}

const KIT_SHAPES = api.BUILDING_SHAPES.filter((shape) => api.getBuildingShapeFloorKit(shape));
assert.equal(KIT_SHAPES.length, 5, "formatos com kit: yachthouse, residential, apartment, gourmet, loft");

for (const shape of KIT_SHAPES) {
  const kit = api.getBuildingShapeFloorKit(shape);
  for (const floors of [1, 2, 3, 4, 7, 20]) {
    // Altura da cena que dá esse nº de andares.
    let height = 0.1;
    while (kit.spec.floorCount(height) < floors) height += 0.01;
    assert.equal(kit.spec.floorCount(height), floors, `${shape}: sem altura para ${floors} andares`);

    const builder = triangles(kit.spec.geometry(floors), height, 0, {});
    for (const detail of [true, false]) {
      const composed = {};
      api.forEachFloorKitPart(kit, height, detail, (part, y, scaleY) => triangles(kit[part], scaleY, y, composed));
      for (const [slot, list] of Object.entries(composed)) {
        const label = `${shape} ${floors} andares, slot ${slot}${detail ? "" : " (LOD)"}`;
        assert.ok(builder[slot], `${label}: slot não existe no builder`);
        covered(list, builder[slot], 400, `${label} kit→builder`);
        if (!detail) continue;
        const [a, b] = [list, builder[slot]].map((set) => set.reduce((sum, triangle) => sum + area(triangle), 0));
        // Posição é float32: erro relativo ~1e-6. Peça faltando/sobrando passa longe disso.
        assert.ok(Math.abs(a - b) <= 1e-4 * b, `${label}: área ${a} ≠ ${b}`);
        covered(builder[slot], list, 400, `${label} builder→kit`);
      }
      if (detail) assert.deepEqual(Object.keys(composed).sort(), Object.keys(builder).sort(), `${shape}: slots do kit`);
    }
  }
  const count = (part) => kit[part].getAttribute("position").count / 3;
  console.log(`${shape}: kit = builder em 1–20 andares; triângulos térreo ${count("ground")}, miolo ${count("shaft")}, por andar ${count("floor")}, cobertura ${count("roof")}`);
}
api.disposeBuildingShapeSharedResources();
