// node scripts/check-helicopter.mjs — verifica geometria sem servidor ou navegador.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import ts from "typescript";

const source = await readFile(new URL("../src/scene/builders/createRooftopMesh.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const moduleText = outputText
  .replace('from "three"', `from ${JSON.stringify(import.meta.resolve("three"))}`)
  .replace(/from "(three\/addons\/[^"]+)"/g, (_, spec) => `from ${JSON.stringify(import.meta.resolve(spec))}`);
const { createRooftopMesh, disposeRooftopMesh, disposeRooftopSharedResources, mergeRooftopParts } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleText).toString("base64")}`
);

for (const span of [1, 1.5, 4]) {
  const model = createRooftopMesh("helicopter", { width: span, depth: span });
  model.updateMatrixWorld(true);
  const part = (name) => {
    const mesh = model.getObjectByName(name);
    assert(mesh, `Peça ausente: ${name}`);
    return mesh;
  };
  const bounds = (name) => new THREE.Box3().setFromObject(part(name));
  assert(new THREE.Box3().setFromObject(model).min.y > 0, "Modelo atravessa a cobertura");
  assert.equal(model.children.filter((mesh) => mesh.name.startsWith("main-blade-")).length, 3);
  assert.equal(model.children.filter((mesh) => mesh.name.startsWith("tail-blade-")).length, 2);
  assert(bounds("main-mast").intersectsBox(bounds("main-hub")), "Mastro desconectado do hub");
  assert(bounds("main-mast").intersectsBox(bounds("engine-cowling")), "Mastro desconectado do motor");
  for (let blade = 0; blade < 3; blade++) {
    assert(bounds(`main-blade-${blade}`).min.y > bounds("engine-cowling").max.y, "Pá dentro do motor");
    assert(bounds(`main-blade-${blade}`).min.y > bounds("tail-fin").max.y, "Pá atinge a deriva");
  }
  // No espaço local, o rotor traseiro precisa ficar lateralmente fora da deriva e do boom.
  for (let blade = 0; blade < 2; blade++) {
    const mesh = part(`tail-blade-${blade}`);
    assert(mesh.position.z - mesh.scale.z / 2 > 0.05, "Rotor traseiro atravessa a cauda");
  }

  const hull = part("fuselage");
  const positions = hull.geometry.getAttribute("position");
  const raycaster = new THREE.Raycaster();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let windows = 0;
  for (const group of hull.geometry.groups) {
    for (let i = group.start; i < group.start + group.count; i += 3) {
      a.fromBufferAttribute(positions, i);
      b.fromBufferAttribute(positions, i + 1);
      c.fromBufferAttribute(positions, i + 2);
      const triangle = new THREE.Triangle(a, b, c);
      assert(triangle.getArea() > 1e-8, "Triângulo degenerado no casco");
      if (group.materialIndex !== 1) continue;
      const center = triangle.getMidpoint(new THREE.Vector3()).applyMatrix4(hull.matrixWorld);
      const normal = triangle.getNormal(new THREE.Vector3()).transformDirection(hull.matrixWorld);
      raycaster.set(center.clone().addScaledVector(normal, 0.03 * model.scale.x), normal.negate());
      const hit = raycaster.intersectObject(hull, false)[0];
      assert(hit && hit.face.materialIndex === 1, "Vidro oculto pelo casco ou com normal invertida");
      assert(hit.point.distanceTo(center) < 1e-5, "Vidro atravessado por outra superfície");
      windows++;
    }
  }
  assert.equal(windows, 16, "Esperados seis vidros laterais e duas metades do para-brisa");
  for (const mesh of model.children) {
    assert(!Array.isArray(mesh.material) || mesh.material.every((material) => !material.transparent));
  }
  disposeRooftopMesh(model);
  assert.equal(model.children.length, 0);
}

// Jardim pinta texturas em canvas; no Node basta um 2D que não desenha nada.
const noop2d = new Proxy({}, {
  get: (target, key) => key in target ? target[key] : key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => {},
  set: (target, key, value) => { target[key] = value; return true; },
});
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => noop2d }) };

// mergeRooftopParts (só na cidade): mesma caixa e mesmos triângulos, menos malhas.
const meshes = (group) => { const list = []; group.traverse((o) => o.isMesh && list.push(o)); return list; };
const triangles = (group) => meshes(group).reduce((sum, mesh) =>
  sum + (mesh.geometry.index ?? mesh.geometry.getAttribute("position")).count / 3 * (mesh.isInstancedMesh ? mesh.count : 1), 0);
for (const type of ["spotlights", "helipad", "garden", "helicopter"]) {
  const loose = createRooftopMesh(type, { width: 1.4, depth: 1.1 });
  const merged = createRooftopMesh(type, { width: 1.4, depth: 1.1 });
  mergeRooftopParts(merged);
  const before = new THREE.Box3().setFromObject(loose, true);
  const after = new THREE.Box3().setFromObject(merged, true);
  assert(before.min.distanceTo(after.min) < 1e-5 && before.max.distanceTo(after.max) < 1e-5, `${type}: caixa mudou`);
  assert(Math.abs(triangles(loose) - triangles(merged)) < 1e-6, `${type}: triângulos mudaram`);
  assert(meshes(merged).length < meshes(loose).length, `${type}: nada fundido`);
  console.log(`${type}: ${meshes(loose).length} → ${meshes(merged).length} malhas`);
  disposeRooftopMesh(loose);
  disposeRooftopMesh(merged);
}
disposeRooftopSharedResources();
console.log("Helicóptero: vidros expostos, malha válida, rotores, encaixes e escala OK. Fusão dos topos OK.");
