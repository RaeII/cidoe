// node scripts/check-building-draw-calls.mjs — geometria real, sem servidor/navegador/GPU.
import assert from "node:assert/strict";
import * as THREE from "three";
import { build } from "esbuild";

const shapes = {
  twisted: "Twisted", octagonal: "Octagonal", setback: "Setback", tapered: "Tapered",
  chrysler: "Chrysler", hearst: "Hearst", empire: "Empire", taipei: "Taipei", "one-trade": "OneTrade",
};
const threeUrl = import.meta.resolve("three");
const bundle = await build({
  stdin: {
    contents: ["export * from './src/scene/builders/createBuildingShapeMesh.ts';",
      ...Object.values(shapes).map((name) => `export * from './src/scene/builders/create${name}BuildingMesh.ts';`),
    ].join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true, format: "esm", platform: "node", write: false,
  plugins: [{ name: "shared-three", setup(builder) {
    builder.onResolve({ filter: /^three$/ }, () => ({ path: threeUrl, external: true }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);

// Preserva também ordem dos vértices (winding) e triângulos dentro de cada material.
function indicesByMaterial(geometry) {
  const result = {};
  for (const { start, count, materialIndex } of geometry.groups) {
    const indices = result[materialIndex] ??= [];
    for (let i = start; i < start + count; i++) indices.push(geometry.index?.getX(i) ?? i);
  }
  return result;
}

function hits(mesh) {
  mesh.updateMatrixWorld(true);
  return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)].flatMap((direction) =>
    [-0.4, 0, 0.4].map((y) => {
      const origin = direction.clone().multiplyScalar(2).setY(y);
      const hit = new THREE.Raycaster(origin, direction.clone().negate()).intersectObject(mesh)[0];
      return hit ? { distance: hit.distance, point: hit.point.toArray(), material: hit.face.materialIndex } : null;
    }),
  );
}

const defaultGeometry = api.createUnitBuildingGeometry();
for (const [shape, name] of Object.entries(shapes)) {
  const facade = new THREE.MeshPhysicalMaterial();
  const top = new THREE.MeshPhysicalMaterial();
  const original = api[`create${name}BuildingMesh`](facade, top);
  const geometry = original.geometry;
  const before = geometry.groups.length;
  const indices = indicesByMaterial(geometry);
  const attributes = Object.fromEntries(Object.entries(geometry.attributes)
    .map(([key, attribute]) => [key, attribute.array.slice()]));
  const picked = hits(original);
  const bounds = new THREE.Box3().setFromObject(original);

  const optimized = api.createBuildingShapeMesh(shape, facade, top, defaultGeometry);
  const batched = optimized.geometry;
  assert.equal(batched.groups.length, Object.keys(indices).length, `${shape}: grupos redundantes`);
  assert.deepEqual(indicesByMaterial(batched), indices, `${shape}: triângulo/material mudou`);
  assert.deepEqual(Object.keys(batched.attributes), Object.keys(attributes));
  for (const [key, array] of Object.entries(attributes)) {
    assert.equal(batched.attributes[key], geometry.attributes[key], `${shape}: buffer duplicado`);
    assert.deepEqual(batched.attributes[key].array, array, `${shape}: atributo ${key} mudou`);
  }
  assert.deepEqual(hits(optimized), picked, `${shape}: seleção mudou`);
  assert.ok(new THREE.Box3().setFromObject(optimized).equals(bounds), `${shape}: limites mudaram`);

  let disposed = 0;
  batched.addEventListener("dispose", () => { disposed++; });
  const index = batched.index;
  const repeated = api.createBuildingShapeMesh(shape, facade, top, defaultGeometry);
  assert.equal(repeated.geometry, batched);
  assert.equal(batched.index, index, `${shape}: índice recriado no cache`);
  assert.equal(disposed, 0, `${shape}: cache descartado ao criar outro edifício`);

  api.setBuildingShapeMeshBatching(optimized, false);
  assert.equal(optimized.geometry, geometry, `${shape}: transparência não restaurou ordem original`);
  assert.equal(geometry.groups.length, before, `${shape}: grupos originais alterados`);
  assert.equal(repeated.geometry, batched, `${shape}: foco mudou outro edifício`);
  api.setBuildingShapeMeshBatching(optimized, true);
  assert.equal(optimized.geometry, batched, `${shape}: sair do foco perdeu cache`);

  api.disposeBuildingShapeSharedResources();
  assert.equal(disposed, 1, `${shape}: geometria não descartada`);
  const materials = new Set([original, optimized, repeated].flatMap((mesh) => mesh.material));
  for (const material of materials) material.dispose();
  console.log(`${shape}: ${before} → ${batched.groups.length} grupos; triângulos, materiais e seleção preservados`);
}
defaultGeometry.dispose();
