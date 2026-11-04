// node scripts/check-mobile-performance.mjs — recursos reais do Three, I/O simulado; sem navegador/GPU.
import assert from "node:assert/strict";
import * as THREE from "three";
import { build } from "esbuild";

const threeUrl = import.meta.resolve("three");
async function bundleModules(paths, io = {}) {
  const result = await build({
    stdin: { contents: paths.map((path) => `export * from './${path}';`).join("\n"), resolveDir: process.cwd() },
    bundle: true, format: "esm", platform: "node", write: false,
    external: [threeUrl],
    define: { "import.meta.env.BASE_URL": '"/"', "import.meta.env.DEV": "true" },
    plugins: [{ name: "io", setup(builder) {
      builder.onResolve({ filter: /^three$/ }, () => ({ path: threeUrl, external: true }));
      builder.onResolve({ filter: /facadeTextureManifest$|loadImageTexture$/ }, ({ path }) => {
        const key = path.split("/").at(-1);
        if (io[key]) return { path: key, namespace: "io" };
      });
      builder.onLoad({ filter: /.*/, namespace: "io" }, ({ path }) => ({ contents: io[path] }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
const api = await bundleModules([
  "src/scene/utils/instanceCulling.ts",
  "src/scene/builders/createHologramMesh.ts",
  "src/scene/runtime/createScenePreparer.ts",
  "src/scene/runtime/createFocusRenderer.ts",
  "src/scene/builders/createResidentialBuildingMesh.ts",
]);

// Um mesmo grupo mantém alinhadas peças de tamanhos diferentes (poste + halo).
const meshes = [1, 6].map((size) => new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial(), 5));
for (const mesh of meshes) for (let i = 0; i < 5; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 10, 0, 0));
const original = meshes.map((mesh) => mesh.instanceMatrix.array.slice());
const group = api.snapshotInstances(meshes, 5);
api.cullInstances(group, (x) => x >= 20);
assert.equal(meshes[0].count, 3);
for (const mesh of meshes) {
  assert.deepEqual(Array.from(mesh.instanceMatrix.array.slice(0, 48)), Array.from(original[0].slice(32, 80)));
  assert.deepEqual(mesh.instanceMatrix.updateRanges, [{ start: 0, count: 48 }]);
}
const versions = meshes.map((mesh) => mesh.instanceMatrix.version);
api.cullInstances(group, (x) => x >= 20);
assert.deepEqual(meshes.map((mesh) => mesh.instanceMatrix.version), versions, "cull idêntico reenviou matrizes");
api.cullInstances(group, () => false);
assert.equal(meshes[0].count, 0);
api.restoreInstances(group);
for (let i = 0; i < meshes.length; i++) assert.deepEqual(meshes[i].instanceMatrix.array, original[i]);
const restoredVersion = meshes[0].instanceMatrix.version;
api.restoreInstances(group);
assert.equal(meshes[0].instanceMatrix.version, restoredVersion);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();
const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
api.cullInstances(group, () => true, frustum);
assert(meshes[0].count < 5 && meshes[0].count > 0);
assert.equal(meshes[0].count, meshes[1].count);
api.restoreInstances(group);
for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
console.log("ok buffers — estabilidade, upload parcial, zero visíveis, restauração e limites compartilhados");

// Preparo evita repetir shader/upload; mudança de material/luzes/instancing invalida.
const scene = new THREE.Scene();
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshStandardMaterial();
material.map = new THREE.Texture({ width: 8, height: 8 });
material.map.needsUpdate = true;
const first = new THREE.Mesh(geometry, material);
const second = new THREE.Mesh(geometry, material);
scene.add(first, second, new THREE.AmbientLight());
let compiled = 0, uploads = 0, target = null;
const renderer = {
  getRenderTarget: () => target, setRenderTarget: (next) => { target = next; },
  compileAsync(batch, _camera, lighting) {
    batch.traverse((object) => { assert(object.isMesh); compiled++; });
    lighting.traverseVisible((object) => assert(object.isLight, "preparo percorreu geometria ao coletar luzes"));
    assert.equal(lighting.environment, scene.environment);
    return Promise.resolve();
  },
  initTexture() { uploads++; },
};
const preparer = api.createScenePreparer(renderer, scene);
const prepare = () => preparer.prepare(camera, null, camera, () => false);
await prepare();
assert.equal(compiled, 1); assert.equal(uploads, 1);
const lightingHook = material.onBeforeCompile;
const lightingKey = material.customProgramCacheKey();
const shader = { fragmentShader: "#include <lights_fragment_begin>" };
lightingHook.call(material, shader, renderer);
const pointBlock = shader.fragmentShader.slice(
  shader.fragmentShader.indexOf("#if ( NUM_POINT_LIGHTS > 0 )"), shader.fragmentShader.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )"));
assert(pointBlock.includes("if ( pointLights[ i ].color == vec3( 0.0 ) ) break;"), "Loop de point lights não para na 1ª apagada");
assert(!pointBlock.includes("unroll_loop"), "Loop de point lights voltou a ser desenrolado");
assert.equal((pointBlock.match(/if \( directLight.visible \) RE_Direct\(/g) ?? []).length, 1, "BRDF continuou calculando luz de contribuição zero");
await prepare();
assert.equal(compiled, 1); assert.equal(uploads, 1);
assert.equal(material.onBeforeCompile, lightingHook, "Preparo empilhou hooks de shader");
assert.equal(material.customProgramCacheKey(), lightingKey);
material.color.set("red");
await prepare(); assert.equal(compiled, 1);
material.needsUpdate = true;
await prepare(); assert.equal(compiled, 2);
const light = new THREE.PointLight(); scene.add(light);
await prepare(); assert.equal(compiled, 3);
scene.remove(light);
await prepare(); assert.equal(compiled, 4);
material.map.needsUpdate = true;
await prepare(); assert.equal(compiled, 4); assert.equal(uploads, 2);
const instance = new THREE.InstancedMesh(geometry, material, 1); scene.add(instance);
await prepare(); assert.equal(compiled, 5);
instance.setColorAt(0, new THREE.Color("blue"));
await prepare(); assert.equal(compiled, 6);
const cube = new THREE.WebGLCubeRenderTarget(16);
await preparer.prepare(camera, cube, camera, () => false);
assert.equal(compiled, 10, "variantes tela e cube não foram preparadas");
assert.equal(target, null);
cube.dispose(); instance.dispose(); geometry.dispose(); material.map.dispose(); material.dispose();
console.log("ok shaders — deduplicação, cache, mudanças de luz/material/instância e captura");

// Clones de acessórios herdam hook/chave; o preparo não cria outra variante idêntica.
const lightingScene = new THREE.Scene();
const source = new THREE.MeshStandardMaterial();
let customHookCalls = 0;
source.onBeforeCompile = (shader) => { customHookCalls++; shader.fragmentShader += "\n// custom"; };
source.customProgramCacheKey = () => "custom-lighting";
lightingScene.add(new THREE.Mesh(new THREE.BoxGeometry(), source));
const lightingPreparer = api.createScenePreparer(renderer, lightingScene);
await lightingPreparer.prepare(camera, null, camera, () => false);
const inherited = source.clone();
inherited.onBeforeCompile = source.onBeforeCompile;
inherited.customProgramCacheKey = source.customProgramCacheKey;
const inheritedHook = inherited.onBeforeCompile;
lightingScene.add(new THREE.Mesh(lightingScene.children[0].geometry, inherited));
await lightingPreparer.prepare(camera, null, camera, () => false);
assert.equal(inherited.onBeforeCompile, inheritedHook);
assert.equal(inherited.customProgramCacheKey(), "custom-lighting:skip-inactive-point-lights");
const customShader = { fragmentShader: "#include <lights_fragment_begin>" };
inherited.onBeforeCompile.call(inherited, customShader, renderer);
assert.equal(customHookCalls, 1, "Hook autoral foi perdido");
assert(customShader.fragmentShader.includes("// custom"));
lightingScene.children[0].geometry.dispose(); source.dispose(); inherited.dispose();
console.log("ok iluminação — contribuição zero, hooks autorais, chave de cache e clones compartilhados");

// Foco em conjunto: HDR, passes separados, resize e restauração mesmo com falha.
const focusScene = new THREE.Scene();
focusScene.background = new THREE.Color("#345678");
const focusCamera = new THREE.PerspectiveCamera(); focusCamera.layers.enableAll();
const focusLight = new THREE.AmbientLight(); focusScene.add(focusLight);
const passes = [];
let focusTarget = null, clearAlpha = 0.4, autoClear = true;
const savedClearColor = new THREE.Color("#123456"), focusClearColor = savedClearColor.clone();
const focusRenderer = {
  extensions: { has: () => true },
  capabilities: { maxSamples: 4 },
  getContext: () => ({ getContextAttributes: () => ({ antialias: false }) }),
  get autoClear() { return autoClear; }, set autoClear(value) { autoClear = value; },
  getRenderTarget: () => focusTarget, setRenderTarget: (value) => { focusTarget = value; },
  getDrawingBufferSize: (value) => value.set(589, 1102),
  getClearAlpha: () => clearAlpha, getClearColor: (value) => value.copy(focusClearColor),
  setClearColor(value, alpha) { focusClearColor.set(value); clearAlpha = alpha; },
  clearDepth() { passes.push({ clearDepth: true }); },
  render(scene, camera) { passes.push({ scene, camera, mask: camera.layers.mask, target: focusTarget, lightMask: focusLight.layers.mask }); },
};
const focusPass = api.createFocusRenderer(focusRenderer, focusScene, focusCamera);
const savedMask = focusCamera.layers.mask, savedBackground = focusScene.background;
focusPass.render(true);
assert.equal(passes.length, 5);
assert.equal(passes[0].mask, 2); assert.equal(passes[1].mask, 1); assert.equal(passes[4].mask, 4);
assert(passes[2].camera.isOrthographicCamera && passes[3].clearDepth);
assert.equal(passes[0].target.texture.type, THREE.HalfFloatType, "Foco cortou HDR/reflexos em RGBA8");
assert.equal(passes[0].target.width, 589); assert.equal(passes[0].target.height, 1102);
assert.equal(passes[0].target.samples, 0, "Mobile passou a usar MSAA");
assert(passes[0].lightMask & 2); assert(passes[4].lightMask & 4);
const assertRestored = () => {
  assert.equal(focusCamera.layers.mask, savedMask);
  assert.equal(focusLight.layers.mask, 1);
  assert.equal(focusScene.background, savedBackground);
  assert.equal(focusTarget, null); assert.equal(autoClear, true); assert.equal(clearAlpha, 0.4);
  assert(focusClearColor.equals(savedClearColor));
};
assertRestored();
const contextTarget = focusPass.target;
await lightingPreparer.prepare(camera, null, camera, () => false, contextTarget);
assert.equal(target, null, "Preparo HDR não restaurou render target");
let focusDisposed = 0;
for (const resource of [contextTarget, passes[2].scene.children[0].geometry, passes[2].scene.children[0].material])
  resource.addEventListener("dispose", () => { focusDisposed++; });
const renderFocus = focusRenderer.render;
focusRenderer.render = () => { throw Error("falha simulada no passe"); };
assert.throws(() => focusPass.render(true), /falha simulada/);
assertRestored();
focusRenderer.render = renderFocus;
passes.length = 0; focusPass.render(false); assert.equal(passes.length, 1);
focusPass.dispose(); assert.equal(focusDisposed, 3);
const fallbackPass = api.createFocusRenderer({ ...focusRenderer, extensions: { has: () => false } }, focusScene, focusCamera);
assert.equal(fallbackPass.prepare(), null);
passes.length = 0; fallbackPass.render(true); assert.equal(passes.length, 1);
fallbackPass.dispose();
const antialiased = api.createFocusRenderer({ ...focusRenderer,
  getContext: () => ({ getContextAttributes: () => ({ antialias: true }), getInternalformatParameter: () => new Int32Array([4, 2]) }),
}, focusScene, focusCamera);
assert.equal(antialiased.prepare().samples, 4, "Contexto com MSAA perdeu antialiasing");
antialiased.dispose();
const unsupportedMSAA = api.createFocusRenderer({ ...focusRenderer,
  getContext: () => ({ getContextAttributes: () => ({ antialias: true }), getInternalformatParameter: () => new Int32Array(0) }),
}, focusScene, focusCamera);
assert(!unsupportedMSAA.supported, "HDR sem MSAA compatível reduziu a qualidade do contexto");
unsupportedMSAA.dispose();
console.log("ok foco — contexto HDR, composição, selecionado, luzes, fallback, restauração e dispose");

// GIF: bitmaps reduzidos, descarte explícito e avanço sem desenhar quadros intermediários.
let draws = 0, closedFrames = 0, closedBitmaps = 0, closedDecoders = 0;
const bitmaps = [];
globalThis.document = { createElement() {
  const canvas = { width: 0, height: 0, frameIndex: 0 };
  canvas.getContext = () => ({ clearRect() {}, drawImage(source) { draws++; canvas.frameIndex = source.frameIndex; } });
  return canvas;
} };
globalThis.ImageDecoder = class {
  completed = Promise.resolve();
  tracks = { selectedTrack: { frameCount: 4 } };
  async decode({ frameIndex }) {
    if (frameIndex === globalThis.failGifAt) throw new Error("falha simulada");
    return { image: { frameIndex, displayWidth: 2048, displayHeight: 1024, duration: 100_000, close() { closedFrames++; } } };
  }
  close() { closedDecoders++; }
};
globalThis.createImageBitmap = async (canvas) => {
  const bitmap = { width: canvas.width, height: canvas.height, frameIndex: canvas.frameIndex, close() { closedBitmaps++; } };
  bitmaps.push(bitmap);
  return bitmap;
};
const footprint = { width: 2, height: 10, depth: 2 };
const hologram = api.createHologramMesh(footprint, { color: "white", opacity: 1 });
await api.setHologramImage(hologram, "data:image/gif;base64,R0lGODlh", footprint);
assert.equal(closedFrames, 4); assert.equal(closedDecoders, 1);
assert(bitmaps.every((bitmap) => bitmap.width === 512 && bitmap.height === 256));
assert.equal(hologram.texture.generateMipmaps, false);
draws = 0;
api.tickHologram(hologram, 0.35, 350);
assert.equal(hologram.animation.index, 3); assert.equal(draws, 1);
const textureVersion = hologram.texture.version;
api.tickHologram(hologram, 400.35, 400_000);
assert.equal(hologram.animation.index, 3); assert.equal(draws, 1);
assert.equal(hologram.texture.version, textureVersion);
api.tickHologram(hologram, 400.46, 110);
assert.equal(hologram.animation.index, 0); assert.equal(draws, 2);
api.disposeHologramMesh(hologram);
assert.equal(closedBitmaps, 4);
globalThis.Image = class {
  naturalWidth = 512; naturalHeight = 256;
  set src(_value) { queueMicrotask(() => this.onload()); }
};
const failed = api.createHologramMesh(footprint, { color: "white", opacity: 1 });
globalThis.failGifAt = 2;
await api.setHologramImage(failed, "data:image/gif;base64,R0lGODlh", footprint);
assert.equal(failed.animation, null);
assert.equal(failed.texture.generateMipmaps, false);
assert.equal(closedBitmaps, 6, "falha deixou bitmaps decodificados vivos");
assert.equal(closedFrames, 6);
assert.equal(closedDecoders, 2);
api.disposeHologramMesh(failed);
globalThis.failGifAt = -1;
const canceled = api.createHologramMesh(footprint, { color: "white", opacity: 1 });
const createBitmap = globalThis.createImageBitmap;
globalThis.createImageBitmap = async (canvas) => {
  const bitmap = await createBitmap(canvas);
  canceled.loadToken++;
  return bitmap;
};
await api.setHologramImage(canceled, "data:image/gif;base64,R0lGODlh", footprint);
assert.equal(canceled.texture, null);
assert.equal(closedBitmaps, 7, "carga obsoleta não liberou bitmap");
assert.equal(closedDecoders, 3);
api.disposeHologramMesh(canceled);
console.log("ok GIF — resolução preservada, memória limitada por quadro, tempo real e descarte");

const textureApi = await bundleModules(["src/scene/textures/facadeTextureLoader.ts"], {
  facadeTextureManifest: `
    export const resolveFacadeFolder = (key) => key;
    export const getFacadeMapUrls = (key) => Object.fromEntries(['color','normal','roughness','metalness','displacement'].map(kind => [kind, key + '/' + kind + '.webp']));
  `,
  loadImageTexture: `
    import { Texture } from ${JSON.stringify(threeUrl)};
    export const loadImageTexture = async (url) => {
      globalThis.textureRequests.push(url);
      const texture = new Texture(); texture.name = url; return texture;
    };
  `,
});
globalThis.textureRequests = [];
const minimal = { normal: false, roughness: false, metalness: false, displacement: false };
const [base, bumped] = await Promise.all([
  textureApi.loadFacadeTextureSet("facade", 4, minimal),
  textureApi.loadFacadeTextureSet("facade", 4, { ...minimal, bump: true }),
]);
assert.equal(base, bumped);
assert.deepEqual(globalThis.textureRequests.sort(), ["facade/color.webp", "facade/displacement.webp"]);
await textureApi.loadFacadeTextureSet("facade", 4, { ...minimal, normal: true, bump: true });
assert(base.normal && !base.roughness && !base.metalness);
await textureApi.loadFacadeTextureSet("facade", 4, { ...minimal, roughness: true });
assert(base.roughness);
const requestCount = globalThis.textureRequests.length;
await textureApi.loadFacadeTextureSet("facade", 4, { ...minimal, roughness: true });
assert.equal(globalThis.textureRequests.length, requestCount);
await textureApi.loadFacadeTextureSet("top", 4, { ...minimal, normal: true, bump: true });
assert(!globalThis.textureRequests.includes("top/displacement.webp"), "normal ativo carregou bump inutilizado");
console.log("ok texturas — cache incremental, concorrência, mapas sob demanda e normal/bump");
const stone = new THREE.MeshStandardMaterial();
api.setResidentialStoneMaps(stone, { color: base.color, normal: null, roughness: null });
const stoneVersion = stone.version;
api.setResidentialStoneMaps(stone, base);
assert.equal(stone.normalMap, base.normal);
assert.equal(stone.roughnessMap, base.roughness);
assert.equal(stone.version, stoneVersion + 1, "mapas tardios da pedra não invalidaram o shader");
api.setResidentialStoneMaps(stone, base);
assert.equal(stone.version, stoneVersion + 1, "mapas idênticos invalidaram o shader");
stone.dispose();
