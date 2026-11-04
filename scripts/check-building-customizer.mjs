// node scripts/check-building-customizer.mjs — render React e regras, sem servidor/navegador.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import { build } from "esbuild";
import ts from "typescript";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const bundle = await build({
  stdin: { contents: `import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { BuildingCustomizer } from './src/components/customization/BuildingCustomizer';
    export const render = (props) => renderToStaticMarkup(createElement(BuildingCustomizer, props));`, resolveDir: process.cwd() },
  bundle: true, format: "cjs", platform: "node", packages: "external", jsx: "automatic", write: false,
  plugins: [{ name: "skip-webgl-and-images", setup(api) {
    api.onResolve({ filter: /(?:CustomizationImage|BuildingPreview)$/ }, (args) => ({ path: args.path, namespace: "preview-stub" }));
    api.onLoad({ filter: /.*/, namespace: "preview-stub" }, () => ({ contents: "export const CustomizationImage = () => null; export const BuildingPreview = () => null;" }));
  } }],
});
const module = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { render } = module.exports;
const option = (id, key, label, isUnlocked, unlock = null) => ({ id, key, label, isUnlocked, unlock, value: null, sortOrder: id });
const catalog = {
  shapes: [option(1, "default", "Formato livre", true), option(2, "twisted", "Formato bloqueado", false, { donationMin: 50, referralMin: 3 })],
  colors: [{ ...option(3, "red", "Vermelho", true), value: "#ff0000" }],
  textures: [], rooftops: [], edgeLights: [], features: { sign: null, hologram: null },
};
const customization = { color: "#d4d4d4", buildingShape: "default", rooftopType: "none", edgeLightType: "none", textureKey: null, signText: "", signSides: 1, hologramImage: null, hologramColor: "#73f2ff", hologramOpacity: 0.78 };
const props = { catalog, customization, textureSettings: {}, onChange: () => {} };
const html = render(props);
assert.match(html, /Formato livre/);
assert.match(html, /Formato bloqueado/);
assert.match(html, /Bloqueado/);
assert.match(html, /Doe.*50.*e faça 3 indicações para liberar/);
assert.match(html, /disabled=""[^>]*>.*?Formato bloqueado/s, "Item bloqueado deve ficar desabilitado");
assert.match(html, /data-state="inactive"[^>]*inert=""[^>]*>.*Vermelho/s, "Categoria vizinha monta inerte para o deslize no celular");
assert.match(html, /role="tab"/, "Categorias devem permitir navegação por teclado");
for (const feature of ["sign", "hologram"]) {
  const featureHtml = render({ ...props, catalog: { ...catalog, shapes: [], colors: [], features: { sign: null, hologram: null, [feature]: { isUnlocked: false, unlock: { donationMin: 100, referralMin: null } } } } });
  assert.match(featureHtml, /fieldset disabled=""/);
  assert.match(featureHtml, /Doe.*100.*para liberar/);
  const unlockedHtml = render({ ...props, catalog: { ...catalog, shapes: [], colors: [], features: { sign: null, hologram: null, [feature]: { isUnlocked: true, unlock: null } } } });
  assert.doesNotMatch(unlockedHtml, /fieldset disabled=""/, "Recurso liberado mantém os campos disponíveis");
  assert.match(unlockedHtml, feature === "sign" ? /Texto do letreiro/ : /Imagem ou GIF/);
}

// Executa a seleção real: bloqueado não emite patch; disponível atualiza só o campo escolhido.
const source = await readFile(new URL("../src/components/customization/BuildingCustomizer.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("BuildingCustomizer.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const component = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "BuildingCustomizer");
const selection = component.body.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(ast) === "select"));
let patch = null;
const state = { onChange: (next) => { patch = next; } };
vm.runInNewContext(ts.transpileModule(`${selection.getText(ast)}\nglobalThis.select = select;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, state);
state.select("shape", catalog.shapes[1]);
assert.equal(patch, null, "Não permite equipar item bloqueado");
state.select("shape", catalog.shapes[0]);
assert.equal(patch.buildingShape, "default");
state.select("color", catalog.colors[0]);
assert.equal(patch.color, "#ff0000");
console.log("Personalização: categorias, grade, requisitos de bloqueio, features e seleção disponíveis OK.");

// Exercita o ciclo real do canvas com GPU simulada: render pausa e recursos fecham.
const previewSource = await readFile(new URL("../src/components/three/BuildingPreview.tsx", import.meta.url), "utf8");
const previewAst = ts.createSourceFile("BuildingPreview.tsx", previewSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const preview = previewAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "BuildingPreview");
const effect = preview.body.statements.find((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(previewAst) === "useEffect");
const counts = { render: 0, renderer: 0, context: 0, controls: 0, observers: 0, view: 0, canceled: 0 };
let frame;
let visibility;
let cleanup;
const runtimeRef = { current: null };
const mocks = {
  THREE: { ...THREE, WebGLRenderer: class {
    domElement = { style: {}, remove() {} };
    setPixelRatio() {} setSize() {}
    render() { counts.render += 1; }
    dispose() { counts.renderer += 1; }
    forceContextLoss() { counts.context += 1; }
  } },
  OrbitControls: class extends THREE.EventDispatcher { target = new THREE.Vector3(); update() {} dispose() { counts.controls += 1; } },
  ResizeObserver: class { observe() {} disconnect() { counts.observers += 1; } },
  IntersectionObserver: class { constructor(callback) { visibility = callback; } observe() {} disconnect() { counts.observers += 1; } },
  window: { devicePixelRatio: 2, matchMedia: () => ({ matches: true }) },
  document: { hidden: false },
  containerRef: { current: { appendChild() {}, clientWidth: 400, clientHeight: 400 } },
  runtimeRef, initFacadeTextureLoader() {}, setError() { assert.fail("Contexto simulado deveria abrir"); },
  requestAnimationFrame(callback) { frame = callback; return 1; },
  cancelAnimationFrame() { counts.canceled += 1; },
  useEffect(callback) { cleanup = callback(); },
};
vm.runInNewContext(ts.transpileModule(effect.getText(previewAst), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, mocks);
// Sem DOM/GPU: o OrbitControls real deve impedir a vista por baixo, preservando a distância.
assert.equal(runtimeRef.current.controls.enablePan, false);
const camera = new THREE.PerspectiveCamera();
const orbit = new OrbitControls(camera);
orbit.maxPolarAngle = runtimeRef.current.controls.maxPolarAngle;
orbit.target.set(0, 1, 0);
camera.position.set(4, -4, 4);
const distance = camera.position.distanceTo(orbit.target);
orbit.update();
assert.equal(orbit.getPolarAngle(), Math.PI / 2, "Câmera deve parar no horizonte");
assert.ok(camera.position.y >= orbit.target.y, "Não permite olhar o edifício por baixo");
assert.ok(Math.abs(camera.position.distanceTo(orbit.target) - distance) < 1e-10, "Limite vertical preserva o zoom");
runtimeRef.current.view = { scene: {}, camera: {}, tick() {}, hasAnimation: () => false, dispose() { counts.view += 1; } };
frame(40);
assert.equal(counts.render, 1);
mocks.document.hidden = true;
frame(80);
assert.equal(counts.render, 1, "Aba escondida não renderiza");
mocks.document.hidden = false;
visibility([{ isIntersecting: false }]);
frame(120);
assert.equal(counts.render, 1, "Prévia fora da tela não renderiza");
visibility([{ isIntersecting: true }]);
frame(160);
assert.equal(counts.render, 2);
frame(200);
assert.equal(counts.render, 2, "Prévia estática repetiu render");
runtimeRef.current.controls.dispatchEvent({ type: "change" });
frame(240);
assert.equal(counts.render, 3, "Controle não pediu render");
runtimeRef.current.view.hasAnimation = () => true;
frame(280);
frame(320);
assert.equal(counts.render, 5, "Holograma deixou de animar");
cleanup();
assert.equal(runtimeRef.current, null);
assert.deepEqual(counts, { render: 5, renderer: 1, context: 1, controls: 1, observers: 2, view: 1, canceled: 1 });
console.log("Prévia: câmera limitada ao horizonte, zoom preservado, pausa e liberação de recursos OK.");
