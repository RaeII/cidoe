// node scripts/measure-building-geometry.mjs — builders reais, sem servidor/navegador/GPU.
//
// Objetivo: custo de cada formato de edifício antes de ir pra cena.
//   Tabela 1: grupos (= draw calls por edifício), materiais, slots transparentes, triângulos e
//             vértices, em 3 alturas pros formatos com andares.
//   Tabela 2: formatos com geometria por nº de andares — quantas variantes o cache guarda
//             entre as alturas 1 e 16, MB de buffers, se é indexada e quanto soldar economiza.
// Mede, não afirma. Rodar ao criar/alterar um builder → doc/scene/engine/novo-edificio.md.
import { readdirSync } from "node:fs";
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { build } from "esbuild";

const dir = "src/scene/builders";
const threeUrl = import.meta.resolve("three");
const bundle = await build({
  stdin: {
    contents: readdirSync(dir)
      .filter((file) => /^create(BuildingShape|\w+Building)Mesh\.ts$/.test(file))
      .map((file) => `export * from './${dir}/${file}';`).join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  // Mesmo `three` do script: instanceof e caches batem.
  plugins: [{ name: "shared-three", setup(builder) {
    builder.onResolve({ filter: /^three$/ }, () => ({ path: threeUrl, external: true }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

const triangles = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
const bytes = (geometry) => Object.values(geometry.attributes).reduce((sum, a) => sum + a.array.byteLength, 0) +
  (geometry.index?.array.byteLength ?? 0);
// "one-trade" → setOneTradeBuildingHeight; formato sem andares não exporta o setter.
const heightSetter = (shape) =>
  api[`set${shape.replace(/(^|-)(\w)/g, (_, _dash, letter) => letter.toUpperCase())}BuildingHeight`];
const createMesh = (shape, defaultGeometry) => api.createBuildingShapeMesh(
  shape, new THREE.MeshPhysicalMaterial(), new THREE.MeshPhysicalMaterial(), defaultGeometry);

const defaultGeometry = api.createUnitBuildingGeometry();
const shapes = api.BUILDING_SHAPES.filter((shape) => shape !== "default");

const perShape = [];
for (const shape of shapes) {
  const setHeight = heightSetter(shape);
  for (const height of setHeight ? [3, 10, 18] : [null]) {
    const mesh = createMesh(shape, defaultGeometry);
    if (height !== null) setHeight(mesh, height);
    const materials = [mesh.material].flat();
    perShape.push({
      formato: shape,
      altura: height ?? "fixa",
      "grupos (draws)": mesh.geometry.groups.length,
      materiais: new Set(materials).size,
      transparentes: materials.filter((material) => material.transparent).length,
      triângulos: triangles(mesh.geometry),
      vértices: mesh.geometry.attributes.position.count,
      "buffers (KB)": Math.round(bytes(mesh.geometry) / 1024),
    });
  }
}
console.log("Custo por edifício");
console.table(perShape);

const variants = [];
for (const shape of shapes) {
  const setHeight = heightSetter(shape);
  if (!setHeight) continue;
  const mesh = createMesh(shape, defaultGeometry);
  const seen = new Set();
  for (let height = 1; height <= 16.001; height += 0.02) {
    setHeight(mesh, height);
    seen.add(mesh.geometry);
  }
  const largest = [...seen].reduce((a, b) => (triangles(b) > triangles(a) ? b : a));
  // Solda só o que o render usa de fato (aProj* é cópia de position/normal fora do twisted).
  const plain = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    if (largest.attributes[name]) plain.setAttribute(name, largest.attributes[name]);
  }
  plain.setIndex(largest.index);
  const vertices = largest.attributes.position.count;
  const welded = mergeVertices(plain).attributes.position.count;
  variants.push({
    formato: shape,
    "variantes (h 1–16)": seen.size,
    "buffers (MB)": +([...seen].reduce((sum, geometry) => sum + bytes(geometry), 0) / 1048576).toFixed(1),
    indexada: Boolean(largest.index),
    "vértices (maior)": vertices,
    soldados: welded,
    "economia soldando": `${Math.round((1 - welded / vertices) * 100)}%`,
  });
}
console.log("Geometria por nº de andares (cache por altura)");
console.table(variants);
console.log(`total em buffers: ${variants.reduce((sum, v) => sum + v["buffers (MB)"], 0).toFixed(1)} MB`);

api.disposeBuildingShapeSharedResources();
defaultGeometry.dispose();
