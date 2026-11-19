// node scripts/measure-city-load.mjs — mede a abertura da cidade (sem afirmar nada).
//
// Objetivo: tempo até a cidade utilizável, igual antes/depois de mexer no carregamento.
// Marcos por rodada: FCP/LCP, dados (`cidoe:dados`), 1º desenho WebGL, cidade pronta
// (`cidoe:cidade-pronta`), saída do loading começa (cidade clicável) e loading some.
// Também bytes por tipo e tarefas longas. Imprime mediana por cenário.
//
// Precisa: Google Chrome. URL padrão = `vite preview` (http://localhost:4173/, /api via proxy
// + API :3000); produção: URL=https://cidoe.com.br/. Variáveis: RUNS (padrão 3), MODE
// (all | desktop | warm | mobile), CHROME.
// Cenários: desktop frio (perfil novo), desktop quente (2ª navegação no mesmo perfil), mobile
// frio (390×844, CPU 4×, 9 Mbps / 1,5 Mbps, RTT 150 ms). Mobile aqui é janela pequena SEM
// emulação de aparelho (emular antes de navegar trava o chunk lazy): `IS_LOW_TIER` fica falso
// e baixa texturas 1K. Celular de verdade (texturas 512): mesmas marcas via adb + CDP.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.URL ?? "http://localhost:4173/";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const RUNS = Number(process.env.RUNS ?? 3);
const MODE = process.env.MODE ?? "all";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Amostra por frame desde o 1º script: loading (.ld), saída ([data-last]), canvas, 1º draw.
const PROBE = `
  window.__cl = { lcp: 0, longTasks: [], firstDraw: null, canvasAt: null, exitAt: null, goneAt: null };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cl.lcp = e.startTime; })
    .observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cl.longTasks.push([e.startTime, e.duration]); })
    .observe({ type: "longtask", buffered: true });
  const proto = WebGL2RenderingContext.prototype;
  for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
    const original = proto[name];
    proto[name] = function (...args) { window.__cl.firstDraw ??= performance.now(); return original.apply(this, args); };
  }
  let seen = false;
  const sample = () => {
    const root = document.querySelector(".ld");
    seen ||= !!root;
    if (document.querySelector("canvas")) window.__cl.canvasAt ??= performance.now();
    if (root?.querySelector("[data-last]") || root?.classList.contains("pointer-events-none")) window.__cl.exitAt ??= performance.now();
    if (seen && !root) { window.__cl.goneAt = performance.now(); return; }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
`;

const READ = `(() => {
  const mark = (name) => performance.getEntriesByName(name)[0]?.startTime ?? null;
  const nav = performance.getEntriesByType("navigation")[0];
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null;
  const resources = performance.getEntriesByType("resource").map((r) => ({
    name: r.name, transfer: r.transferSize, decoded: r.decodedBodySize, start: r.startTime, end: r.responseEnd,
  }));
  const snapshot = resources.find((r) => r.name.includes("/api/donation/snapshot"));
  const tbt = window.__cl.longTasks.filter(([s]) => s > fcp).reduce((sum, [, d]) => sum + Math.max(0, d - 50), 0);
  return {
    ttfb: nav.responseStart, fcp, lcp: window.__cl.lcp,
    snapshotStart: snapshot?.start ?? null, snapshotEnd: snapshot?.end ?? null, data: mark("cidoe:dados"),
    canvas: window.__cl.canvasAt, firstDraw: window.__cl.firstDraw, applied: mark("cidoe:doacoes-aplicadas"),
    ready: mark("cidoe:cidade-pronta"), exit: window.__cl.exitAt, gone: window.__cl.goneAt,
    longTasks: window.__cl.longTasks.length, longest: Math.max(0, ...window.__cl.longTasks.map(([, d]) => d)), tbt,
    resources,
  };
})()`;

const KIND = [
  [/\/api\//, "api"], [/\.js(\?|$)/, "js"], [/\.css(\?|$)/, "css"], [/\.woff2(\?|$)/, "fonte"],
  [/Facade.*\.(webp|png|jpe?g|ktx2)/i, "fachada"], [/Concrete.*\.(webp|png|jpe?g|ktx2)/i, "topo"],
  [/(HDRI|sky|pmrem).*\.(webp|png|jpe?g|hdr)/i, "céu"], [/\.(webp|png|jpe?g|gif|svg)(\?|$)/i, "imagem"],
];
const kindOf = (url) => KIND.find(([re]) => re.test(url))?.[1] ?? "outro";

async function openChrome(mobile) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const profileDir = mkdtempSync(join(tmpdir(), "cidoe-load-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--use-angle=metal", "--enable-gpu", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`, `--window-size=${mobile ? "390,844" : "1440,900"}`, "--no-first-run", "about:blank",
  ], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page"); } catch { /* subindo */ }
  }
  if (!target) throw new Error("Chrome não abriu a porta de debug");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let seq = 0;
  const waiting = new Map();
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && waiting.has(data.id)) { waiting.get(data.id)(data); waiting.delete(data.id); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    waiting.set(id, (data) => (data.error ? reject(new Error(`${method}: ${data.error.message}`)) : resolve(data.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send("Page.enable");
  await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
  if (mobile) {
    await send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await send("Network.emulateNetworkConditions", {
      offline: false, latency: 150, downloadThroughput: 1_125_000, uploadThroughput: 187_500,
    });
  }
  const close = () => {
    try { chrome.kill("SIGKILL"); } catch { /* já saiu */ }
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  return { send, close };
}

async function load(send) {
  await send("Page.navigate", { url: URL });
  for (let i = 0; i < 300; i++) {
    await sleep(100);
    const done = (await send("Runtime.evaluate", { expression: "window.__cl?.goneAt != null", returnByValue: true })).result.value;
    if (done) break;
  }
  await sleep(500);
  return (await send("Runtime.evaluate", { expression: READ, returnByValue: true })).result.value;
}

async function scenario(name, mobile, warm) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const { send, close } = await openChrome(mobile);
    try {
      if (warm) await load(send);
      runs.push(await load(send));
    } finally {
      close();
    }
  }
  return { name, runs };
}

const median = (values) => {
  const list = values.filter((v) => v != null).sort((a, b) => a - b);
  return list.length ? list[Math.floor((list.length - 1) / 2)] : null;
};
const ms = (v) => (v == null ? "—" : String(Math.round(v)));

const scenarios = [];
if (MODE === "all" || MODE === "desktop") scenarios.push(await scenario("desktop frio", false, false));
if (MODE === "all" || MODE === "warm") scenarios.push(await scenario("desktop quente", false, true));
if (MODE === "all" || MODE === "mobile") scenarios.push(await scenario("mobile frio", true, false));

const ROWS = [
  ["TTFB", "ttfb"], ["FCP", "fcp"], ["LCP", "lcp"], ["snapshot início", "snapshotStart"], ["snapshot fim", "snapshotEnd"],
  ["dados prontos", "data"], ["canvas", "canvas"], ["1º desenho", "firstDraw"], ["doações aplicadas", "applied"],
  ["cidade pronta", "ready"], ["saída começa (clicável)", "exit"], ["loading some", "gone"],
  ["tarefas longas (n)", "longTasks"], ["tarefa mais longa", "longest"], ["TBT após FCP", "tbt"],
];
console.log(`\nURL ${URL} · ${RUNS} rodada(s) · mediana em ms\n`);
console.log(["marco", ...scenarios.map((s) => s.name)].join(" | "));
for (const [label, key] of ROWS) console.log([label, ...scenarios.map((s) => ms(median(s.runs.map((r) => r[key]))))].join(" | "));

console.log("\nKB transferidos por tipo (mediana)");
const kinds = [...new Set(KIND.map(([, k]) => k)), "outro"];
console.log(["tipo", ...scenarios.map((s) => s.name)].join(" | "));
for (const kind of kinds) {
  const cells = scenarios.map((s) => median(s.runs.map((r) => r.resources.filter((x) => kindOf(x.name) === kind).reduce((n, x) => n + x.transfer, 0))));
  if (cells.some(Boolean)) console.log([kind, ...cells.map((v) => (v / 1024).toFixed(0))].join(" | "));
}
process.exit(0);
