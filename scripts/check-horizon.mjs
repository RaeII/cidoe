// node scripts/check-horizon.mjs — runtime real, sem servidor, navegador ou GPU.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { build } from "esbuild";

// Só as bordas de I/O são substituídas: cena, câmera, terreno e culling são reais.
const threeUrl = import.meta.resolve("three");
const mocks = {
  three: `
    import { Color, HalfFloatType } from ${JSON.stringify(threeUrl)};
    export * from ${JSON.stringify(threeUrl)};
    export class WebGLRenderer {
      constructor(options) { globalThis.horizonCheck.rendererOptions = options; }
      capabilities = { getMaxAnisotropy: () => 4, maxSamples: 4 };
      extensions = { has: () => !!globalThis.horizonCheck.supportHDR };
      target = null;
      clearColor = new Color();
      clearAlpha = 0;
      autoClear = true;
      domElement = {
        addEventListener(name, callback) { globalThis.horizonCheck.pointerListeners.set(name, callback); },
        removeEventListener(name) { globalThis.horizonCheck.pointerListeners.delete(name); },
        getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; },
      };
      debug = {};
      info = { autoReset: true, render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, programs: [], reset() { this.render.calls = 0; } };
      getContext() { return { RENDERER: 0, getExtension: () => null, getParameter: () => "headless", getContextAttributes: () => ({ antialias: false }) }; }
      getRenderTarget() { return this.target; }
      setRenderTarget(target) { this.target = target; }
      getDrawingBufferSize(value) { return value.set(589, 1102); }
      getClearAlpha() { return this.clearAlpha; }
      getClearColor(value) { return value.copy(this.clearColor); }
      setClearColor(value, alpha) { this.clearColor.set(value); this.clearAlpha = alpha; }
      clearDepth() {}
      compileAsync() { return globalThis.horizonCheck.compileGate ?? Promise.resolve(); }
      initTexture() {}
      setPixelRatio(value) { globalThis.horizonCheck.pixelRatio = value; }
      setOpaqueSort() {}
      setSize() {}
      render(scene, camera) {
        this.info.render.calls++; globalThis.horizonCheck.renders++;
        globalThis.horizonCheck.frame = { scene, camera };
        globalThis.horizonCheck.passMasks?.push(camera.layers.mask);
        if (this.target?.texture.type === HalfFloatType) globalThis.horizonCheck.contextTarget = this.target;
      }
      dispose() {}
    }
  `,
  OrbitControls: `
    import { Vector3, EventDispatcher } from ${JSON.stringify(threeUrl)};
    export class OrbitControls extends EventDispatcher {
      target = new Vector3();
      last = '';
      constructor(camera) { super(); this.camera = camera; globalThis.horizonCheck.controls = this; }
      // Real devolve true quando a câmera mexeu; o teste move a câmera por fora a cada passo.
      update() {
        this.camera.lookAt(this.target);
        const next = [...this.camera.position.toArray(), ...this.target.toArray()].join(',');
        if (next === this.last) return false;
        this.last = next; this.dispatchEvent({ type: 'change' }); return true;
      }
      dispose() {}
    }
  `,
  loadEnvironment: `
    export const loadEnvironment = () => ({
      updateSettings() {}, updatePosition() {}, setRadius() {}, setStarsVisible() {}, dispose() {}
    });
  `,
  facadeTextureLoader: `
    export const initFacadeTextureLoader = () => {};
    export const peekFacadeTextureSet = () => null;
    export const loadFacadeTextureSet = async () => null;
    export const loadFacadeNormals = async () => {};
  `,
  facadeTextureManifest: `
    export const resolveFacadeFolder = (value) => value;
    export const getFacadeMapUrls = () => null;
  `,
};
const bundle = await build({
  stdin: {
    contents: [
      "export * from './src/scene/runtime/createCitySceneRuntime.ts';",
      ...["cityScene", "building", "texture", "ground", "terrain", "light", "horizon", "environment", "reflection", "blockLayout"]
        .map((name) => `export * from './src/scene/config/${name}Config.ts';`),
    ].join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true, format: "esm", platform: "node", write: false,
  external: [threeUrl],
  define: { "import.meta.env.DEV": "false" },
  plugins: [{
    name: "headless-io",
    setup(builder) {
      builder.onResolve({ filter: /three$|OrbitControls|loadEnvironment|facadeTexture(Loader|Manifest)/ }, ({ path }) => {
        const key = path === "three" ? path : path.split("/").at(-1).replace(/\.js$/, "");
        return key in mocks ? { path: key, namespace: "headless" } : undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: "headless" }, ({ path }) => ({ contents: mocks[path] }));
    },
  }],
});
globalThis.window = { devicePixelRatio: 2.75, matchMedia: () => ({ matches: true }), addEventListener() {}, removeEventListener() {} };
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
globalThis.horizonCheck = { renders: 0, pointerListeners: new Map() };
const documentListeners = new Map();
globalThis.document = { hidden: false,
  addEventListener: (name, callback) => documentListeners.set(name, callback),
  removeEventListener: (name) => documentListeners.delete(name),
};
globalThis.IntersectionObserver = class {
  constructor(callback) { globalThis.horizonCheck.intersection = callback; }
  observe() {}
  disconnect() { globalThis.horizonCheck.disconnected = true; }
};
// Runtime nasce em etapas (await de frame): rAF roda sozinho até a criação terminar.
let autoFrames = true;
globalThis.requestAnimationFrame = (callback) => {
  globalThis.horizonCheck.nextFrame = callback;
  if (autoFrames) setTimeout(() => callback(performance.now()), 0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};
let stats;
const clicks = [];
const settings = Object.fromEntries(
  ["Building", "Texture", "Ground", "Terrain", "Light", "Horizon", "Environment", "Reflection", "BlockLayout"]
    .map((name) => [`${name[0].toLowerCase()}${name.slice(1)}Settings`, api[`createDefault${name}Settings`]()]),
);
settings.reflectionSettings.enabled = false; // Sem captura GPU; alcance do probe verificado abaixo.
const runtime = await api.createCitySceneRuntime({
  ...settings,
  mount: { clientWidth: 1920, clientHeight: 1080, appendChild() {}, contains: () => false },
  onStatsChange: (value) => { stats = value; },
  onBuildingClick: (id) => clicks.push(id),
});
assert.equal(globalThis.horizonCheck.rendererOptions.antialias, false, "Teste deve executar o modo mobile");
assert.equal(globalThis.horizonCheck.pixelRatio, 1.5, "DPR mobile foi alterado");
let time = performance.now();
// Assíncrono: compilação e fila de customização do runtime cedem a main thread (setTimeout).
const advance = async () => {
  for (let i = 0; i < 6; i++) {
    globalThis.horizonCheck.nextFrame(time += 50);
    await delay(0);
  }
};
autoFrames = false;
await delay(0);
await advance();
const { scene, camera } = globalThis.horizonCheck.frame;
runtime.addDonations(Array.from({ length: 500 }, (_, i) => i + 1));
const ground = scene.children.find((mesh) => mesh.isMesh && mesh.position.y === -0.05);
const terrain = scene.children.find((mesh) => mesh.isMesh && !mesh.isInstancedMesh && mesh.geometry.attributes.color);
const terrainPositions = terrain.geometry.attributes.position.array.slice();
const terrainColors = terrain.geometry.attributes.color.array.slice();
assert.equal(ground.geometry.attributes.position.count, 4, "Chão ganhou vértices");
assert.equal(ground.geometry.index.count, 6, "Chão deve continuar com dois triângulos");
assert(ground.position.y < Math.min(...terrainPositions.filter((_, i) => i % 3 === 1)));
assert.equal(ground.children.length, 0, "Camada cinza adicional voltou atrás das montanhas");
assert(camera.far <= 2000, "Câmera voltou a usar alcance excessivo");
const probe = scene.children.find((object) => object.type === "CubeCamera");
assert(probe.children.every((face) => face.far === 260), "Alcance do reflexo foi ampliado");

// As colinas não podem ser recortadas pelo far plane ao orbitar, aproximar ou fazer pan.
const terrainTransform = terrain.matrix.clone();
for (const [x, y, z] of [[0, 30, 200], [70, 20, 0], [0, 15, -70], [-60, 40, 60], [450, 80, 250]]) {
  camera.position.set(x, y, z);
  await advance();
  camera.updateMatrixWorld(true);
  terrain.updateMatrixWorld(true);
  assert(terrain.matrix.equals(terrainTransform), "Câmera moveu o terreno");
  assert.deepEqual(terrain.geometry.attributes.position.array, terrainPositions, "Câmera deformou as colinas");
  for (let i = 0; i < terrainPositions.length; i += 3) {
    const point = new THREE.Vector3().fromArray(terrainPositions, i)
      .applyMatrix4(terrain.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    assert(-point.z < camera.far, "Câmera corta o relevo: montanha encolhe durante o movimento");
  }
}

// Encurtar e reabrir a distância só deve mudar os prédios enviados ao render.
camera.position.set(0, 30, 200);
await advance();
const projection = camera.projectionMatrix.clone();
const counts = [];
for (const distance of [600, 100, 600]) {
  runtime.updateHorizonSettings({ ...settings.horizonSettings, distance, fogDensity: 0 });
  await advance();
  assert(camera.projectionMatrix.equals(projection), "Slider alterou a projeção da câmera");
  assert.deepEqual(terrain.geometry.attributes.position.array, terrainPositions, "Slider alterou as montanhas");
  assert.deepEqual(terrain.geometry.attributes.color.array, terrainColors, "Slider recoloriu as montanhas");
  assert(terrain.visible && ground.visible);
  counts.push({
    culled: stats.culled,
    instances: scene.children.filter((mesh) => mesh.isInstancedMesh && mesh.visible)
      .reduce((sum, mesh) => sum + mesh.count, 0),
  });
}
assert(counts[1].culled > counts[0].culled, "Distância não ocultou prédios");
// Igualdade, não ">=": o slider dos EDIFÍCIOS só pode tirar prédios. Antes ele levava junto o
// chão da cidade (lotes, calçadas, postes, asfalto) — com 100 a cidade ficava sem chão nenhum.
assert.equal(counts[0].instances - counts[1].instances, counts[1].culled - counts[0].culled,
  "Distância dos edifícios voltou a encolher o chão da cidade");
assert.deepEqual(counts[2], counts[0], "Prédios não reapareceram ao ampliar a distância");

camera.position.set(0, 30, 0);
runtime.updateHorizonSettings({ ...settings.horizonSettings, distance: 600, backDistance: 10 });
await advance();
const hiddenBehind = stats.culled;
runtime.updateHorizonSettings({ ...settings.horizonSettings, distance: 600, backDistance: 600 });
await advance();
assert(stats.culled < hiddenBehind, "Controle traseiro não restaurou os prédios");
// Os formatos compartilham material e reutilizam as duas geometrias.
const planeGeometry = ground.geometry;
let circleGeometry;
for (const groundEdgeMode of ["circular", "square", "straight", "circular", "straight"]) {
  for (const groundDistance of [40, 300, 2200]) {
    runtime.updateHorizonSettings({ ...settings.horizonSettings, groundEdgeMode, groundDistance });
    await advance();
    if (groundEdgeMode === "circular") {
      circleGeometry ??= ground.geometry;
      assert.equal(ground.geometry, circleGeometry);
      assert.equal(ground.geometry.type, "CircleGeometry");
    } else {
      assert.equal(ground.geometry, planeGeometry);
    }
    if (groundEdgeMode !== "straight") assert.equal(ground.scale.x, groundDistance * 2);
    assert(camera.far >= settings.horizonSettings.renderDistance, "Far ficou menor que o horizonte");
    assert.deepEqual(terrain.geometry.attributes.position.array, terrainPositions);
    assert(ground.visible);
  }
}

// Raios na imagem: todo ponto antes do corte reto deve ter chão; depois deve ficar vazio.
// Cobre orientação, pan, inclinação, aspecto, zoom e distância sem servidor/navegador/GPU.
const groundSurface = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05);
const raycaster = new THREE.Raycaster();
let checkedRays = 0;
for (const aspect of [9 / 16, 16 / 9, 32 / 9]) {
  for (const zoom of [0.75, 1, 2]) {
    camera.aspect = aspect;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    for (const renderDistance of [60, 600, 2000]) {
      for (const groundDistance of [20, 300, 2200]) {
        runtime.updateHorizonSettings({ ...settings.horizonSettings, renderDistance, groundDistance });
        for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 4) {
          camera.position.set(Math.sin(yaw) * 23 + 5, yaw < Math.PI ? 19 : 70, Math.cos(yaw) * 23 - 5);
          await advance();
          camera.updateMatrixWorld(true);
          ground.updateMatrixWorld(true);
          const forward = camera.getWorldDirection(new THREE.Vector3());
          forward.y = 0;
          forward.normalize();
          const edge = [-0.5, 0.5].map((x) => new THREE.Vector3(x, 0.5, 0).applyMatrix4(ground.matrixWorld));
          for (const point of edge) {
            assert(Math.abs(point.clone().sub(camera.position).dot(forward) - groundDistance) < 1e-6,
              "Distância não posicionou a borda à frente da câmera");
          }
          assert(Math.abs(edge[0].project(camera).y - edge[1].project(camera).y) < 1e-6,
            "Borda deixou de ser horizontal na tela");
          for (const x of [-0.999, -0.75, 0, 0.75, 0.999]) {
            for (const y of [-0.999, -0.75, -0.5, 0, 0.5, 0.999]) {
              raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
              const point = raycaster.ray.intersectPlane(groundSurface, new THREE.Vector3());
              if (!point) continue;
              const depth = -point.clone().applyMatrix4(camera.matrixWorldInverse).z;
              if (depth < camera.near || depth > camera.far) continue;
              const shouldHit = point.clone().sub(camera.position).dot(forward) < groundDistance;
              assert.equal(raycaster.intersectObject(ground).length > 0, shouldHit,
                `Quina/buraco: aspect=${aspect}, zoom=${zoom}, far=${renderDistance}, chão=${groundDistance}, yaw=${yaw}`);
              checkedRays++;
            }
          }
        }
      }
    }
  }
}
assert(checkedRays > 1000, "Amostragem insuficiente do frustum");
camera.aspect = 16 / 9;
camera.zoom = 1;
camera.updateProjectionMatrix();
runtime.updateHorizonSettings(settings.horizonSettings);
await advance();
// Horizonte curto não corta montanhas; slider longo ainda amplia o far.
assert.equal(terrain.material.userData.cullUniforms, undefined, "Recorte do terreno voltou a seguir a câmera");
for (const renderDistance of [60, 200, 600, 2000]) {
  runtime.updateHorizonSettings({
    ...settings.horizonSettings,
    renderDistance,
    groundDistance: renderDistance * 1.1,
  });
  await advance();
  const bounds = terrain.geometry.boundingSphere;
  assert(camera.far >= renderDistance, "Far ficou menor que o horizonte");
  assert(camera.far > camera.position.distanceTo(bounds.center) + bounds.radius, "Far corta a malha fixa");
  assert(ground.scale.x / 2 > camera.far, "Laterais do chão encolheram");
}
runtime.updateHorizonSettings({ ...settings.horizonSettings, distance: 100, backDistance: 10 });
await advance();
assert.deepEqual(terrain.geometry.attributes.position.array, terrainPositions);
runtime.updateHorizonSettings(settings.horizonSettings);
await advance();
runtime.updateGroundSettings(settings.groundSettings);
runtime.updateHorizonSettings(settings.horizonSettings);
await advance();

runtime.updateTerrainSettings({ ...settings.terrainSettings, enabled: false });
await delay(100); // Rebuild do terreno tem debounce de 60ms.
await advance();
assert(ground.visible && !terrain.visible, "Desligar montanhas removeu o chão");
assert.equal(camera.far, settings.horizonSettings.renderDistance, "Sem relevo, far não voltou ao horizonte configurado");

// Regressão Float32: triângulos de 1 milhão de unidades deformavam mais que a folga de 0.01u.
const f = Math.fround;
function floatViewPosition(vector, matrix) {
  const v = [vector.x, vector.y, vector.z, 1].map(f);
  const e = matrix.elements.map(f);
  return new THREE.Vector3(...[0, 1, 2].map((row) =>
    v.reduce((sum, n, column) => f(sum + f(n * e[column * 4 + row])), 0)));
}
ground.position.set(0, -0.05, 0);
ground.updateMatrixWorld(true);
// Três vértices distintos do plano; repetir um vértice produz normal zero e falso positivo.
const planeSample = [0, 1, 2];
let worstError = 0;
for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.03) {
  camera.position.set(Math.sin(yaw) * 23, 19, Math.cos(yaw) * 23);
  camera.lookAt(0, 9, 0);
  camera.updateMatrixWorld(true);
  const modelView = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, ground.matrixWorld);
  const points = planeSample.map((i) => floatViewPosition(
    new THREE.Vector3().fromBufferAttribute(ground.geometry.attributes.position, i), modelView));
  const roundedPlane = new THREE.Plane().setFromCoplanarPoints(...points);
  assert(roundedPlane.normal.lengthSq() > 0.99, "Amostra Float32 degenerada");
  const center = ground.position.clone().applyMatrix4(camera.matrixWorldInverse);
  worstError = Math.max(worstError, Math.abs(roundedPlane.distanceToPoint(center)));
}
assert(worstError < 0.001, `Plano invade a folga até o terreno: erro ${worstError}`);
// Foco: a câmera só interpola frames desenháveis, inclusive após compilação demorada.
await advance();
const beforeFocus = camera.position.clone();
let releaseCompile;
globalThis.horizonCheck.compileGate = new Promise((resolve) => { releaseCompile = resolve; });
runtime.focusOnDonation(1);
const beforeCompileRenders = globalThis.horizonCheck.renders;
for (let i = 0; i < 30; i++) {
  globalThis.horizonCheck.nextFrame(time += 50);
  await delay(0);
}
assert(camera.position.equals(beforeFocus), "Foco avançou a câmera enquanto shaders bloqueavam o desenho");
assert.equal(globalThis.horizonCheck.renders, beforeCompileRenders);
delete globalThis.horizonCheck.compileGate;
releaseCompile();
await delay(10);
globalThis.horizonCheck.nextFrame(time += 16.67);
const firstFocusFrame = camera.position.clone();
assert(!firstFocusFrame.equals(beforeFocus), "Câmera não retomou animação após compilar");
await advance();
assert(!camera.position.equals(firstFocusFrame), "Primeiro frame de foco já teletransportou ao destino");
for (let i = 0; i < 20; i++) globalThis.horizonCheck.nextFrame(time += 50);
runtime.focusOnDonation(2);
await advance();
globalThis.horizonCheck.controls.dispatchEvent({ type: "start" });
const interrupted = camera.position.clone();
await advance();
assert(camera.position.equals(interrupted), "Animação de foco disputou a câmera com o gesto do usuário");
runtime.clearFocus();
await advance();
for (let i = 0; i < 20; i++) globalThis.horizonCheck.nextFrame(time += 50);
assert(camera.position.distanceTo(beforeFocus) < 1e-8, "Fechar detalhes não restaurou a câmera");

// Arrastar e voltar ao início, pinçar e pointercancel não podem selecionar edifícios.
const pointer = (name, id, x = 100, isPrimary = true) =>
  globalThis.horizonCheck.pointerListeners.get(name)({ pointerId: id, clientX: x, clientY: 100, isPrimary });
pointer("pointerdown", 1); pointer("pointermove", 1, 120); pointer("pointermove", 1); pointer("pointerup", 1);
pointer("pointerdown", 1); pointer("pointerdown", 2, 140, false); pointer("pointerup", 2, 140, false); pointer("pointerup", 1);
pointer("pointerdown", 1); pointer("pointercancel", 1); pointer("pointerup", 1);
assert.equal(clicks.length, 0, "Gesto de câmera disparou clique");
pointer("pointerdown", 1); pointer("pointerup", 1);
assert.equal(clicks.length, 1, "Clique simples deixou de funcionar");
pointer("pointerup", 1);
assert.equal(clicks.length, 1, "Pointerup repetido reutilizou clique anterior");

// Ocioso não desenha; movimento acompanha cada rAF mobile, inclusive telas de 90/120 Hz.
await advance();
const beforeIdle = globalThis.horizonCheck.renders;
for (let i = 0; i < 120; i++) globalThis.horizonCheck.nextFrame(time += 1000 / 120);
assert.equal(globalThis.horizonCheck.renders, beforeIdle, "Cena parada repetiu renders");
// Entrada precisa manter o runtime desenhando mesmo com câmera parada.
const beforeRecording = camera.position.clone();
const beforeRecordingTarget = globalThis.horizonCheck.controls.target.clone();
runtime.addDonation(750);
const recordingBuilding = scene.children.find((mesh) => mesh.userData.donationValue === 750);
assert(recordingBuilding && recordingBuilding.material.length === 6, "Gravação deve criar Residencial com sacadas");
const recordingBounds = new THREE.Box3().setFromObject(recordingBuilding);
recordingBounds.min.y = 0;
recordingBounds.max.y += 0.15;
await advance();
assert(!camera.position.equals(beforeRecording), "Novo edifício não iniciou aproximação da câmera");
assert.equal(recordingBuilding.material[0].opacity, 1, "Edifício novo deve manter destaque opaco");
assert(scene.children.some((mesh) => mesh.isInstancedMesh && Array.isArray(mesh.material)
  && mesh.material[0].opacity === 0.15), "Cidade deve esmaecer para destacar o novo edifício");
const beforeEntrance = globalThis.horizonCheck.renders;
for (let i = 0; i < 20; i++) globalThis.horizonCheck.nextFrame(time += 1000 / 60);
assert.equal(globalThis.horizonCheck.renders - beforeEntrance, 20, "Runtime congelou a entrada sem movimento de câmera");
for (let i = 0; i < 240; i++) globalThis.horizonCheck.nextFrame(time += 1000 / 60);
const afterEntrance = globalThis.horizonCheck.renders;
for (let i = 0; i < 120; i++) globalThis.horizonCheck.nextFrame(time += 1000 / 60);
assert.equal(globalThis.horizonCheck.renders, afterEntrance, "Pouso/poeira não devolveram runtime ao repouso");
const assertFramed = (bounds) => {
  camera.updateMatrixWorld();
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const projected = new THREE.Vector3(x, y, z).project(camera);
    assert(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1,
      "Enquadramento cortou térreo, sacadas ou cobertura da animação");
  }
  assert(camera.position.distanceTo(globalThis.horizonCheck.controls.target) <= globalThis.horizonCheck.controls.maxDistance + 1e-8,
    "Limite do OrbitControls cortaria o enquadramento");
};
assertFramed(recordingBounds);
assert(camera.position.x > recordingBuilding.position.x && camera.position.z > recordingBuilding.position.z,
  "Câmera deve mostrar frente e lateral das sacadas");
runtime.clearFocus();
await advance();
for (let i = 0; i < 20; i++) globalThis.horizonCheck.nextFrame(time += 50);
assert(camera.position.distanceTo(beforeRecording) < 1e-8, "Fechar destaque não restaurou câmera da gravação");
assert(globalThis.horizonCheck.controls.target.distanceTo(beforeRecordingTarget) < 1e-8);
assert.equal(globalThis.horizonCheck.controls.maxDistance, api.CITY_SCENE_CONFIG.controls.maxDistance);
// O mesmo plano deve caber em vídeo vertical, sem ser truncado pelo limite de órbita.
const recordingAspect = camera.aspect;
const recordingZoom = camera.zoom;
camera.aspect = 9 / 16;
camera.zoom = 2;
camera.updateProjectionMatrix();
runtime.addDonation(780);
const portraitBuilding = scene.children.find((mesh) => mesh.userData.donationValue === 780);
const portraitBounds = new THREE.Box3().setFromObject(portraitBuilding);
portraitBounds.min.y = 0; portraitBounds.max.y += 0.15;
await advance();
for (let i = 0; i < 270; i++) globalThis.horizonCheck.nextFrame(time += 1000 / 60);
assertFramed(portraitBounds);
assert(globalThis.horizonCheck.controls.maxDistance > api.CITY_SCENE_CONFIG.controls.maxDistance,
  "Vídeo vertical com zoom precisa ampliar distância da órbita");
camera.aspect = recordingAspect;
camera.zoom = recordingZoom;
camera.updateProjectionMatrix();
runtime.clearFocus();
await advance();
for (let i = 0; i < 20; i++) globalThis.horizonCheck.nextFrame(time += 50);
assert.equal(globalThis.horizonCheck.controls.maxDistance, api.CITY_SCENE_CONFIG.controls.maxDistance);
const angles = [];
for (const fps of [30, 60, 90, 120]) {
  const inertialCamera = new THREE.PerspectiveCamera();
  inertialCamera.position.set(0, 0, 10);
  const orbit = new OrbitControls(inertialCamera);
  orbit.enableDamping = true;
  orbit._rotateLeft(0.8); // Impulso de rotação sem DOM; fator vem do runtime real.
  const before = globalThis.horizonCheck.renders;
  for (let i = 0; i < fps; i++) {
    camera.position.x += 0.001;
    globalThis.horizonCheck.nextFrame(time += 1000 / fps);
    orbit.dampingFactor = globalThis.horizonCheck.controls.dampingFactor;
    orbit.update();
  }
  assert.equal(globalThis.horizonCheck.renders - before, fps, `Limitador descartou frames mobile a ${fps} Hz`);
  assert(Math.abs(inertialCamera.position.length() - 10) < 1e-10, "Damping alterou a distância da câmera");
  angles.push(orbit.getAzimuthalAngle());
}
assert(Math.abs(angles[0] - (-0.8 * (1 - 0.94 ** 60))) < 1e-10, "Inércia mudou em relação à referência de 60 Hz");
assert(angles.every(angle => Math.abs(angle - angles[0]) < 1e-10), "Inércia depende do FPS");
// Intervalos reais de 100 ms devem resultar em 10 FPS, sem o clamp de animação (50 ms).
for (let i = 0; i < 14; i++) {
  camera.position.x += 0.1;
  globalThis.horizonCheck.nextFrame(time += 100);
  await delay(0);
}
assert(Math.abs(stats.performance.fps - 10) < 0.01, `FPS mascarou a lentidão: ${stats.performance.fps}`);
assert.equal(stats.performance.frameTimeMs, 100);
assert.equal(stats.performance.drawCalls, 1);
const beforeHidden = globalThis.horizonCheck.renders;
document.hidden = true;
documentListeners.get("visibilitychange")();
globalThis.horizonCheck.nextFrame(time += 5000);
assert.equal(globalThis.horizonCheck.renders, beforeHidden, "aba oculta desenhou");
document.hidden = false;
documentListeners.get("visibilitychange")();
await advance();
assert(globalThis.horizonCheck.renders > beforeHidden, "retorno à aba não redesenhou");
globalThis.horizonCheck.intersection([{ isIntersecting: false }]);
const beforeOffscreen = globalThis.horizonCheck.renders;
globalThis.horizonCheck.nextFrame(time += 5000);
assert.equal(globalThis.horizonCheck.renders, beforeOffscreen, "canvas fora da tela desenhou");
globalThis.horizonCheck.intersection([{ isIntersecting: true }]);
await advance();
assert(globalThis.horizonCheck.renders > beforeOffscreen, "canvas não retomou");
const resources = [planeGeometry, circleGeometry, ground.material];
let disposed = 0;
resources.forEach((resource) => resource.addEventListener("dispose", () => { disposed++; }));
runtime.dispose();
assert.equal(disposed, resources.length);
assert.equal(documentListeners.size, 0);
assert.equal(globalThis.horizonCheck.pointerListeners.size, 0);
assert(globalThis.horizonCheck.disconnected);

// Integração do caminho HDR com runtime, manager e compositor reais; só WebGL é simulado.
globalThis.horizonCheck.supportHDR = true;
autoFrames = true;
const compositeRuntime = await api.createCitySceneRuntime({
  ...settings,
  mount: { clientWidth: 393, clientHeight: 735, appendChild() {}, contains: () => false },
  onStatsChange: (value) => { stats = value; },
});
autoFrames = false; await delay(0); await advance();
compositeRuntime.setDonations([{ id: 11, value: 100 }, { id: 12, value: 50 }]);
await advance();
globalThis.horizonCheck.passMasks = [];
compositeRuntime.focusOnDonation(11);
await advance();
assert.deepEqual(globalThis.horizonCheck.passMasks.slice(0, 4), [2, 1, 1, 4], "Runtime não separou os passes de foco");
assert.equal(globalThis.horizonCheck.frame.camera.layers.mask, 7, "Compositor vazou máscara da câmera");
assert.equal(globalThis.horizonCheck.contextTarget.texture.type, THREE.HalfFloatType);
assert.equal(globalThis.horizonCheck.contextTarget.width, 589);
assert.equal(globalThis.horizonCheck.contextTarget.height, 1102);
globalThis.horizonCheck.passMasks = [];
compositeRuntime.clearFocus(); await advance();
assert(globalThis.horizonCheck.passMasks.length > 0);
assert(globalThis.horizonCheck.passMasks.every((mask) => mask === 7), "Fechar foco não retomou render normal");
compositeRuntime.dispose();
assert.equal(documentListeners.size, 0);
assert.equal(globalThis.horizonCheck.pointerListeners.size, 0);
console.log(`Raios verificados: ${checkedRays}`);
console.log("Horizonte OK: modos reto/circular/quadrado, sem fundo cinza adicional, precisão Float32, montanhas, culling, reflexos e dispose.");
console.log("Mobile OK: rAF a 30/60/90/120 Hz, inércia por tempo real, DPR, repouso, FPS real e suspensão/retomada.");
console.log("Foco HDR OK: integração runtime/manager/compositor, tamanho, camadas e retorno ao render normal.");
