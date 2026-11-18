// node scripts/check-led-screen-ui.mjs — telão de LED no app de verdade (Chrome headless + CDP).
//
// Objetivo: seleciona um edifício (fibra do React: clique na cena não funciona headless), abre
// "Editar edifício", vai à aba Telão, escolhe as 2 primeiras imagens e o lado Direita. Confere a
// gravação no navegador (ordem e lado) e que o console não tem erro; espera uma troca de imagem do
// ciclo. Câmera virada pro telão e troca: conferir nas telas (SHOTS).
//
// Precisa: dev server (http://localhost:5173) e Google Chrome. Variáveis: URL, CHROME, ID (edifício;
// padrão = maior seed do pré-lançamento) e SHOTS=pasta pra salvar telas (conferência visual —
// apagar depois).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.URL ?? "http://localhost:5173/";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ID = Number(process.env.ID ?? -1_000_000);
const SHOTS = process.env.SHOTS;

const port = 9400 + Math.floor(Math.random() * 400);
const profileDir = mkdtempSync(join(tmpdir(), "cidoe-screen-"));
// Metal: SwiftShader deixava a cena em branco. Janela grande = painel lateral sobre a cena.
const chrome = spawn(CHROME, [
  "--headless=new", "--use-angle=metal", "--enable-gpu", `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`, "--window-size=1440,900", "--no-first-run", "about:blank",
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
  if (data.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(data.params.type)) {
    const text = data.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
    if (data.params.type === "error" || /Telão/.test(text)) problems.push(`${data.params.type}: ${text}`);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  waiting.set(id, (data) => (data.error ? reject(new Error(`${method}: ${data.error.message}`)) : resolve(data.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
};
const waitFor = async (expression, label, timeout = 30_000) => {
  for (const start = Date.now(); Date.now() - start < timeout; await sleep(250)) {
    if (await evaluate(expression)) return;
  }
  throw new Error(`tempo esgotado: ${label}`);
};
const shot = async (name) => {
  if (!SHOTS) return;
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
};

await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: URL });
await waitFor(`!!document.querySelector("canvas")`, "canvas da cena");
// Emular só depois do canvas: antes da navegação segurava a cena lazy.
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await waitFor(`!document.querySelector(".ld")`, "loading inicial", 60_000);

// Seleciona pelo handler da cena e abre o editor (botão funciona mesmo escondido).
await evaluate(`(() => {
  const host = document.querySelector("canvas").parentElement;
  let fiber = host[Object.keys(host).find((key) => key.startsWith("__reactFiber"))];
  while (fiber && !fiber.memoizedProps?.onBuildingClick) fiber = fiber.return;
  if (!fiber) throw new Error("onBuildingClick não encontrado");
  fiber.memoizedProps.onBuildingClick(${ID});
})()`);
await waitFor(`!!document.querySelector('[aria-label="Editar edifício"]')`, "botão Editar edifício");
await evaluate(`document.querySelector('[aria-label="Editar edifício"]').click()`);
const editor = `document.querySelector('section[aria-label="Personalizar edifício"]')`;
await waitFor(`!!${editor}?.querySelector('[role="tab"]')`, "editor de aparência");
await evaluate(`[...${editor}.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === "Telão").click()`);
await waitFor(`${editor}.querySelector('[role="tab"][data-state="active"]')?.textContent === "Telão"`, "aba Telão");
await sleep(600);

const images = await evaluate(`[...${editor}.querySelectorAll('[role="tabpanel"][data-state="active"] [role="group"] button')].map((b) => b.getAttribute("aria-label"))`);
assert.ok(images.length >= 2, `aba Telão sem imagens: ${images}`);
// Um clique por render, como na mão.
for (const index of [0, 1]) {
  await evaluate(`${editor}.querySelectorAll('[role="tabpanel"][data-state="active"] [role="group"] button')[${index}].click()`);
  await sleep(250);
}
await sleep(300);
await evaluate(`[...${editor}.querySelectorAll('input[type="radio"]')].find((input) => input.value === "right").click()`);
// Câmera gira (0,8 s) e o salvamento tem debounce de 500 ms.
await sleep(1600);
await shot("1-telao-direita");

const pressed = await evaluate(`[...${editor}.querySelectorAll('[role="tabpanel"][data-state="active"] [role="group"] button[aria-pressed="true"]')].map((b) => b.getAttribute("aria-label"))`);
assert.deepEqual(pressed, [`${images[0]}, 1ª no telão`, `${images[1]}, 2ª no telão`]);
const saved = await evaluate(`JSON.parse(localStorage.getItem("cidoe:prelaunch:v1:guest:customizations") ?? "{}")[${JSON.stringify(String(ID))}] ?? null`);
assert.ok(saved, "personalização não foi gravada no navegador");
assert.equal(saved.screenSide, "right");
assert.equal(saved.screenImages.length, 2, `imagens gravadas: ${saved.screenImages}`);

// Uma troca do ciclo (7 s por imagem): a tela muda sozinha, com a cena parada.
await sleep(7600);
await shot("2-telao-troca");
assert.deepEqual(problems, [], `console com problema:\n${problems.join("\n")}`);
console.log(`Telão no app: aba, ${images.length} imagens, ordem, lado Direita, gravação e ciclo sem erro no console.`);
process.exit(0);
