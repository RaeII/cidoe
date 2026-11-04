// node scripts/check-building-textures.mjs — manager real, sem servidor, navegador ou GPU.
import assert from "node:assert/strict";
import * as THREE from "three";
import { build } from "esbuild";

const threeUrl = import.meta.resolve("three");
const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/scene/managers/createDonationManager.ts';",
      ...["building", "texture", "blockLayout"].map(
        (name) => `export * from './src/scene/config/${name}Config.ts';`,
      ),
    ].join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true, format: "esm", platform: "node", write: false,
  external: [threeUrl],
  define: { "import.meta.env.DEV": "false" },
  plugins: [{
    name: "texture-io",
    setup(builder) {
      builder.onResolve({ filter: /^three$/ }, () => ({ path: threeUrl, external: true }));
      builder.onResolve({ filter: /facadeTexture(Loader|Manifest)$/ }, ({ path }) => ({
        path, namespace: "texture-io",
      }));
      builder.onLoad({ filter: /.*/, namespace: "texture-io" }, ({ path }) => ({
        contents: path.endsWith("Manifest") ? `
          export const resolveFacadeFolder = (value) => value?.replace(/^texture\\//, '') ?? '';
          export const getFacadeMapUrls = () => ({});
        ` : `
          import { Texture } from ${JSON.stringify(threeUrl)};
          const cache = new Map();
          export const initFacadeTextureLoader = () => {};
          export const peekFacadeTextureSet = (value) => {
            const folder = value.replace(/^texture\\//, '');
            if (!cache.has(folder)) {
              const color = new Texture();
              color.name = folder;
              cache.set(folder, { color, normal: null, roughness: null, metalness: null, displacement: null });
            }
            return cache.get(folder);
          };
          export const loadFacadeTextureSet = async (value) => peekFacadeTextureSet(value);
          export const loadFacadeNormals = async () => {};
        `,
      }));
    },
  }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const scene = new THREE.Scene();
const manager = api.createDonationManager({
  scene,
  renderer: { capabilities: { getMaxAnisotropy: () => 4 } },
  buildingSettings: api.createDefaultBuildingSettings(),
  textureSettings: { ...api.createDefaultTextureSettings(), textureKey: "texture/global" },
  blockLayoutSettings: api.createDefaultBlockLayoutSettings(),
});
manager.setFacadeTexturePool(["texture/global", "texture/saved", "texture/selected"]);
manager.setDonations([{ id: 1, value: 100 }, { id: 2, value: 50 }]);
const customization = {
  buildingShape: "default", textureKey: null, tilingScale: 1, color: "#ffffff",
  rooftopType: "none", signText: "", signSides: 1, edgeLightType: "none",
  hologramImage: null,
};
const highlight = () => scene.children.find((mesh) =>
  mesh.isMesh && !mesh.isInstancedMesh && Array.isArray(mesh.material)
  && mesh.material[0].isMeshPhysicalMaterial && mesh.visible,
);
manager.setFocusedDonation(1);
const randomTexture = highlight().material[0].map;
manager.setFocusedDonation(null);
manager.updateDonationCustomization(1, { ...customization, textureKey: "texture/saved" });
manager.setFocusedDonation(1);
const focusedMesh = highlight();
assert.equal(focusedMesh.material[0].map.name, "saved");
const sharedTop = scene.children.find((mesh) => mesh.isInstancedMesh && Array.isArray(mesh.material)
  && mesh.material[0].isMeshPhysicalMaterial).material[1];
assert(focusedMesh.material[1].color.equals(sharedTop.color), "Foco repintou a laje de cimento");
const childrenBefore = [...scene.children];
const geometryBefore = focusedMesh.geometry;
const matricesBefore = scene.children.filter((mesh) => mesh.isInstancedMesh)
  .map((mesh) => [mesh, mesh.instanceMatrix]);

manager.updateDonationCustomization(1, { ...customization, textureKey: "texture/selected" });
assert.equal(focusedMesh.material[0].map.name, "selected", "destaque manteve textura anterior");
assert.deepEqual(scene.children, childrenBefore, "troca recriou meshes da cidade");
assert.equal(focusedMesh.geometry, geometryBefore);
for (const [mesh, matrices] of matricesBefore) assert.equal(mesh.instanceMatrix, matrices);
const selectedGroup = scene.children.find((mesh) => mesh.isInstancedMesh
  && Array.isArray(mesh.material) && mesh.material[0].map?.name === "selected");
assert.equal(focusedMesh.material[0].map, selectedGroup.material[0].map, "cache não compartilhado");
assert.equal(scene.children.filter((mesh) => mesh.isInstancedMesh && Array.isArray(mesh.material)
  && mesh.material[0].isMeshPhysicalMaterial).reduce((sum, mesh) => sum + mesh.count, 0), 1,
"Instância esmaecida foi desenhada por cima do destaque");

manager.updateDonationCustomization(2, { ...customization, textureKey: "texture/global" });
assert.equal(focusedMesh.material[0].map.name, "selected", "outro prédio alterou destaque");
manager.updateDonationCustomization(1, { ...customization, textureKey: "texture/global" });
assert.equal(focusedMesh.material[0].map.name, "global");
manager.updateDonationCustomization(1, customization);
assert.equal(focusedMesh.material[0].map, randomTexture, "automática não restaurou textura sorteada");
manager.setFocusedDonation(null);
manager.setFocusedDonation(1);
assert.equal(highlight().material[0].map, randomTexture, "reabrir foco mudou textura");

// Foco não pode devolver milhares de grupos aos prédios esmaecidos.
manager.setFocusedDonation(null);
for (const id of [1, 2]) {
  manager.updateDonationCustomization(id, { ...customization, buildingShape: "empire" });
}
const first = scene.children.find((mesh) => mesh.userData.donationId === 1);
const second = scene.children.find((mesh) => mesh.userData.donationId === 2);
const batched = first.geometry;
assert.equal(batched.groups.length, 8);
assert.equal(second.geometry, batched, "Empire não reutilizou geometria agrupada");
manager.setFocusedDonation(1);
assert.equal(first.geometry, batched, "Destaque opaco perdeu batching");
assert.equal(second.geometry, batched, "Contexto esmaecido perdeu batching");
assert.ok(second.material.every((material) => material.transparent && material.opacity === 0.15));
assert.ok(second.material.every((material) => !material.depthWrite), "Contexto transparente oculta o selecionado");
manager.setFocusedDonation(2);
assert.equal(first.geometry, batched, "Troca de foco multiplicou draws");
assert.equal(second.geometry, batched);
manager.setFocusedDonation(null);
assert.equal(first.geometry, batched);
assert.equal(second.geometry, batched);
assert.ok(first.material.every((material) => !material.transparent && material.opacity === 1));
assert.ok(first.material.every((material) => material.depthWrite));
const stableVersions = first.material.map((mat) => mat.version);
manager.setFocusedDonation(null);
assert.deepEqual(first.material.map((mat) => mat.version), stableVersions, "foco idêntico invalidou materiais");

// Acessórios compartilhados: somente os vizinhos esmaecem, sem perder opacidade autoral.
const context = new Proxy({
  measureText: () => ({ width: 40 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
}, { get: (target, key) => target[key] ?? (() => {}) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
for (const id of [1, 2]) manager.updateDonationCustomization(id, {
  ...customization, buildingShape: "empire", rooftopType: "helicopter", edgeLightType: "led",
});
const rooftops = scene.children.filter((group) => group.userData.rooftopType);
const rooftopMaterials = rooftops.map((group) => group.children.map((mesh) => mesh.material));
const allMaterials = (group) => {
  const materials = [];
  group.traverse((mesh) => { if (mesh.material) materials.push(...[mesh.material].flat()); });
  return materials;
};
assert.equal(allMaterials(rooftops[0])[0], allMaterials(rooftops[1])[0], "Fixture deve compartilhar material");
const leds = scene.children.filter((group) => group.userData.edgeLightType);
const ledOpacity = leds.map((group) => group.children.map((mesh) => mesh.material.opacity));
manager.setFocusedDonation(1);
assert.deepEqual(rooftops[0].children.map((mesh) => mesh.material), rooftopMaterials[0]);
const fadedRooftop = allMaterials(rooftops[1])[0];
let fadedDisposed = false;
fadedRooftop.addEventListener("dispose", () => { fadedDisposed = true; });
for (const material of allMaterials(rooftops[1])) {
  assert.equal(material.opacity, 0.15);
  assert(material.transparent && !material.depthWrite);
}
leds.forEach((group, i) => group.children.forEach((mesh, j) => {
  assert.equal(mesh.material.opacity, ledOpacity[i][j] * (i === 0 ? 1 : 0.15), "Halo perdeu opacidade autoral");
}));
manager.updateDistanceCulling(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, 0, 1));
assert.deepEqual(scene.children.filter((object) => object.isPointLight && object.intensity > 0)
  .map((light) => light.intensity).sort((a, b) => a - b), [10.5, 70], "Luz dos LEDs vizinhos continuou acesa por inteiro");
const stableAccessories = rooftops[1].children.map((mesh) => mesh.material);
manager.setFocusedDonation(1);
assert.deepEqual(rooftops[1].children.map((mesh) => mesh.material), stableAccessories, "Mesmo foco recriou clones");
manager.setFocusedDonation(2);
assert(!fadedDisposed, "Troca de foco descartou clone ainda compartilhado");
assert.equal(allMaterials(rooftops[0])[0], fadedRooftop, "Troca de foco recompilou material compartilhado");
assert.equal(rooftops[1].children[0].material, rooftopMaterials[1][0]);
assert.equal(allMaterials(rooftops[1])[0].opacity, 1);
manager.updateDonationCustomization(1, { ...customization, buildingShape: "empire", rooftopType: "spotlights" });
assert(fadedDisposed, "Clone sem usuários não foi descartado");
const spotlights = scene.children.find((group) => group.userData.rooftopType === "spotlights");
assert(allMaterials(spotlights).every((material) => material.opacity <= 0.15), "Acessório criado durante foco ficou opaco");
manager.updateDonationCustomization(1, { ...customization, buildingShape: "empire", rooftopType: "garden" });
const garden = scene.children.find((group) => group.userData.rooftopType === "garden");
assert(allMaterials(garden).every((material) => material.transparent && material.opacity <= 0.15));
assert(allMaterials(garden).some((material) => material.opacity === 0.62 * 0.15), "Piscina perdeu opacidade autoral no foco");
manager.setFocusedDonation(null);
assert(allMaterials(garden).some((material) => material.opacity === 0.62));
assert.deepEqual(rooftops[1].children.map((mesh) => mesh.material), rooftopMaterials[1]);

// Letreiros e hologramas (uniform próprio) seguem o mesmo foco e a edição ao vivo.
globalThis.Image = class {
  naturalWidth = 16; naturalHeight = 16;
  set src(_value) { queueMicrotask(() => this.onload()); }
};
for (const id of [1, 2]) manager.updateDonationCustomization(id, {
  ...customization, buildingShape: "empire", signText: "Teste", signSides: 2,
  hologramImage: "data:image/png;base64,fixture", hologramOpacity: 0.6,
});
await new Promise((resolve) => setTimeout(resolve, 0));
const signs = scene.children.filter((group) => group.userData.signDisposables);
const signMaterials = signs.map(allMaterials);
const holograms = scene.children.filter((group) => group.children.some((mesh) => mesh.material?.uniforms?.uOpacity));
manager.setFocusedDonation(1);
assert.deepEqual(allMaterials(signs[0]), signMaterials[0]);
assert(allMaterials(signs[1]).every((material) => material.opacity === 0.15));
assert.equal(holograms[0].children[0].material.uniforms.uOpacity.value, 0.6);
assert.equal(holograms[1].children[0].material.uniforms.uOpacity.value, 0.6 * 0.15);
manager.updateDonationCustomization(2, {
  ...customization, buildingShape: "empire", signText: "Teste", signSides: 2,
  hologramImage: "data:image/png;base64,fixture", hologramOpacity: 0.4,
});
assert.equal(holograms[1].children[0].material.uniforms.uOpacity.value, 0.4 * 0.15);
manager.setFocusedDonation(null);
assert.deepEqual(allMaterials(signs[1]), signMaterials[1]);
assert.equal(holograms[1].children[0].material.uniforms.uOpacity.value, 0.4);

// Vidros dos formatos residenciais voltam à opacidade e depthWrite do builder.
manager.updateDonationCustomization(1, { ...customization, buildingShape: "residential" });
const residential = scene.children.find((mesh) => mesh.userData.donationId === 1);
const glass = residential.material.find((material) => material.transparent);
const authoredGlass = { opacity: glass.opacity, depthWrite: glass.depthWrite };
manager.setFocusedDonation(2);
assert.equal(glass.opacity, authoredGlass.opacity * 0.15);
manager.setFocusedDonation(1);
assert.equal(glass.opacity, authoredGlass.opacity);
assert.equal(glass.depthWrite, authoredGlass.depthWrite);
manager.setFocusedDonation(null);

// Frustum por quadra preserva todos os prédios que cruzam a imagem; probe restaura tudo.
manager.setDonations(Array.from({ length: 200 }, (_, i) => ({ id: 100 + i, value: 200 - i })));
manager.setRenderDistance(Infinity, Infinity, Infinity);
const buildings = () => scene.children.filter((mesh) => mesh.isInstancedMesh && Array.isArray(mesh.material) && mesh.material[0].isMeshPhysicalMaterial);
const full = buildings().map((mesh) => ({ mesh, count: mesh.count, matrices: mesh.instanceMatrix.array.slice(0, mesh.count * 16) }));
const originalMeshes = full.map(({ mesh, count, matrices }) => {
  const original = new THREE.InstancedMesh(mesh.geometry, mesh.material, count);
  original.instanceMatrix.array.set(matrices);
  return original;
});
const idsByPosition = new Map(Array.from({ length: 200 }, (_, i) => {
  const id = i + 100;
  const position = manager.getDonationWorldPosition(id);
  return [`${Math.fround(position.x)},${Math.fround(position.z)}`, id];
}));
const raycaster = new THREE.Raycaster();
const camera = new THREE.PerspectiveCamera(45, 9 / 16, 0.1, 500);
const projection = new THREE.Matrix4();
const bounds = new THREE.Box3();
const matrix = new THREE.Matrix4();
for (const [x, z] of [[0, 80], [80, 0], [0, -80], [-80, 0]]) {
  camera.position.set(x, 25, z);
  camera.lookAt(0, 8, 0);
  camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let expected = 0;
  for (const { mesh, count, matrices } of full) {
    mesh.geometry.computeBoundingBox();
    for (let i = 0; i < count; i++) {
      bounds.copy(mesh.geometry.boundingBox).applyMatrix4(matrix.fromArray(matrices, i * 16));
      if (frustum.intersectsBox(bounds)) expected++;
    }
  }
  manager.updateDistanceCulling(camera.position, camera.getWorldDirection(new THREE.Vector3()), frustum);
  assert.equal(buildings().reduce((sum, mesh) => sum + mesh.count, 0), expected, "frustum perdeu prédio visível");
  for (const x of [-0.5, 0, 0.5]) {
    raycaster.setFromCamera(new THREE.Vector2(x, 0), camera);
    const hit = raycaster.intersectObjects(originalMeshes, false)[0];
    let expectedId = null;
    if (hit) {
      hit.object.getMatrixAt(hit.instanceId, matrix);
      expectedId = idsByPosition.get(`${matrix.elements[12]},${matrix.elements[14]}`);
    }
    const selected = manager.getClickedDonationId({ clientX: (x + 1) * 180, clientY: 320 }, camera,
      { getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) });
    assert.equal(selected, expectedId, "compactação mudou o id do prédio selecionado");
  }
  const compacted = buildings().map((mesh) => mesh.instanceMatrix.array.slice(0, mesh.count * 16));
  const versions = buildings().map((mesh) => mesh.instanceMatrix.version);
  manager.updateDistanceCulling(camera.position, camera.getWorldDirection(new THREE.Vector3()), frustum);
  assert.deepEqual(buildings().map((mesh) => mesh.instanceMatrix.version), versions);
  manager.beginEnvCapture(true);
  for (const { mesh, count, matrices } of full) {
    assert.equal(mesh.count, count);
    assert.deepEqual(mesh.instanceMatrix.array.slice(0, count * 16), matrices);
  }
  manager.endEnvCapture();
  assert.deepEqual(buildings().map((mesh) => mesh.instanceMatrix.array.slice(0, mesh.count * 16)), compacted);
}
for (const mesh of originalMeshes) mesh.dispose();

// Pool existe enquanto houver LEDs; trocar/remover um de vários não recompõe as luzes.
manager.updateDonationCustomization(100, { ...customization, edgeLightType: "led" });
const lights = scene.children.filter((object) => object.isPointLight);
assert.equal(lights.length, 8);
manager.updateDonationCustomization(101, { ...customization, edgeLightType: "led" });
manager.updateDonationCustomization(100, customization);
assert.deepEqual(scene.children.filter((object) => object.isPointLight), lights);
manager.updateDonationCustomization(101, customization);
assert.equal(scene.children.filter((object) => object.isPointLight).length, 0);
manager.updateDonationCustomization(100, { ...customization, edgeLightType: "led" });
assert.equal(scene.children.filter((object) => object.isPointLight).length, 8);
manager.setDonations([]);
assert.equal(scene.children.filter((object) => object.isPointLight).length, 0, "filtro deixou pool sem LED");
let batchDisposed = false;
batched.addEventListener("dispose", () => { batchDisposed = true; });
manager.dispose();
assert.ok(batchDisposed, "Dispose do manager não liberou geometria agrupada");
console.log("ok texturas — destaque, grupo, global, automática, isolamento e reutilização de meshes/cache");
console.log("ok batching — foco, troca de foco, transparência, restauração e dispose no manager real");
console.log("ok mobile — frustum por quadra, buffers estáveis, probe completo e ciclo das luzes LED");

// Composição: materiais originais, camadas distintas e picking preservado no foco.
const compositeScene = new THREE.Scene();
const composite = api.createDonationManager({
  scene: compositeScene, renderer: { capabilities: { getMaxAnisotropy: () => 4 } },
  buildingSettings: api.createDefaultBuildingSettings(), textureSettings: api.createDefaultTextureSettings(),
  blockLayoutSettings: api.createDefaultBlockLayoutSettings(), compositeFocus: true,
});
composite.setDonations([{ id: 11, value: 100 }, { id: 12, value: 50 }]);
for (const id of [11, 12]) composite.updateDonationCustomization(id, {
  ...customization, buildingShape: "empire", rooftopType: "helicopter", edgeLightType: "led",
});
const compositeBuildings = compositeScene.children.filter((mesh) => mesh.userData.donationId);
const originalMaterials = compositeBuildings.map((mesh) => mesh.material);
const originalGeometry = compositeBuildings.map((mesh) => mesh.geometry);
composite.setFocusedDonation(11);
assert(composite.hasFocusedDonation());
assert(compositeBuildings[0].layers.isEnabled(2));
assert(compositeBuildings[1].layers.isEnabled(1));
for (let i = 0; i < 2; i++) {
  assert.equal(compositeBuildings[i].material, originalMaterials[i]);
  assert.equal(compositeBuildings[i].geometry, originalGeometry[i]);
  assert(compositeBuildings[i].material.every((m) => m.opacity === 1 && !m.transparent));
}
const compositeRoofs = compositeScene.children.filter((root) => root.userData.rooftopType);
for (let i = 0; i < 2; i++) compositeRoofs[i].traverse((object) => {
  if (object.isMesh) { assert(object.layers.isEnabled(i === 0 ? 2 : 1)); assert([object.material].flat().every(m => m.opacity === 1)); }
});
const pickCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
pickCamera.position.copy(compositeBuildings[0].position).add(new THREE.Vector3(0, 0, 50));
pickCamera.lookAt(compositeBuildings[0].position); pickCamera.updateMatrixWorld(true);
compositeScene.updateMatrixWorld(true);
assert.equal(composite.getClickedDonationId({ clientX: 100, clientY: 100 }, pickCamera,
  { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) }), 11);
composite.setFocusedDonation(null);
assert(!composite.hasFocusedDonation());
assert(compositeBuildings.every((mesh) => mesh.layers.mask === 1));
composite.updateDonationCustomization(11, { ...customization, rooftopType: "helicopter" });
composite.setFocusedDonation(11);
const compositeHighlight = compositeScene.children.find((mesh) => mesh.isMesh && !mesh.isInstancedMesh
  && !mesh.userData.donationId && Array.isArray(mesh.material) && mesh.layers.isEnabled(2));
assert(compositeHighlight, "Destaque padrão ficou fora do passe selecionado");
assert.equal(compositeScene.children.filter((mesh) => mesh.isInstancedMesh && Array.isArray(mesh.material)
  && mesh.material[0].isMeshPhysicalMaterial).reduce((n, mesh) => n + mesh.count, 0), 0);
composite.updateDonationCustomization(12, { ...customization, buildingShape: "empire", rooftopType: "spotlights" });
compositeScene.children.find((root) => root.userData.rooftopType === "spotlights").traverse((object) => {
  if (object.isMesh) assert(object.layers.isEnabled(1), "Novo acessório saiu do contexto HDR");
});
composite.setDonations([{ id: 12, value: 50 }]);
assert(!composite.hasFocusedDonation());
assert(!compositeScene.children.includes(compositeHighlight), "Dataset novo deixou destaque órfão");
composite.dispose();
console.log("ok composição — aparência autoral, grupos, acessórios, camadas, seleção e restauração");

// Fluxo da gravação: cidade completa, índice compactado, levitação, pouso e poeira.
const recordingScene = new THREE.Scene();
const recording = api.createDonationManager({
  scene: recordingScene, renderer: { capabilities: { getMaxAnisotropy: () => 4 } },
  buildingSettings: api.createDefaultBuildingSettings(), textureSettings: api.createDefaultTextureSettings(),
  blockLayoutSettings: api.createDefaultBlockLayoutSettings(),
});
recording.setFacadeTexturePool(["texture/global", "texture/saved"]);
recording.setDonations(Array.from({ length: 480 }, (_, index) => ({ id: index + 1, value: 600 - index })));
assert.equal(recording.tickAnimations(0, 16), false, "lote inicial não deve animar");
const recordingId = recording.addDonation(630);
assert.equal(recordingId, 481);
assert.equal(recording.getDonationCount(), 481);
const center = recording.getDonationWorldPosition(481);
assert.equal(center.x, 0); assert.equal(center.z, 0);
const recordingResidential = recordingScene.children.find((mesh) => mesh.userData.donationId === recordingId);
assert(recordingResidential, "Residencial precisa existir antes do primeiro frame");
assert.equal(recordingResidential.material.length, 6, "modelo deve preservar pedra, sacadas, vidro, caixilho e aletas");
assert.equal(recordingResidential.material[5].color.getHex(), 0x5a2c1a, "aletas terracota identificam o Residencial com sacadas");
assert.ok(recordingResidential.geometry.getAttribute("position").count > 1000, "novo edifício não pode ser a caixa padrão");
const finalY = center.y - recordingResidential.scale.y / 2;
const renderedY = () => recordingResidential.position.y;
const entranceBounds = recording.getDonationBounds(recordingId);
assert.ok(entranceBounds.min.y <= 0 && entranceBounds.max.y >= center.y + 5,
  "enquadramento deve incluir térreo e cobertura durante levitação");
assert.equal(recording.getDonationBounds(-999), null);
assert.ok(Math.abs(renderedY() - finalY - 5) < 1e-5, "prédio deve começar levitando");
recording.updateDistanceCulling(new THREE.Vector3(0, 20, 30), new THREE.Vector3(0, 0, -1));
assert(recording.tickAnimations(0.016, 16));
assert.ok(renderedY() > finalY + 4.8, "culling apagou a animação");
recording.setFocusedDonation(recordingId);
assert(recording.hasFocusedDonation());
for (let frame = 1; frame <= 270; frame++) recording.tickAnimations(frame / 60, 1000 / 60);
assert.ok(Math.abs(renderedY() - finalY) < 1e-5, "pouso não restaurou posição final");
assert.equal(recording.tickAnimations(5, 16), false, "cena parada deve voltar ao render sob demanda");
const dust = recordingScene.children.find((object) => object.isPoints);
assert.equal(dust.visible, false, "poeira não dissipou");
assert(dust.geometry.attributes.position.array.every(Number.isFinite));
assert.equal(dust.material.map.image.data[3], 0, "poeira deve ter bordas transparentes");
let dustDisposed = false;
dust.geometry.addEventListener("dispose", () => { dustDisposed = true; });
recording.addDonation(660);
recording.setDonations([{ id: 1, value: 100 }]);
assert.equal(recording.tickAnimations(5, 16), false, "replace-all deve encerrar a entrada anterior");
recording.dispose();
assert(dustDisposed, "dispose deve liberar partículas");
assert(!recordingScene.children.includes(dust));
console.log("ok gravação — cidade completa, centro, culling, entrada, pouso, poeira, replace-all e dispose");
