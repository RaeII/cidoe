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
    // Catálogo do evento vem da API: aqui, do globalThis (null = carregando).
    api.onResolve({ filter: /useClubCatalog$/ }, (args) => ({ path: args.path, namespace: "club-catalog-stub" }));
    api.onLoad({ filter: /.*/, namespace: "club-catalog-stub" }, () => ({ contents: "export const useClubCatalog = (enabled) => ({ catalog: enabled ? globalThis.clubCatalog : null, error: null, retry() {} });" }));
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
const customization = { color: "#d4d4d4", buildingShape: "default", rooftopType: "none", edgeLightType: "none", textureKey: null, signText: "", signSides: 1, hologramImage: null, hologramColor: "#73f2ff", hologramOpacity: 0.78, screenSide: "front", screenImages: [], screenLabel: "none" };
const props = { catalog, customization, textureSettings: {}, onChange: () => {} };
const html = render(props);
assert.match(html, /Formato livre/);
assert.match(html, /Formato bloqueado/);
assert.match(html, /Bloqueado/);
assert.match(html, /Doe.*50.*e faça 3 indicações para liberar/);
assert.match(html, /disabled=""[^>]*>.*?Formato bloqueado/s, "Item bloqueado deve ficar desabilitado");
assert.match(html, /data-state="inactive"[^>]*inert=""[^>]*>.*Vermelho/s, "Categoria vizinha monta inerte para o deslize no celular");
assert.match(html, /role="tab"/, "Categorias devem permitir navegação por teclado");
assert.match(html, /aria-pressed="true"[^>]*>[^]*?EM USO[^]*?Formato livre/, "Opção em uso marcada com o selo");
assert.equal(html.match(/EM USO/g)?.length, 1, "Selo só na opção em uso");
for (const feature of ["sign", "hologram"]) {
  const featureHtml = render({ ...props, catalog: { ...catalog, shapes: [], colors: [], features: { sign: null, hologram: null, [feature]: { isUnlocked: false, unlock: { donationMin: 100, referralMin: null } } } } });
  assert.match(featureHtml, /fieldset disabled=""/);
  assert.match(featureHtml, /Doe.*100.*para liberar/);
  const unlockedHtml = render({ ...props, catalog: { ...catalog, shapes: [], colors: [], features: { sign: null, hologram: null, [feature]: { isUnlocked: true, unlock: null } } } });
  assert.doesNotMatch(unlockedHtml, /fieldset disabled=""/, "Recurso liberado mantém os campos disponíveis");
  assert.match(unlockedHtml, feature === "sign" ? /Texto do letreiro/ : /Imagem ou GIF/);
  if (feature === "sign") assert.match(unlockedHtml, /checked="" value="1"/, "Lados do letreiro como opções, 1 marcado");
}

// Telão: só com time do evento e só as imagens dele (catálogo da API); ordem nos selos; key de
// outro time (troca) não conta mas ainda deixa remover; Trocar time só com troca e evento ligado.
const team = (slug, name, count, isActive = true, nickname = null) => ({ slug, name, nickname, isActive, thumbUrl: `/api/club/images/${slug}/1/thumb?v=1`,
  images: Array.from({ length: count }, (_, i) => ({ key: `${slug}/${i + 1}`, url: `/api/club/images/${slug}/${i + 1}?v=1` })) });
const clubCatalog = { isActive: true, clubs: [team("gremio", "Grêmio", 3, true, "Tricolor"), team("flamengo", "Flamengo", 3), team("bahia", "Bahia", 6), team("santos", "Santos", 2, false)] };
globalThis.clubCatalog = clubCatalog;
const screenCatalog = { ...catalog, shapes: [], colors: [] };
for (const club of [undefined, null, "time-inexistente"]) {
  assert.doesNotMatch(render({ ...props, catalog: screenCatalog, club }), />Telão</, `Aba do telão sem time (${club})`);
}
globalThis.clubCatalog = null;
assert.doesNotMatch(render({ ...props, catalog: screenCatalog, club: "gremio" }), />Telão</, "Aba do telão antes do catálogo");
globalThis.clubCatalog = clubCatalog;
const emptyScreen = render({ ...props, catalog: screenCatalog, club: "gremio" });
assert.match(emptyScreen, /role="tab"[^>]*>Telão</, "Aba do telão ausente");
assert.match(emptyScreen, />Grêmio</, "Nome do time no rótulo");
assert.match(emptyScreen, /0\/3/);
assert.equal(emptyScreen.match(/src="\/api\/club\/images\/gremio\/[1-3]\?v=1"/g)?.length, 3, "Três imagens do time");
assert.doesNotMatch(emptyScreen, /club\/images\/(?!gremio)/, "Imagem de outro time");
assert.doesNotMatch(emptyScreen, /Remover telão|Trocar time/, "Remover/Trocar sem telão nem troca");
assert.doesNotMatch(emptyScreen, /<legend[^>]*>Nome</, "Escolha do nome sem imagem no telão");
assert.match(emptyScreen, /checked="" value="front"/, "Lado padrão não é a frente");
assert.match(render({ ...props, catalog: screenCatalog, club: "gremio", onChangeClub: () => {} }), /Trocar time/);
const many = render({ ...props, catalog: screenCatalog, club: "bahia" });
assert.equal(many.match(/aria-label="Bahia, imagem \d"/g)?.length, 6, "Time com mais imagens mostra todas");
assert.match(many, /0\/4/, "Teto do telão (4) com time de 6 imagens");
assert.match(render({ ...props, catalog: screenCatalog, club: "santos" }), />Telão</, "Time desativado: quem torce mantém as imagens");
globalThis.clubCatalog = { ...clubCatalog, isActive: false };
assert.doesNotMatch(render({ ...props, catalog: screenCatalog, club: "gremio", onChangeClub: () => {} }), /Trocar time/, "Trocar time com evento desligado");
globalThis.clubCatalog = clubCatalog;
const fullScreen = render({ ...props, catalog: screenCatalog, club: "gremio", customization: { ...customization, screenSide: "back", screenImages: ["gremio/3", "flamengo/1", "gremio/1"] } });
assert.match(fullScreen, /2\/3/, "Key de outro time contou");
assert.match(fullScreen, /aria-label="Grêmio, imagem 3, 1ª no telão"/, "Ordem de escolha não vira ordem de exibição");
assert.match(fullScreen, /aria-label="Grêmio, imagem 1, 2ª no telão"/);
assert.match(fullScreen, /aria-pressed="false"[^>]*aria-label="Grêmio, imagem 2"/);
assert.match(fullScreen, /checked="" value="back"/);
assert.match(fullScreen, /Remover telão/);
assert.match(render({ ...props, catalog: screenCatalog, club: "gremio", customization: { ...customization, screenImages: ["flamengo/1"] } }), /Remover telão/, "Telão só com imagem de outro time precisa poder sair");
// Faixa do nome: Nenhum / nome / apelido (só se o time tem); apelido que sumiu aparece como nome.
assert.match(fullScreen, /<legend[^>]*>Nome</);
assert.match(fullScreen, /checked="" value="none"/, "Faixa do nome ligada por padrão");
assert.match(fullScreen, /value="name"[^>]*\/><span[^>]*>Grêmio</);
assert.match(fullScreen, /value="nickname"[^>]*\/><span[^>]*>Tricolor</);
const noNickname = render({ ...props, catalog: screenCatalog, club: "flamengo", customization: { ...customization, screenImages: ["flamengo/1"], screenLabel: "nickname" } });
assert.doesNotMatch(noNickname, /value="nickname"/, "Apelido oferecido para time sem apelido");
assert.match(noNickname, /checked="" value="name"/, "Apelido que o time não tem não caiu no nome");
console.log("Telão: aba por time do catálogo, imagens, teto, ordem, troca de time, lado, faixa do nome, remover, trocar e evento desligado OK.");

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

// Roda/trackpad: um gesto = um passo, inclusive gesto novo emendado na inércia do anterior (antes travava).
const wheelFn = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "wheelStep");
const wheelCtx = {};
vm.runInNewContext(ts.transpileModule(`${wheelFn.getText(ast)}\nglobalThis.wheelStep = wheelStep;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, wheelCtx);
// Gesto de trackpad do macOS a 60 Hz: dedo (subida até o pico) e inércia decaindo 5% por quadro, sem pausa.
const swipeDeltas = (dir, peak = 26) => {
  const deltas = [0.1, 0.25, 0.45, 0.7, 0.9, 1, 0.95, 0.85].map((f) => f * peak);
  for (let d = deltas.at(-1) * 0.95; d > 0.3; d *= 0.95) deltas.push(d);
  return deltas.map((d) => d * dir);
};
// `frame` = ms entre eventos: 16 (60 Hz) ou 50 (aparelho lento/eventos somados).
const stepsAt = (frame, ...parts) => {
  const state = { time: -Infinity, dir: 0, sizes: [], peak: 0, fell: false, armed: true, stepAt: -Infinity };
  let time = 0;
  const out = [];
  for (const part of parts) {
    if (typeof part === "number") { time += part; continue; } // pausa (ms)
    for (const delta of part) { const step = wheelCtx.wheelStep(state, delta, time); if (step) out.push(step); time += frame; }
  }
  return out;
};
const steps = (...parts) => stepsAt(16, ...parts);
// Ruído de coalescência do Chrome: ±30% por evento e eventos somados (2×) de vez em quando.
let seed = 7;
const noisy = (deltas) => deltas.map((d, i) => { seed = (seed * 16807) % 2147483647; return d * (0.7 + 0.6 * (seed / 2147483647)) * (i % 23 === 11 ? 2 : 1); });
assert.deepEqual(steps(swipeDeltas(1)), [1], "Gesto com inércia anda uma categoria");
assert.deepEqual(steps(swipeDeltas(1, 60)), [1], "Gesto forte não pula várias na inércia");
assert.deepEqual(steps(noisy(swipeDeltas(1, 40))), [1], "Ruído na inércia não vira passo extra");
assert.deepEqual(steps(swipeDeltas(1).slice(0, 22), 48, swipeDeltas(1)), [1, 1], "Gesto durante a inércia do anterior travava");
assert.deepEqual(steps(swipeDeltas(1, 60).slice(0, 20), 32, swipeDeltas(1, 30)), [1, 1], "Gesto durante inércia ainda forte");
assert.deepEqual(steps(swipeDeltas(1), 120, swipeDeltas(1)), [1, 1], "Gesto logo após a inércia travava");
assert.deepEqual(steps(swipeDeltas(1).slice(0, 22), 48, swipeDeltas(-1)), [1, -1], "Volta durante a inércia");
assert.deepEqual(steps(Array.from({ length: 40 }, (_, i) => [5, 7, 6, 8, 5, 7][i % 6])), [1], "Arrasto lento e longo = um passo");
const slowStart = [...Array.from({ length: 25 }, (_, i) => i + 1), ...swipeDeltas(1).slice(8).map((d) => d * 0.96)];
assert.deepEqual(steps(slowStart), [1], "Gesto que começa devagar (subida de 400 ms) = um passo");
for (const frame of [16, 50]) {
  assert.deepEqual(stepsAt(frame, swipeDeltas(1)), [1], `Um gesto, evento a cada ${frame} ms`);
  assert.deepEqual(stepsAt(frame, swipeDeltas(1).slice(0, 22), 48, swipeDeltas(1)), [1, 1], `Gesto na inércia, evento a cada ${frame} ms`);
  assert.deepEqual(stepsAt(frame, swipeDeltas(1).slice(0, 22), 48, swipeDeltas(-1)), [1, -1], `Volta na inércia, evento a cada ${frame} ms`);
}
assert.deepEqual(steps([100], 140, [100], 140, [-100]), [1, 1, -1], "Roda do mouse: um passo por clique espaçado (~6 por segundo)");
console.log("Roda/trackpad: um passo por gesto, gesto emendado na inércia, volta, ruído e roda do mouse OK.");

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
runtimeRef.current.view = { scene: {}, camera: {}, tick: () => false, dispose() { counts.view += 1; } };
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
runtimeRef.current.view.tick = () => true;
frame(280);
frame(320);
assert.equal(counts.render, 5, "Holograma/troca do telão deixou de animar");
cleanup();
assert.equal(runtimeRef.current, null);
assert.deepEqual(counts, { render: 5, renderer: 1, context: 1, controls: 1, observers: 2, view: 1, canceled: 1 });
console.log("Prévia: câmera limitada ao horizonte, zoom preservado, pausa e liberação de recursos OK.");
