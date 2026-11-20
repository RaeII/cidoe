/**
 * Telão de LED: posição contra a geometria REAL de cada formato (raycast), ciclo de
 * imagens, foco, noite e descarte. Sem navegador, servidor ou GPU.
 *
 * Uso: node scripts/check-led-screen.mjs
 */
import assert from "node:assert/strict";
import * as THREE from "three";
import { build } from "esbuild";

// DOM mínimo: canvas da textura (64×64) e <img> do ImageLoader, que nunca carrega aqui.
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }),
  }),
  createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(_) {} }),
};

const bundle = await build({
  stdin: {
    contents: ["createLedScreenMesh", "createBuildingShapeMesh", "createSignMesh", "createResidentialBuildingMesh",
      "createApartmentBuildingMesh", "createGourmetBuildingMesh", "createLoftBuildingMesh", "createYachthouseBuildingMesh"]
      .map((name) => `export * from './src/scene/builders/${name}.ts';`).join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true, format: "esm", platform: "node", write: false,
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const { BUILDING_SHAPES, createBuildingShapeMesh, createUnitBuildingGeometry, computeLedScreenPlacement,
  createLedScreenMesh, tickLedScreen, setLedScreenOpacity, setLedScreenNight, disposeLedScreenMesh,
  getSignBand, getYachthouseTowerFootprints, LED_SCREEN_SLIDE_SECONDS, LED_SCREEN_FADE_SECONDS } = api;

// Mesmo setter que o manager chama no sync: nº de andares pela altura.
const HEIGHT_SETTERS = {
  residential: api.setResidentialBuildingHeight,
  apartment: api.setApartmentBuildingHeight,
  gourmet: api.setGourmetBuildingHeight,
  loft: api.setLoftBuildingHeight,
  yachthouse: api.setYachthouseBuildingHeight,
};
const SIDES = ["front", "right", "back", "left"];
// Lotes da cena: base urbana 1,0–2,6; torre central até ~3; altura 0,5–30.
const LOTS = [[2, 2, 4], [1.2, 2.4, 8], [2.6, 1.4, 16], [1.6, 1.6, 1.2], [2, 2, 0.6], [3, 3, 28]];

const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const direction = new THREE.Vector3();
let placed = 0;
let skipped = 0;
for (const shape of BUILDING_SHAPES) {
  for (const [width, depth, height] of LOTS) {
    const material = new THREE.MeshStandardMaterial();
    const building = createBuildingShapeMesh(shape, material, material, createUnitBuildingGeometry());
    building.scale.set(width, height, depth);
    HEIGHT_SETTERS[shape]?.(building, height);
    building.position.y = height / 2;
    building.updateMatrixWorld(true);
    // Faixa do letreiro (base = 0): telão nunca invade, com ou sem letreiro.
    const [tower] = getYachthouseTowerFootprints(width, depth, height);
    const band = shape === "yachthouse"
      ? getSignBand("default", tower.tiers[0].width, tower.tiers[0].depth, tower.tiers[0].topY)
      : getSignBand(shape, width, depth, height);
    const signBottom = (shape === "yachthouse" ? tower.tiers[0].topY / 2 : height / 2) + band.centerY - band.height / 2;

    for (const side of SIDES) {
      const label = `${shape} ${width}×${depth}×${height} ${side}`;
      const placement = computeLedScreenPlacement({ width, depth, height, side, shape });
      // Prédio médio ou maior sempre ganha telão; o muito baixo pode não ter fachada livre.
      if (!placement) {
        assert.ok(height < 1.5, `${label}: sem telão`);
        skipped++;
        continue;
      }
      placed++;
      const { size, centerY, normal, tangent, centerT, faceDist } = placement;
      assert.ok(size >= 0.16 - 1e-9 && size <= Math.max(width, depth), `${label}: lado ${size}`);
      assert.ok(centerY - size / 2 >= 0, `${label}: telão abaixo do chão`);
      assert.ok(centerY + size / 2 <= height + 1e-6, `${label}: telão acima do topo`);
      if (height >= 1.5) assert.ok(centerY + size / 2 <= signBottom + 1e-6, `${label}: invade o letreiro`);

      // Entre o fundo do gabinete e a frente, nada do prédio: raio vem de fora até o plano
      // de trás do gabinete em 7×7 pontos da área dele (cantos inclusos).
      const back = faceDist + 0.012;
      direction.set(-normal.x, 0, -normal.z);
      let nearest = Infinity;
      for (let i = 0; i <= 6; i++) {
        for (let j = 0; j <= 6; j++) {
          const u = centerT + (i / 6 - 0.5) * size * 0.999;
          const y = centerY + (j / 6 - 0.5) * size * 0.999;
          origin.set(normal.x * (back + 5) + tangent.x * u, y, normal.z * (back + 5) + tangent.z * u);
          raycaster.set(origin, direction);
          const hit = raycaster.intersectObject(building)[0];
          if (!hit) continue;
          assert.ok(hit.distance >= 5 - 1e-4, `${label}: prédio atravessa o telão (${(5 - hit.distance).toFixed(4)} à frente, u=${u.toFixed(2)} y=${y.toFixed(2)})`);
          if (i === 3 && j === 3) nearest = hit.distance - 5;
        }
      }
      // Rente à parede: o centro tem fachada atrás, perto (torre afunilada deixa a maior folga).
      assert.ok(nearest < 0.25 * Math.max(width, depth), `${label}: telão solto da parede (${nearest})`);
    }
  }
}
assert.ok(placed > BUILDING_SHAPES.length * LOTS.length * SIDES.length * 0.85, `poucos telões: ${placed}`);
console.log(`Telão: ${placed} posições sem atravessar a geometria real, rentes à parede e abaixo do letreiro (${skipped} prédios baixos sem fachada livre).`);

// Gabinete com braços até a parede, painel à frente e clarão atrás; yaw da fachada.
const tapered = createLedScreenMesh({ width: 2, depth: 2, height: 12, side: "right", shape: "tapered", imageUrls: ["a.webp", "b.webp", "c.webp"] });
assert.ok(tapered, "afunilado sem telão");
const mount = tapered.group.children[0];
assert.ok(Math.abs(mount.rotation.y - Math.PI / 2) < 1e-9, "direita: painel não olha +X");
assert.equal(tapered.frame.geometry.index.count > 36, true, "afunilado: gabinete sem braços até a parede");
assert.ok(tapered.face.position.z > tapered.spill.position.z, "painel atrás do clarão");
assert.equal(new Set(tapered.textures).size, 3);

// Mesma imagem = mesma textura na cidade toda.
const other = createLedScreenMesh({ width: 1.5, depth: 1.5, height: 6, side: "front", shape: "default", imageUrls: ["b.webp"] });
assert.equal(other.textures[0], tapered.textures[1], "textura duplicada por telão");
assert.equal(createLedScreenMesh({ width: 2, depth: 2, height: 6, side: "front", shape: "default", imageUrls: [] }), null);

// Ciclo: relógio global, troca em cascata no começo de cada imagem, parado no resto.
const T = LED_SCREEN_SLIDE_SECONDS;
assert.equal(tickLedScreen(other, 3), false, "1 imagem não anima");
assert.equal(tickLedScreen(tapered, T * 4 + 0.1), true);
assert.equal(tapered.material.uniforms.uMapA.value, tapered.textures[0]);
assert.equal(tapered.material.uniforms.uMapB.value, tapered.textures[1]);
assert.ok(tapered.material.uniforms.uMix.value > 0 && tapered.material.uniforms.uMix.value < 1);
assert.equal(tickLedScreen(tapered, T * 4 + LED_SCREEN_FADE_SECONDS + 1), true, "fim da cascata não desenhou");
assert.equal(tapered.material.uniforms.uMix.value, 1);
assert.equal(tickLedScreen(tapered, T * 4 + LED_SCREEN_FADE_SECONDS + 2), false, "imagem parada pediu frame");
assert.equal(tickLedScreen(tapered, T * 5 + 0.2), true);
assert.equal(tapered.material.uniforms.uMapB.value, tapered.textures[2]);
tickLedScreen(tapered, T * 6 + 0.2);
assert.equal(tapered.material.uniforms.uMapB.value, tapered.textures[0], "ciclo não volta ao começo");

// Foco sem composição e noite.
setLedScreenOpacity(tapered, 0.15);
assert.ok(tapered.material.transparent && !tapered.material.depthWrite);
setLedScreenOpacity(tapered, 1);
assert.ok(!tapered.material.transparent && tapered.material.depthWrite);
setLedScreenNight([tapered, other], true);
assert.ok(tapered.spill.visible && other.spill.visible && tapered.material.uniforms.uDaylight.value === 0);
const lateNight = createLedScreenMesh({ width: 2, depth: 2, height: 6, side: "back", shape: "default", imageUrls: ["a.webp"] });
assert.ok(lateNight.spill.visible, "telão criado de noite sem clarão");
setLedScreenNight([tapered, other, lateNight], false);
assert.ok(!lateNight.spill.visible && other.material.uniforms.uDaylight.value === 1);

// Descarte: só o que é do telão; textura e plano seguem pros outros.
let textureDisposed = false;
tapered.textures[1].addEventListener("dispose", () => { textureDisposed = true; });
disposeLedScreenMesh(tapered);
assert.equal(textureDisposed, false, "descarte do telão levou a textura compartilhada");
console.log("Telão: braços, yaw, textura única por imagem, ciclo global, foco, noite e descarte OK.");

// Manager real: pedido do painel → telão na cena, troca de lado, key sem arquivo, ciclo,
// reflexo, culling, foco sem composição, noite, filtro e descarte.
const threeUrl = import.meta.resolve("three");
const managerBundle = await build({
  stdin: {
    contents: ["export * from './src/scene/managers/createDonationManager.ts';",
      ...["building", "texture", "blockLayout"].map((name) => `export * from './src/scene/config/${name}Config.ts';`)].join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true, format: "esm", platform: "node", write: false,
  external: [threeUrl],
  define: { "import.meta.env.DEV": "false" },
  plugins: [{ name: "texture-io", setup(builder) {
    builder.onResolve({ filter: /^three$/ }, () => ({ path: threeUrl, external: true }));
    builder.onResolve({ filter: /facadeTexture(Loader|Manifest)$|screenImageManifest$/ }, ({ path }) => ({ path, namespace: "texture-io" }));
    builder.onLoad({ filter: /.*/, namespace: "texture-io" }, ({ path }) => ({
      contents: path.endsWith("screenImageManifest")
        ? `export const getScreenImageUrl = (key) => key === "sem-arquivo" ? null : "/" + key + ".webp";`
        : path.endsWith("Manifest")
          ? `export const resolveFacadeFolder = (value) => value ?? ''; export const getFacadeMapUrls = () => ({});`
          : `export const initFacadeTextureLoader = () => {}; export const peekFacadeTextureSet = () => null;
             export const loadFacadeTextureSet = async () => null; export const loadFacadeNormals = async () => {};`,
    }));
  } }],
});
const managerApi = await import(`data:text/javascript;base64,${Buffer.from(managerBundle.outputFiles[0].contents).toString("base64")}`);
const scene = new THREE.Scene();
const manager = managerApi.createDonationManager({
  scene,
  renderer: { capabilities: { getMaxAnisotropy: () => 4 } },
  buildingSettings: managerApi.createDefaultBuildingSettings(),
  textureSettings: managerApi.createDefaultTextureSettings(),
  blockLayoutSettings: managerApi.createDefaultBlockLayoutSettings(),
});
manager.setDonations([{ id: 1, value: 100 }, { id: 2, value: 50 }]);
const base = {
  color: "#d4d4d4", buildingShape: "default", textureKey: null, tilingScale: 1,
  textureTransform: { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }, rooftopType: "none",
  signText: "", signSides: 1, edgeLightType: "none", hologramImage: null, hologramColor: "#73f2ff",
  hologramOpacity: 0.78, screenSide: "front", screenImages: [],
};
const screens = () => scene.children.filter((object) => object.name === "ledScreen");
const faceOf = (group) => group.getObjectByName("ledScreenFace");

manager.updateDonationCustomization(1, { ...base, screenSide: "right", screenImages: ["a"] });
assert.equal(screens().length, 1, "pedido do painel não virou telão");
const first = screens()[0];
assert.ok(Math.abs(first.children[0].rotation.y - Math.PI / 2) < 1e-9);
assert.ok(Math.abs(manager.getScreenYaw(1) - Math.PI / 2) < 1e-9);
// Edifício nasce no chão (y = 0) e o telão fica na base dele, abaixo do topo.
assert.ok(Math.abs(first.position.y) < 1e-9 && manager.getDonationWorldPosition(1).y > 0, "telão fora da base do edifício");

manager.updateDonationCustomization(1, { ...base, screenSide: "back", screenImages: ["a"] });
assert.equal(screens().length, 1, "troca de lado deixou telão velho");
assert.ok(!scene.children.includes(first));
assert.ok(Math.abs(manager.getScreenYaw(1) - Math.PI) < 1e-9);

// Dado salvo sem os campos novos (antes do telão) e key sem arquivo: sem telão, sem erro.
const { screenSide: _side, screenImages: _images, ...legacy } = base;
manager.updateDonationCustomization(2, legacy);
manager.updateDonationCustomization(2, { ...base, screenImages: ["sem-arquivo"] });
assert.equal(screens().length, 1);
assert.equal(manager.getScreenYaw(2), null);
manager.updateDonationCustomization(2, { ...base, screenSide: "invalido", screenImages: ["b", "sem-arquivo", "c", "d", "e", "f"] });
assert.equal(screens().length, 2);
assert.equal(manager.getScreenYaw(2), 0, "lado inválido não virou frente");

// Ciclo: 4 imagens válidas (teto), troca só no começo de cada uma.
assert.equal(manager.tickAnimations(T * 9 + 0.1, 16), true);
assert.equal(manager.tickAnimations(T * 9 + 3, 16), true, "fim da cascata não desenhou");
assert.equal(manager.tickAnimations(T * 9 + 4, 16), false, "telão parado pediu frame");
const cycled = new Set();
for (let slide = 10; slide < 18; slide++) {
  manager.tickAnimations(T * slide + 3, 16);
  for (const group of screens()) cycled.add(faceOf(group).material.uniforms.uMapB.value);
}
assert.equal(cycled.size, 5, "teto de 4 imagens ou key sem arquivo errados (1 do telão 1 + 4 do telão 2)");

// Reflexo: fora da captura, de volta depois.
manager.beginEnvCapture(true, new THREE.Vector3());
assert.ok(screens().every((group) => !group.visible), "telão entrou no reflexo");
manager.endEnvCapture();
assert.ok(screens().every((group) => group.visible));

// Culling: some além de 80u, como os outros acessórios.
manager.updateDistanceCulling(new THREE.Vector3(500, 10, 500), new THREE.Vector3(0, 0, -1));
assert.ok(screens().every((group) => !group.visible));
manager.updateDistanceCulling(manager.getDonationWorldPosition(1).add(new THREE.Vector3(0, 0, 12)), new THREE.Vector3(0, 0, -1));
assert.ok(screens().every((group) => group.visible));

// Foco sem composição: vizinho esmaece (gabinete por clone, painel por uniform) e volta.
const neighbor = screens().find((group) => group !== screens().find((g) => Math.abs(g.children[0].rotation.y - Math.PI) < 1e-9));
const frameMaterial = neighbor.getObjectByName("ledScreenFrame").material;
manager.setFocusedDonation(1);
assert.equal(faceOf(neighbor).material.uniforms.uOpacity.value, 0.15);
assert.notEqual(neighbor.getObjectByName("ledScreenFrame").material, frameMaterial);
const focused = screens().find((group) => group !== neighbor);
assert.equal(faceOf(focused).material.uniforms.uOpacity.value, 1);
manager.setFocusedDonation(null);
assert.equal(faceOf(neighbor).material.uniforms.uOpacity.value, 1);
assert.equal(neighbor.getObjectByName("ledScreenFrame").material, frameMaterial);

// Noite liga o clarão; rebuild (altura nova) recria e mantém o pedido.
manager.setNight(true, 1);
assert.ok(screens().every((group) => group.getObjectByName("ledScreenSpill").visible));
manager.addDonation(500);
assert.equal(screens().length, 2, "rebuild perdeu o telão");
assert.ok(screens().every((group) => group.getObjectByName("ledScreenSpill").visible));
manager.setNight(false, 0);

// Filtro tira o edifício 1: telão dele sai; descarte final limpa tudo.
manager.setDonations([{ id: 2, value: 50 }]);
assert.equal(screens().length, 1);
assert.equal(manager.getScreenYaw(1), null);
manager.updateDonationCustomization(2, { ...base, screenImages: [] });
assert.equal(screens().length, 0, "remover telão deixou o grupo");
manager.updateDonationCustomization(2, { ...base, screenImages: ["a"] });
manager.dispose();
assert.equal(screens().length, 0);
console.log("Telão no manager: pedido, lado, dado legado, teto, ciclo, reflexo, culling, foco, noite, rebuild, filtro e descarte OK.");
