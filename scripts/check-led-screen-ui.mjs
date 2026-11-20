// node scripts/check-led-screen-ui.mjs — evento dos times + telão de LED no app de verdade
// (Chrome headless + CDP).
//
// Objetivo:
// 1. Evento: abre `?time=gremio` como visitante → modal único com as imagens e o login embutido →
//    entra por código (dentro do modal) → "Grêmio é seu time?" → lista e volta → aceita → conquista →
//    Continuar tira `?time` da URL. Nenhum outro modal abre por cima (onboarding do 1º login espera).
// 2. Telão: seleciona um edifício (fibra do React: clique na cena não funciona headless), abre
//    "Editar edifício", aba Telão só com as 3 imagens do Grêmio, escolhe 2 e o lado Direita. Confere
//    gravação (ordem e lado), uma troca do ciclo e console sem erro.
// 3. Trocar time pelo telão: modal por cima do editor → Flamengo → telão montado vira as mesmas
//    posições do Flamengo, aba mostra Flamengo e a troca some.
// Sessão, login e `/club/me` simulados por interceptação (Fetch do CDP): não cria conta nem manda
// e-mail; snapshot e catálogo vêm da API real. Câmera e confete: conferir nas telas (SHOTS).
//
// Precisa: dev server (http://localhost:5173) + API e Google Chrome. Variáveis: URL, CHROME, ID
// (edifício; padrão = maior seed do pré-lançamento), MOBILE=1 (390×844 com toque: editor vira modal
// e Trocar time abre modal sobre modal) e SHOTS=pasta pra salvar telas (conferência visual — apagar
// depois).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.URL ?? "http://localhost:5173/";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ID = Number(process.env.ID ?? -1_000_000);
const SHOTS = process.env.SHOTS;
const MOBILE = process.env.MOBILE === "1";

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
  const dialogs = await evaluate(`[...document.querySelectorAll('[role="dialog"][data-state="open"]')].map((d) => d.innerText.slice(0, 400))`).catch(() => []);
  throw new Error(`tempo esgotado: ${label} (diálogos abertos: ${JSON.stringify(dialogs)})`);
};
const shot = async (name) => {
  if (!SHOTS) return;
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
};

// --- API simulada: sessão, login por código, time do evento e rotas "me" da conta ---
const now = new Date().toISOString();
const api = { loggedIn: false, onboarded: false, club: null, changes: 0 };
const user = () => ({
  id: 4242, username: "torcedor", name: "Torcedor Teste", profile_image: null, email: "torcedor@cidoe.test",
  is_active: true, is_admin: false, city: null, discovery_source: null, discovery_source_other: null,
  onboarding_completed_at: api.onboarded ? now : null, terms_version: "2026-10-25", terms_accepted_at: now,
  last_login_at: now, created_at: now, updated_at: now,
});
const clubState = () => ({ data: { club: api.club, canChange: api.club === null || api.changes < 1 } });
function mockApi(method, path, body) {
  if (path === "/api/user/me" && method === "GET") return { data: api.loggedIn ? user() : null, expiresIn: 3600 };
  if (path === "/api/auth/login/request-code") return { challengeId: "c1", expiresAt: now, resendAvailableAt: now, debugCode: "123456" };
  if (path === "/api/auth/login/verify-code") { api.loggedIn = true; return { status: "authenticated", data: user(), expiresIn: 3600 }; }
  if (path === "/api/user/me/onboarding") { api.onboarded = true; return { data: user() }; }
  if (path === "/api/club/me" && method === "GET") return clubState();
  if (path === "/api/club/me" && method === "PUT") {
    const { club } = JSON.parse(body);
    if (api.club !== null && club !== api.club) api.changes += 1;
    api.club = club;
    return clubState();
  }
  if (path === "/api/referral/me") return { data: { code: "AAAAAAAA", link: `${URL}?ref=AAAAAAAA`, referral_count: 0, can_apply_referral: false, apply_deadline: now, referrer: null } };
  if (path === "/api/customization/me") return { data: { progress: { donated: 0, referrals: 0 }, unlockedOptionIds: [], unlockedCategoryKeys: [], pendingRewards: [], signupRewards: null } };
  return null;
}
const apiCalls = [];
ws.addEventListener("message", (message) => {
  const data = JSON.parse(message.data);
  if (data.method !== "Fetch.requestPaused") return;
  const { requestId, request } = data.params;
  const path = new globalThis.URL(request.url).pathname;
  const reply = mockApi(request.method, path, request.postData);
  if (!reply) return void send("Fetch.continueRequest", { requestId }).catch(() => {});
  apiCalls.push(`${request.method} ${path}`);
  send("Fetch.fulfillRequest", {
    requestId, responseCode: 200,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify(reply)).toString("base64"),
  }).catch(() => {});
});

await send("Runtime.enable");
await send("Page.enable");
await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] });
// Aviso de pré-lançamento (20 s) fora deste teste: tem check próprio.
await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("cidoe:prelaunch:status-seen", "1"); } catch {}` });
await send("Page.navigate", { url: `${URL}?time=gremio` });
await waitFor(`!!document.querySelector("canvas")`, "canvas da cena");
// Emular só depois do canvas: antes da navegação segurava a cena lazy.
await send("Emulation.setDeviceMetricsOverride", MOBILE
  ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
if (MOBILE) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await waitFor(`!document.querySelector(".ld")`, "loading inicial", 60_000);

// --- 1. Evento dos times ---
const openDialogs = `[...document.querySelectorAll('[role="dialog"][data-state="open"]')]`;
const top = `${openDialogs}.at(-1)`;
const title = `${top}?.querySelector("h2")?.textContent`;
const clickText = (label, scope = top) => evaluate(`(() => {
  const button = [...${scope}.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}));
  if (!button) throw new Error("botão ausente: " + ${JSON.stringify(label)});
  button.click();
})()`);
const typeInto = (selector, value) => evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
const clubTiles = `[...${top}.querySelectorAll('img[src^="/clubes/"]')].map((img) => img.getAttribute("src"))`;
const assertAlone = async (step) => assert.equal(await evaluate(`${openDialogs}.length`), 1, `outro modal aberto junto (${step})`);

await waitFor(`${title} === "Entrar"`, "modal do evento com login");
assert.deepEqual(await evaluate(clubTiles), [1, 2, 3].map((n) => `/clubes/gremio/${n}.webp`), "imagens do time do link no login");
await assertAlone("login");
await shot("0-evento-login");
await typeInto("#auth-email", "torcedor@cidoe.test");
await clickText("Continuar com E-mail");
await waitFor(`document.querySelector("#auth-code")?.value === "123456"`, "código (dev) preenchido");
await clickText("Continuar");
await waitFor(`${title} === "Grêmio é seu time?"`, "oferta depois do login");
await assertAlone("oferta (onboarding do 1º login espera)");
await shot("1-evento-oferta");
await clickText("Escolher outro time");
await waitFor(`${title} === "Escolha seu time"`, "lista de times");
assert.equal(await evaluate(`${top}.querySelectorAll("ul[aria-label='Times'] button").length`), 66, "66 times na lista");
await shot("2-evento-lista");
await clickText("Voltar");
await waitFor(`${title} === "Grêmio é seu time?"`, "voltar para a oferta");
await clickText("Sim, é meu time");
await waitFor(`${title} === "Imagens liberadas"`, "conquista");
await assertAlone("conquista");
await sleep(500);
await shot("3-evento-conquista");
await clickText("Continuar");
await waitFor(`${openDialogs}.every((dialog) => dialog.querySelector("h2")?.textContent !== "Imagens liberadas")`, "modal fechado");
assert.equal(new globalThis.URL(await evaluate("location.href")).searchParams.has("time"), false, "?time continua na URL");
assert.equal(api.club, "gremio");
// Onboarding do 1º login esperou o evento; agora aparece e é pulado.
await waitFor(`${title} === "Complete seu perfil"`, "onboarding depois do evento");
await clickText("Pular");
await waitFor(`${openDialogs}.length === 0`, "onboarding fechado");
console.log("Evento: login no modal, oferta, lista, conquista, URL limpa e onboarding depois OK.");

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
assert.deepEqual(images, ["Grêmio, imagem 1", "Grêmio, imagem 2", "Grêmio, imagem 3"], "aba Telão com as imagens do time");
// Um clique por render, como na mão.
for (const index of [0, 1]) {
  await evaluate(`${editor}.querySelectorAll('[role="tabpanel"][data-state="active"] [role="group"] button')[${index}].click()`);
  await sleep(250);
}
await sleep(300);
await evaluate(`[...${editor}.querySelectorAll('input[type="radio"]')].find((input) => input.value === "right").click()`);
// Câmera gira (0,8 s) e o salvamento tem debounce de 500 ms.
await sleep(1600);
await shot("4-telao-direita");

const pressed = await evaluate(`[...${editor}.querySelectorAll('[role="tabpanel"][data-state="active"] [role="group"] button[aria-pressed="true"]')].map((b) => b.getAttribute("aria-label"))`);
assert.deepEqual(pressed, [`${images[0]}, 1ª no telão`, `${images[1]}, 2ª no telão`]);
const saved = await evaluate(`JSON.parse(localStorage.getItem("cidoe:prelaunch:v1:guest:customizations") ?? "{}")[${JSON.stringify(String(ID))}] ?? null`);
assert.ok(saved, "personalização não foi gravada no navegador");
assert.equal(saved.screenSide, "right");
assert.deepEqual(saved.screenImages, ["gremio/1", "gremio/2"]);

// Uma troca do ciclo (7 s por imagem): a tela muda sozinha, com a cena parada.
await sleep(7600);
await shot("5-telao-troca");
console.log(`Telão no app: aba do time, ${images.length} imagens, ordem, lado Direita, gravação e ciclo OK.`);

// --- 3. Trocar time pelo telão: modal por cima do editor (último aberto), troca única ---
const screenPanel = `${editor}.querySelector('[role="tabpanel"][data-state="active"]')`;
await clickText("Trocar time", screenPanel);
await waitFor(`${title} === "Escolha seu time"`, "lista por cima do editor");
await typeInto(`[role="dialog"] input[type="search"]`, "flamengo");
await waitFor(`${top}.querySelectorAll("ul[aria-label='Times'] button").length === 1`, "busca");
await evaluate(`${top}.querySelector("ul[aria-label='Times'] button").click()`);
await waitFor(`${title} === "Flamengo é seu time?"`, "oferta da troca");
await clickText("Sim, é meu time");
await waitFor(`${title} === "Imagens liberadas"`, "conquista da troca");
await clickText("Continuar");
await waitFor(`!${openDialogs}.some((dialog) => dialog.querySelector("h2")?.textContent === "Imagens liberadas")`, "modal da troca fechado");
await waitFor(`${screenPanel}?.querySelector('[role="group"] button')?.getAttribute("aria-label")?.startsWith("Flamengo, imagem 1")`, "telão com o time novo");
await sleep(1200); // debounce de 500 ms da gravação
await shot("6-telao-flamengo");
const remapped = await evaluate(`[...${screenPanel}.querySelectorAll('[role="group"] button[aria-pressed="true"]')].map((b) => b.getAttribute("aria-label"))`);
assert.deepEqual(remapped, ["Flamengo, imagem 1, 1ª no telão", "Flamengo, imagem 2, 2ª no telão"], "telão não migrou para o time novo");
const resaved = await evaluate(`JSON.parse(localStorage.getItem("cidoe:prelaunch:v1:guest:customizations") ?? "{}")[${JSON.stringify(String(ID))}]`);
assert.deepEqual(resaved.screenImages, ["flamengo/1", "flamengo/2"]);
assert.equal(await evaluate(`[...${screenPanel}.querySelectorAll("button")].some((b) => b.textContent.trim() === "Trocar time")`), false, "troca usada ainda aparece");
assert.equal(api.club, "flamengo");
assert.equal(api.changes, 1);
assert.deepEqual(problems, [], `console com problema:\n${problems.join("\n")}`);
console.log("Trocar time: modal sobre o editor, troca única, telão migrado e console sem erro OK.");
process.exit(0);
