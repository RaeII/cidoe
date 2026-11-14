// node scripts/measure-scene-performance.mjs [qtd] [formatos] — mede a cena REAL em órbita.
//
// Objetivo: fps, tempo de JS, draw calls e triângulos por frame, separando o render da tela
// da captura do cube de reflexo. Mede, não afirma: comparar com a tabela de
// doc/scene/engine/relatorio-desempenho-edificios.md antes/depois de mexer em desempenho.
//
// Precisa: dev server (http://localhost:5173) + API (:3000) no ar e Google Chrome instalado.
// Abre Chrome headless com GPU (ANGLE Metal), gera o lote pelo handle do canvas (mesmo caminho
// do "gerar" em lote), orbita 6 s por arrasto real do mouse e imprime a tabela.
//
//   qtd       edifícios do lote (padrão 10000; 0 = só as doações do banco)
//   formatos  all (catálogo ativo, igual ao lote da interface) | none (padrão instanciado)
//             | lista: residential,gourmet,loft
//
// Variáveis: REFLECTION='{"followCamera":false,"continuous":false}' altera o reflexo em runtime;
//            PROFILE=1 soma perfil de CPU (top self-time); DPR=2 emula tela retina;
//            SHOT=arquivo.png salva a tela ao fim da órbita (conferência visual);
//            CLICK=x,y clica nesse ponto antes do SHOT (foco no edifício sob o cursor);
//            CUSTOM='{"tilingScale":2}' soma campos à customização do lote — tiling/cor
//            própria tiram o edifício do lote instanciado (caminho do Mesh dedicado);
//            URL, API e CHROME trocam os endereços/binário.
//
// Ex.: node scripts/measure-scene-performance.mjs 10000 all
//      REFLECTION='{"followCamera":false,"continuous":false}' PROFILE=1 node scripts/measure-scene-performance.mjs 10000 all
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [qtyArg = "10000", shapesArg = "all"] = process.argv.slice(2);
const qty = Number(qtyArg);
const URL = process.env.URL ?? "http://localhost:5173/";
const API = process.env.API ?? "http://localhost:3000/api";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let shapes = [];
if (shapesArg === "all") {
  const catalog = await (await fetch(`${API}/customization/catalog`)).json();
  shapes = catalog.categories.find((category) => category.key === "shape").options.map((option) => option.key);
} else if (shapesArg !== "none") {
  shapes = shapesArg.split(",");
}

const port = 9400 + Math.floor(Math.random() * 400);
const profileDir = mkdtempSync(join(tmpdir(), "cidoe-perf-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--use-angle=metal", "--enable-gpu", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`, "--window-size=1728,1000", "--no-first-run", "about:blank",
], { stdio: "ignore" });
// Chrome órfão segura a porta de debug; perfil temporário não fica pra trás.
process.on("exit", () => {
  try { chrome.kill("SIGKILL"); } catch { /* já saiu */ }
  // Chrome ainda grava no perfil por alguns ms depois do kill (ENOTEMPTY): tenta de novo.
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
  } catch { /* Chrome ainda subindo */ }
}
if (!target) throw new Error("Chrome não abriu a porta de debug");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => { ws.onopen = resolve; });
let seq = 0;
const waiting = new Map();
// Erro/aviso do console da página (shader que não compila, exceção): sai no fim do relatório.
const consoleProblems = [];
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.id && waiting.has(data.id)) { waiting.get(data.id)(data); waiting.delete(data.id); }
  if (data.method === "Runtime.exceptionThrown") {
    consoleProblems.push(`exceção: ${data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text}`);
  }
  if (data.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(data.params.type)) {
    consoleProblems.push(`${data.params.type}: ${data.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ")}`);
  }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  waiting.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (reply.result?.exceptionDetails) throw new Error(JSON.stringify(reply.result.exceptionDetails).slice(0, 600));
  return reply.result.result.value;
};

// Roda antes do app: conta draw calls/triângulos por frame (tela × framebuffer offscreen = cube)
// e soma o tempo dos callbacks de rAF. Frame sem draw (cena parada) não entra.
const INJECT = `(() => {
  const s = window.__perf = { frames: [], on: false };
  const P = WebGL2RenderingContext.prototype;
  let offscreen = false, cur = null;
  const bind = P.bindFramebuffer;
  P.bindFramebuffer = function (t, fb) { if (t !== 0x8CA8) offscreen = fb !== null; return bind.call(this, t, fb); };
  for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const o = P[n];
    P[n] = function (...a) {
      if (cur) {
        const count = n.startsWith('drawElements') ? a[1] : a[2];
        const inst = n.endsWith('Instanced') ? a[a.length - 1] : 1;
        if (offscreen) { cur.offDraws++; cur.offTris += count / 3 * inst; } else { cur.draws++; cur.tris += count / 3 * inst; }
      }
      return o.apply(this, a);
    };
  }
  const raf = window.requestAnimationFrame.bind(window);
  let lastT = 0;
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (!cur || cur.t !== t) {
      if (cur && s.on && (cur.draws || cur.offDraws)) s.frames.push(cur);
      cur = { t, dt: t - lastT, js: 0, draws: 0, tris: 0, offDraws: 0, offTris: 0 };
      lastT = t;
    }
    const t0 = performance.now();
    try { cb(t); } finally { cur.js += performance.now() - t0; }
  });
})();`;

await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: INJECT });
await send("Page.navigate", { url: URL });

for (let i = 0; !(await evaluate("!!document.querySelector('canvas')")); i++) {
  if (i > 480) throw new Error(`canvas não apareceu em ${URL} — dev server no ar?`);
  await sleep(250);
}
// Fibra do React a partir do canvas: handle imperativo (addDonations) e estado do editor.
const FIBER = `(() => { const el = document.querySelector('canvas').parentElement;
  return el[Object.keys(el).find((k) => k.startsWith('__reactFiber'))]; })()`;
const gpu = await evaluate(`(() => {
  let f = ${FIBER};
  while (f && !(f.ref && f.ref.current && f.ref.current.addDonations)) f = f.return;
  if (!f) throw new Error('handle do canvas (addDonations) não encontrado');
  window.__handle = f.ref.current;
  const gl = document.querySelector('canvas').getContext('webgl2');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
})()`);

// Render é sob demanda: "pronto" = saiu frame e depois a cena ficou parada.
const settle = async (quietMs) => {
  await evaluate("window.__perf.on = true, window.__perf.frames.length = 0, 1");
  let last = -1;
  let quietSince = Date.now();
  for (const end = Date.now() + 240000; Date.now() < end;) {
    await sleep(500);
    const count = await evaluate("window.__perf.frames.length");
    if (count !== last) { last = count; quietSince = Date.now(); }
    else if (count > 0 && Date.now() - quietSince > quietMs) return;
  }
  throw new Error("cena não estabilizou");
};
await settle(2500);

// Só depois da cena pronta: emular antes impede a cena lazy de estabilizar.
if (process.env.DPR) {
  await send("Emulation.setDeviceMetricsOverride", { width: 1720, height: 990, deviceScaleFactor: Number(process.env.DPR), mobile: false });
  await sleep(1500);
}
const canvasSize = await evaluate("document.querySelector('canvas').width + '×' + document.querySelector('canvas').height");

// Estado React de reflexo (o hook cujo valor tem `followCamera`), sem tocar no código.
if (process.env.REFLECTION) {
  const patched = await evaluate(`(() => {
    for (let f = ${FIBER}; f; f = f.return) {
      for (let h = f.memoizedState; h && typeof h === 'object' && 'next' in h; h = h.next) {
        const state = h.memoizedState;
        if (state && typeof state === 'object' && 'followCamera' in state && h.queue?.dispatch) {
          h.queue.dispatch({ ...state, ...${process.env.REFLECTION} });
          return true;
        }
      }
    }
    return false;
  })()`);
  if (!patched) throw new Error("estado de reflexo não encontrado");
  await sleep(1000);
}

if (qty > 0) {
  const t0 = Date.now();
  // Semente fixa: mesmos valores e formatos a cada execução, pra comparar antes/depois.
  await evaluate(`(() => {
    const shapes = ${JSON.stringify(shapes)};
    const base = { color: '#d4d4d4', buildingShape: 'default', textureKey: null, tilingScale: 1,
      textureTransform: { offsetX: 0, offsetY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      rooftopType: 'none', signText: '', signSides: 1, edgeLightType: 'none',
      hologramImage: null, hologramColor: '#00ffff', hologramOpacity: 1 };
    let seed = 12345;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    window.__handle.addDonations(Array.from({ length: ${qty} }, () => {
      const value = 10 + random() * 990;
      return shapes.length
        ? { value, customization: { ...base, buildingShape: shapes[Math.floor(random() * shapes.length)], ...${process.env.CUSTOM ?? "{}"} } }
        : { value };
    }));
    return 1;
  })()`);
  await settle(4000);
  console.log(`lote criado e cena parada em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// Órbita contínua: arrasto real do mouse (OrbitControls), vai e volta na horizontal.
const drag = async (seconds) => {
  await evaluate("window.__perf.frames.length = 0, 1");
  let x = 500;
  const y = 600;
  let direction = 1;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  for (const end = Date.now() + seconds * 1000; Date.now() < end;) {
    x += 3 * direction;
    if (x > 1300 || x < 400) direction = -direction;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    await sleep(8);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  return JSON.parse(await evaluate("JSON.stringify(window.__perf.frames)"));
};
await drag(1.5); // aquece: compila programas, primeira captura
await sleep(500);
const frames = (await drag(6)).slice(2);

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
};
const average = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
// O custo de uma captura aparece no `js` do frame dela e no `dt` do frame seguinte.
const row = (name, list) => ({
  quadros: name,
  n: list.length,
  "dt med (ms)": +percentile(list.map((f) => f.dt), 0.5).toFixed(1),
  "dt p95 (ms)": +percentile(list.map((f) => f.dt), 0.95).toFixed(1),
  "js med (ms)": +percentile(list.map((f) => f.js), 0.5).toFixed(1),
  "draws tela": Math.round(average(list.map((f) => f.draws))),
  "tris tela (k)": Math.round(average(list.map((f) => f.tris)) / 1000),
  "draws cube": Math.round(average(list.map((f) => f.offDraws))),
  "tris cube (k)": Math.round(average(list.map((f) => f.offTris)) / 1000),
});
const fps = frames.length / (frames.reduce((sum, f) => sum + f.dt, 0) / 1000);
console.log(`\n+${qty} edifícios [${shapes.join(",") || "padrão instanciado"}]`);
console.log(`fps médio ${fps.toFixed(1)} | canvas ${canvasSize} | ${gpu}${process.env.REFLECTION ? ` | reflexo ${process.env.REFLECTION}` : ""}`);
console.table([
  row("todos", frames),
  row("sem captura do cube", frames.filter((f) => f.offDraws === 0)),
  row("com captura do cube", frames.filter((f) => f.offDraws > 0)),
]);

if (process.env.PROFILE) {
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 200 });
  await send("Profiler.start");
  await drag(4);
  const { result: { profile } } = await send("Profiler.stop");
  const nodes = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const self = new Map();
  for (const id of profile.samples) {
    const frame = nodes.get(id);
    const key = `${frame.functionName || "(anônima)"} ${frame.url.split("/").pop().split("?")[0]}:${frame.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + 1);
  }
  console.log("top self-time (CPU):");
  for (const [key, count] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`${(count / profile.samples.length * 100).toFixed(1).padStart(5)}%  ${key}`);
  }
}
if (process.env.CLICK) {
  const [x, y] = process.env.CLICK.split(",").map(Number);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
  await sleep(3000); // animação da câmera até o edifício em foco
}
if (process.env.SHOT) {
  const { result: { data } } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(process.env.SHOT, Buffer.from(data, "base64"));
  console.log(`tela salva em ${process.env.SHOT}`);
}
console.log(`console da página: ${consoleProblems.length} erro(s)/aviso(s)`);
for (const problem of [...new Set(consoleProblems)].slice(0, 12)) console.log(`  ${problem.slice(0, 400)}`);
ws.close();
process.exit(0);
