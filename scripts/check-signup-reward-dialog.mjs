// Fluxo real de escolha e ciclo do preview, sem servidor/navegador/GPU.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
const jsx = nativeRequire("react/jsx-runtime");
async function load(path, modules, globals = {}) {
  const source = await readFile(path, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, ...globals, require: (name) => {
    assert.ok(name in modules, `Import não previsto: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(js, context);
  return context.exports;
}
function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...find(node.props.children, predicate)];
}
const settle = () => new Promise(setImmediate);
const options = ["loft", "gourmet"].map((key, index) => ({ key: `option:${index + 1}`, label: key, categoryKey: "shape", categoryLabel: "Formato", optionKey: key, unlock: null }));
class ApiError extends Error {}
async function mount({ choose = async () => {}, reduced = false, items = options } = {}) {
  const slots = [];
  const calls = [];
  let cursor = 0, deferred = 0;
  const { SignupRewardDialog } = await load("src/components/pass/SignupRewardDialog.tsx", {
    react: { ...React, lazy: () => "Preview", useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    } },
    "react/jsx-runtime": jsx,
    "lucide-react": { ArrowLeft: "ArrowLeft", Rotate3d: "Rotate3d", Users: "Users" },
    "motion/react": { domAnimation: {}, LazyMotion: "LazyMotion", useReducedMotion: () => reduced },
    "motion/react-m": { div: "m.div", span: "m.span" },
    "@/api/http": { ApiError },
    "@/lib/pass": { PREVIEW_KIND: { shape: "shape", rooftop: "rooftop", edge_light: "edgeLight" } },
    "@/components/customization/CustomizationImage": { CustomizationImage: "CustomizationImage" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/pixel-icon": { BlockLoader: "BlockLoader", ErrorMark: "ErrorMark", PixelCheck: "PixelCheck" },
    "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogTitle"].map((name) => [name, name])),
    "./RewardConfetti": { RewardConfetti: "RewardConfetti" },
  });
  const choice = { referralMin: 2, rewards: items };
  const rewards = {
    nextChoice: { referralMin: 5 }, signupReferrals: 2,
    deferChoice: () => deferred++,
    choose: async (...args) => { calls.push(args); await choose(...args); },
  };
  const render = () => { cursor = 0; return SignupRewardDialog({ rewards, choice }); };
  return {
    render, calls, get deferred() { return deferred; },
    get(type) { return find(render(), (node) => node.type === type).map((node) => node.props); },
    unlock() { return this.get("Button").find((props) => props.variant === "reward"); },
    inspect(index) { this.get("Button").filter((props) => props["aria-label"]?.startsWith("Ver "))[index].onClick(); },
  };
}

let finish;
const flow = await mount({ choose: () => new Promise((resolve) => { finish = resolve; }) });
assert.equal(flow.unlock().children, "Desbloquear recompensa");
assert.equal(flow.unlock().disabled, true);
assert.equal(flow.get("Preview").length, 0, "Não monta WebGL na grade");
assert.equal(flow.get("RewardConfetti").length, 1, "Celebra abertura do modal");
flow.get("input")[0].onChange();
flow.unlock().onClick();
assert.deepEqual(flow.calls, [[2, "option:1"]]);
assert.equal(flow.unlock().disabled, true);
assert.equal(flow.get("fieldset")[0].disabled, true);
flow.get("Dialog")[0].onOpenChange(false);
assert.equal(flow.deferred, 0, "Não fecha enquanto confirma");
let prevented = 0;
flow.get("DialogContent")[0].onEscapeKeyDown({ preventDefault() { prevented++; } });
flow.get("DialogContent")[0].onInteractOutside({ preventDefault() { prevented++; } });
assert.equal(prevented, 2);
finish();
await settle();
assert.equal(flow.unlock().disabled, false);

const preview = await mount();
preview.get("input")[0].onChange();
preview.inspect(1);
assert.equal(preview.get("RewardConfetti").length, 1, "Confete permanece montado ao explorar, sem reiniciar");
assert.equal(preview.get("Preview").length, 1, "Só um canvas interativo");
assert.equal(preview.get("Preview")[0].subject.key, "gourmet");
preview.get("Button").find((props) => props.children?.[1] === "Ver recompensas").onClick();
assert.equal(preview.get("Preview").length, 0, "Voltar desmonta preview");
assert.equal(preview.get("input")[0].checked, true, "Explorar não troca seleção anterior");
preview.inspect(1);
preview.unlock().onClick();
await settle();
assert.deepEqual(preview.calls, [[2, "option:2"]], "Na prévia desbloqueia o item exibido");

const failed = await mount({ choose: async () => { throw new ApiError("Etapa indisponível"); } });
failed.get("input")[1].onChange();
failed.unlock().onClick();
await settle();
assert.equal(failed.get("p").find((props) => props.role === "alert").children[1], "Etapa indisponível");
assert.equal(failed.unlock().disabled, false, "Erro preserva seleção e permite tentar de novo");
failed.get("Dialog")[0].onOpenChange(false);
assert.equal(failed.deferred, 1);
const reduced = await mount({ reduced: true });
assert.equal(reduced.get("RewardConfetti").length, 0, "Movimento reduzido remove confete");
assert.ok(reduced.get("m.div").every((props) => props.initial.y === undefined));
const color = await mount({ items: [{ ...options[0], categoryKey: "color", optionKey: "green", value: "#123456" }] });
assert.equal(color.get("Button").filter((props) => props["aria-label"]).length, 0, "Cor não promete modelo 3D");
color.get("input")[0].onChange();
assert.equal(color.unlock().disabled, false);

const unlockHelpers = await load("src/lib/unlock.ts", {});
const passHelpers = await load("src/lib/pass.ts", {});
const reasonHelpers = await load("src/lib/rewardNotifications.ts", { "./unlock": unlockHelpers, "./pass": passHelpers });
async function mountAchievement({ pending = [options[0]], reduced = false, choice } = {}) {
  let previewKey = null;
  const acknowledgments = [];
  const { default: RewardDialog } = await load("src/components/pass/RewardDialog.tsx", {
    react: { ...React, lazy: () => "Preview", useState: () => [previewKey, (value) => { previewKey = value; }] },
    "react/jsx-runtime": jsx,
    "lucide-react": Object.fromEntries(["ArrowLeft", "Gift", "Rotate3d", "Users"].map((name) => [name, name])),
    "motion/react": { domAnimation: {}, LazyMotion: "LazyMotion", useReducedMotion: () => reduced },
    "motion/react-m": { div: "m.div" },
    "@/lib/pass": passHelpers, "@/lib/unlock": unlockHelpers, "@/lib/rewardNotifications": reasonHelpers,
    "@/components/customization/CustomizationImage": { CustomizationImage: "CustomizationImage" },
    "@/components/ui/button": { Button: "Button" },
    "@/components/ui/pixel-icon": { BlockLoader: "BlockLoader", PixelCoin: "PixelCoin" },
    "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogTitle"].map((name) => [name, name])),
    "./SignupRewardDialog": { SignupRewardDialog: "SignupRewardDialog" },
    "./RewardConfetti": { RewardConfetti: "RewardConfetti" },
  });
  const rewards = { pending, choice, signupReferrals: 2, nextChoice: { referralMin: 5 },
    next: { reward: { label: "Letreiro" }, remaining: "Faltam R$ 50" },
    dismiss: (keys) => acknowledgments.push(keys),
  };
  const render = () => RewardDialog({ rewards });
  return {
    render, acknowledgments,
    get(type) { return find(render(), (node) => node.type === type).map((node) => node.props); },
    inspect(index) { this.get("Button").filter((props) => props["aria-label"]?.startsWith("Ver "))[index].onClick(); },
  };
}
function visibleText(node) {
  if (Array.isArray(node)) return node.map(visibleText).join("");
  if (!React.isValidElement(node)) return typeof node === "string" || typeof node === "number" ? String(node) : "";
  if (typeof node.type === "function" && node.type.name === "RewardReason") return visibleText(node.type(node.props));
  return visibleText(node.props.children);
}

const achievement = await mountAchievement({ pending: [{ ...options[0], unlock: { donationMin: 50, referralMin: null } }] });
assert.equal(achievement.get("RewardConfetti").length, 1);
assert.equal(achievement.get("Preview").length, 0);
assert.equal(visibleText(achievement.get("DialogDescription")[0].children).replace(/\s/g, " "), "R$ 50 em contribuições");
achievement.inspect(0);
assert.equal(achievement.get("Preview")[0].subject.key, "loft");
assert.equal(achievement.acknowledgments.length, 0, "Explorar conquista não confirma aviso");
achievement.get("Button").find((props) => props.children?.[1] === "Ver recompensas").onClick();
assert.equal(achievement.get("Preview").length, 0);
assert.equal(achievement.get("RewardConfetti").length, 1, "Voltar mantém a mesma celebração");
achievement.get("Button").find((props) => props.children === "Continuar").onClick();
assert.deepEqual(achievement.acknowledgments, [[options[0].key]]);

const batch = await mountAchievement({ pending: options, choice: { referralMin: 2, rewards: options } });
assert.equal(batch.get("SignupRewardDialog").length, 0, "Lote pendente continua tendo prioridade");
assert.equal(batch.get("CustomizationImage").length, 2, "Cada recompensa recebe seu cartão");
batch.inspect(1);
assert.equal(batch.get("Preview")[0].subject.key, "gourmet");
batch.get("Dialog")[0].onOpenChange(false);
assert.deepEqual(batch.acknowledgments, [options.map((reward) => reward.key)], "Fechar confirma lote completo, inclusive da prévia");
assert.equal((await mountAchievement({ pending: [] })).render(), null);
assert.equal((await mountAchievement({ pending: [], choice: { referralMin: 2, rewards: options } })).get("SignupRewardDialog").length, 1);
const quietAchievement = await mountAchievement({ reduced: true });
assert.equal(quietAchievement.get("RewardConfetti").length, 0);
assert.ok(quietAchievement.get("m.div").every((props) => props.initial.y === undefined));
const flatAchievement = await mountAchievement({ pending: [{ ...options[0], categoryKey: "color", optionKey: "green", value: "#123456" }] });
assert.equal(flatAchievement.get("Button").filter((props) => props["aria-label"]).length, 0);
for (const [unlock, signupReferralMin, expected] of [
  [null, null, "Primeiros inscritos"],
  [null, 1, "1 indicação"],
  [{ donationMin: 100, referralMin: null }, 2, "2 indicações"],
  [{ donationMin: 50, referralMin: 2, mode: "all" }, null, "R$ 50 + 2 indicações"],
  [{ donationMin: 50, referralMin: 2, mode: "any" }, null, "R$ 50 ou 2 indicações"],
]) {
  const result = await mountAchievement({ pending: [{ ...options[0], unlock, signupReferralMin }] });
  assert.equal(visibleText(result.get("DialogDescription")[0].children).replace(/\s/g, " "), expected, "Motivo compacto mantém origem e AND/OR históricos");
}

// Mesmo preview utilizado pelo admin e pelos dois modais públicos.
let cleanup, instance, controls, view, rafCallback, removed = 0, scenes = 0, failWebGL = false, previewError = false;
const listeners = new Map();
class Renderer {
  domElement = { style: {}, classList: { add() {} }, setAttribute() {}, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name) => listeners.delete(name), remove() { removed++; } };
  renders = 0; disposed = false; lost = false;
  constructor() { if (failWebGL) throw new Error("Sem WebGL"); instance = this; }
  setPixelRatio() {} setSize() {} render() { this.renders++; }
  dispose() { this.disposed = true; } forceContextLoss() { this.lost = true; }
}
class Controls {
  target = new THREE.Vector3(); disposed = false;
  constructor() { controls = this; }
  listenToKeyEvents(element) { this.keys = element; }
  update() {} dispose() { this.disposed = true; }
}
const container = { clientWidth: 600, clientHeight: 320, appendChild() {} };
const globals = { window: { devicePixelRatio: 3, matchMedia: () => ({ matches: true }) }, document: { hidden: false },
  ResizeObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame(callback) { rafCallback = callback; return 1; }, cancelAnimationFrame() {},
};
const { CustomizationPreview } = await load("src/components/three/CustomizationPreview.tsx", {
  react: { useRef: () => ({ current: container }), useState: () => [previewError, (value) => { previewError = value; }], useEffect(effect) { cleanup = effect(); } },
  "react/jsx-runtime": jsx,
  three: { ...THREE, WebGLRenderer: Renderer },
  "three/examples/jsm/controls/OrbitControls.js": { OrbitControls: Controls },
  "@/scene/builders/createPreviewScene": {
    resolveSubject: (subject) => subject,
    createPreviewScene() {
      scenes++;
      view = { scene: {}, camera: new THREE.PerspectiveCamera(), center: new THREE.Vector3(), disposed: false,
        frame: () => 10, place(distance) { this.camera.position.set(0, 0, distance); }, dispose() { this.disposed = true; } };
      return view;
    },
  },
}, globals);
const props = { subject: { kind: "shape", key: "loft" } };
CustomizationPreview(props);
assert.equal(controls.autoRotate, false, "Preview respeita movimento reduzido");
assert.equal(controls.keys, instance.domElement, "Teclado controla o canvas focado");
assert.equal(instance.domElement.tabIndex, 0);
const camera = new THREE.PerspectiveCamera();
const orbit = new OrbitControls(camera);
orbit.maxPolarAngle = controls.maxPolarAngle;
orbit.target.set(0, 1, 0);
camera.position.set(4, -4, 4);
const distance = camera.position.distanceTo(orbit.target);
orbit.update();
assert.equal(orbit.getPolarAngle(), Math.PI / 2, "Câmera para no horizonte");
assert.ok(camera.position.y >= orbit.target.y, "Câmera não mostra o edifício por baixo");
assert.ok(Math.abs(camera.position.distanceTo(orbit.target) - distance) < 1e-10, "Limite vertical preserva zoom");
rafCallback(40);
assert.equal(instance.renders, 1);
globals.document.hidden = true;
rafCallback(80);
assert.equal(instance.renders, 1, "Não renderiza em aba oculta");
for (let i = 0; i < 100; i++) listeners.get("keydown")({ key: "+", preventDefault() {} });
assert.ok(Math.abs(view.camera.position.length() - controls.minDistance) < 1e-9, "Zoom mínimo respeitado");
for (let i = 0; i < 100; i++) listeners.get("keydown")({ key: "-", preventDefault() {} });
assert.ok(Math.abs(view.camera.position.length() - controls.maxDistance) < 1e-9, "Zoom máximo respeitado");
cleanup();
assert.ok(controls.disposed && view.disposed && instance.disposed && instance.lost);
assert.equal(removed, 1);
assert.equal(listeners.size, 0);
failWebGL = true;
CustomizationPreview(props);
assert.equal(previewError, true);
assert.equal(scenes, 1, "Falha de WebGL não cria cena nem derruba modal");

async function mountConfetti({ reduced = false, hidden = false, fail = false } = {}) {
  const timers = new Map(), canvases = new Set(), shots = [];
  let cleanup, mounted = false, imports = 0, resets = 0, flags, warnings = 0, finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const fire = (options) => { shots.push(options); return done; };
  fire.reset = () => { resets++; finish(null); };
  const modules = { react: { useEffect(effect) { if (!mounted) { mounted = true; cleanup = effect(); } } } };
  Object.defineProperty(modules, "canvas-confetti", { get() {
    imports++;
    return { default: { create(canvas, options) {
      if (fail) throw new Error("Canvas indisponível");
      assert.ok(canvases.has(canvas));
      flags = options;
      return fire;
    } } };
  } });
  const { RewardConfetti } = await load("src/components/pass/RewardConfetti.tsx", modules, {
    window: {
      matchMedia: () => ({ matches: reduced }),
      setTimeout(callback) { timers.set(1, callback); return 1; },
      clearTimeout(id) { timers.delete(id); },
    },
    document: { hidden, documentElement: {}, body: { appendChild(canvas) { canvases.add(canvas); } },
      createElement(tag) {
        assert.equal(tag, "canvas");
        return { style: {}, setAttribute(name, value) { this[name] = value; }, remove() { canvases.delete(this); } };
      },
    },
    getComputedStyle: () => ({ getPropertyValue: (key) => ({ "--color-ambar": "#e3a33b", "--color-verde": "#4e6b45", "--color-papel": "#f2eee3" })[key] }),
    console: { warn() { warnings++; } },
  });
  RewardConfetti();
  return {
    render: RewardConfetti, shots, timers, canvases, finish,
    get imports() { return imports; }, get resets() { return resets; }, get flags() { return flags; }, get warnings() { return warnings; },
    async start() { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); await settle(); },
    close() { cleanup?.(); },
  };
}

const celebration = await mountConfetti();
assert.equal(celebration.imports, 0, "Biblioteca só carrega após entrada do modal");
await celebration.start();
assert.equal(celebration.shots.length, 5, "Cinco camadas do Realistic Look por abertura");
assert.equal(celebration.flags.useWorker, true);
assert.equal(celebration.flags.disableForReducedMotion, true);
assert.equal(celebration.flags.resize, true);
assert.equal(celebration.shots.reduce((total, shot) => total + shot.particleCount, 0), 300, "Quantidade maior, com limite por abertura");
assert.ok(celebration.shots.every((shot) => shot.shapes[0] === "square" && shot.ticks === 200));
assert.ok(celebration.shots.some((shot) => shot.scalar === 0.8) && celebration.shots.some((shot) => shot.scalar === 1.2), "Partículas variam em tamanho");
assert.equal(JSON.stringify(celebration.shots[0].colors), JSON.stringify(["#e3a33b", "#4e6b45", "#f2eee3"]), "Paleta vem dos tokens do DS");
assert.ok(celebration.shots.every((shot) => shot.origin.x === 0.5 && shot.origin.y === 0.7), "Explosão central do preset Realistic Look");
const canvas = [...celebration.canvases][0];
assert.equal(canvas["aria-hidden"], "true");
assert.ok(canvas.style.cssText.includes("pointer-events:none"), "Confete não bloqueia interação");
celebration.render();
assert.equal(celebration.timers.size, 0, "Renders e prévia não reiniciam celebração");
celebration.finish(null);
await settle();
assert.equal(celebration.canvases.size, 0, "Canvas removido ao terminar");
celebration.close();
assert.equal(celebration.resets, 1, "Desmontar cancela animação da instância");
const earlyClose = await mountConfetti();
await earlyClose.start();
earlyClose.close();
assert.equal(earlyClose.resets, 1, "Fechar interrompe confetes ainda em movimento");
assert.equal(earlyClose.canvases.size, 0);

const strictFirst = await mountConfetti();
strictFirst.close();
await strictFirst.start();
assert.equal(strictFirst.imports, 0, "StrictMode/fechar antes do timer cancela download e disparo");
const late = await mountConfetti();
const importing = late.start();
late.close();
await importing;
assert.equal(late.canvases.size, 0, "Import atrasado não cria canvas depois de fechar");
assert.equal(late.shots.length, 0);
for (const settings of [{ reduced: true }, { hidden: true }]) {
  const skipped = await mountConfetti(settings);
  await skipped.start();
  assert.equal(skipped.shots.length, 0, "Sem efeito com movimento reduzido ou aba oculta");
  assert.equal(skipped.canvases.size, 0);
  skipped.close();
}
const failedConfetti = await mountConfetti({ fail: true });
await failedConfetti.start();
assert.equal(failedConfetti.canvases.size, 0, "Erro decorativo não deixa overlay");
assert.equal(failedConfetti.warnings, 1);
failedConfetti.close();

console.log("Indicação e conquista: layout, prévia, motivos e lote OK; 3D e confete: limites, worker, movimento reduzido e limpeza OK.");
