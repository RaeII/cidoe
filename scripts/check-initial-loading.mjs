// node scripts/check-initial-loading.mjs — loading inicial (InitialLoading) no navegador de verdade.
//
// Objetivo: o HTML pré-renderizado já traz a entrada em CSS; a tela monta 3 vezes (HTML → casca →
// editor) e a entrada NÃO pode recomeçar; a barra só anda pra frente e chega a 100%; a tela sai
// (papel em blocos) e desmonta; console sem erro (hidratação incluída).
//
// Precisa: `npm run build` + `npx vite preview` (http://localhost:4173, /api via proxy) + API (:3000)
// no ar e Google Chrome instalado. Dev (5173) também roda, mas lá não há HTML pré-renderizado.
// Variáveis: URL e CHROME trocam endereço/binário; SHOTS=pasta salva telas em 0,4 s, 1 s, 2 s e na
// saída (conferência visual — apagar depois); MOBILE=1 abre a janela em 390×844 (sem emulação de
// aparelho: emular antes de navegar segura a cena lazy); REDUCE=1 liga prefers-reduced-motion (sem
// entrada, barra direta, saída por fade).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.URL ?? "http://localhost:4173/";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SHOTS;

const port = 9400 + Math.floor(Math.random() * 400);
const profileDir = mkdtempSync(join(tmpdir(), "cidoe-loading-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--use-angle=metal", "--enable-gpu", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`, `--window-size=${process.env.MOBILE ? "390,844" : "1440,900"}`, "--no-first-run", "about:blank",
], { stdio: "ignore" });
// Chrome órfão segura a porta de debug; perfil temporário não fica pra trás.
process.on("exit", () => {
  try { chrome.kill("SIGKILL"); } catch { /* já saiu */ }
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
const problems = [];
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.id && waiting.has(data.id)) { waiting.get(data.id)(data); waiting.delete(data.id); }
  if (data.method === "Runtime.exceptionThrown") problems.push(`exceção: ${data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text}`);
  if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
    problems.push(`error: ${data.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ")}`);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  waiting.set(id, (data) => (data.error ? reject(new Error(`${method}: ${data.error.message}`)) : resolve(data.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
const shot = async (name) => {
  if (!SHOTS) return;
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
};

await send("Runtime.enable");
await send("Page.enable");
if (process.env.REDUCE) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
// Amostra por frame desde o 1º script: última letra do nome, metade direita da logo, % e quantas vezes a tela montou.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  window.__ld = { samples: [], mounts: 0, goneAt: null };
  let last = null;
  const sample = () => {
    const root = document.querySelector(".ld");
    if (root && root !== last) window.__ld.mounts++;
    last = root;
    const letter = root?.querySelector("p > span[aria-hidden] > span:last-child");
    const half = root?.querySelectorAll("svg g[clip-path] > path")[1];
    window.__ld.samples.push({
      t: performance.now(),
      letter: letter ? Number(getComputedStyle(letter).opacity) : null,
      half: half ? parseFloat(getComputedStyle(half).translate.split(" ")[1] ?? "0") || 0 : null,
      pct: root?.querySelector(".font-mono.text-primary")?.textContent ?? null,
    });
    if (!root && window.__ld.mounts) window.__ld.goneAt ??= performance.now();
    else requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
` });

const started = Date.now();
await send("Page.navigate", { url: URL });
for (const [at, name] of [[400, "1-entrada"], [1000, "2-logo"], [2000, "3-barra"]]) {
  await sleep(Math.max(0, at - (Date.now() - started)));
  await shot(name);
}
let exitShot = false;
for (let i = 0; i < 600; i++) {
  const state = await evaluate(`({ gone: window.__ld?.goneAt != null, exiting: !!document.querySelector(".ld [data-last]") })`);
  if (state.exiting && !exitShot) { exitShot = true; await sleep(150); await shot("4-saida"); }
  if (state.gone) break;
  await sleep(100);
}
await sleep(300);
await shot("5-cena");
const { samples, mounts, goneAt } = await evaluate("window.__ld");

assert.ok(goneAt, "Loading sai e desmonta depois da cidade pronta");
assert.ok(mounts >= 1, "Loading montou");
const shown = samples.filter((s) => s.letter !== null);
const firstFull = shown.findIndex((s) => s.letter > 0.99);
assert.ok(firstFull >= 0, "Nome termina de entrar");
assert.ok(shown.slice(firstFull).every((s) => s.letter > 0.99), "Nome não some/recomeça depois de entrar (remontagem sincronizada)");
const halfDone = shown.findIndex((s) => Math.abs(s.half) < 1);
assert.ok(halfDone >= 0 && shown.slice(halfDone).every((s) => Math.abs(s.half) < 1), "Logo não volta pro chão depois de montada");
const pcts = shown.map((s) => s.pct).filter(Boolean).map((p) => Number(p.replace("%", "")));
assert.ok(pcts.every((p, i) => i === 0 || p >= pcts[i - 1]), "Barra só anda pra frente");
assert.equal(pcts.at(-1), 100, "Barra chega a 100%");
assert.deepEqual(problems, [], "Console sem erro");
console.log(`Loading inicial: ${mounts} montagens sem recomeçar, barra até 100%, saiu em ${(goneAt / 1000).toFixed(1)} s, console limpo.`);
process.exit(0);
