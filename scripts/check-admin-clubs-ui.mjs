// node scripts/check-admin-clubs-ui.mjs — painel /dale/times (evento dos times) no app de verdade
// (Chrome headless + CDP).
//
// Sessão do painel e rotas /api/admin/club-event simuladas por interceptação com as regras do back
// (slug/nome únicos, teto de 12 imagens, número = maior + 1, assinatura e tamanho da imagem): sem
// servidor nem banco. Confere: números do evento, liga/desliga, busca, copiar link (área de
// transferência), ativar/desativar time, criar time (slug sugerido pelo nome) → imagens na hora
// (várias de uma vez, recorte quadrado 256 px + miniatura 96 px em WebP pelo canvas), trocar,
// remover com confirmação, arquivo inválido, apelido (criar, editar, remover), renomear, excluir, sem rolagem lateral e console limpo.
//
// Precisa: dev server (http://localhost:5173) e Google Chrome. Variáveis: URL, CHROME, MOBILE=1
// (390×844) e SHOTS=pasta pra salvar telas (conferência visual — apagar depois).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const URL = process.env.URL ?? "http://localhost:5173/";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SHOTS;
const MOBILE = process.env.MOBILE === "1";

const port = 9400 + Math.floor(Math.random() * 400);
const profileDir = mkdtempSync(join(tmpdir(), "cidoe-admin-clubs-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  "--window-size=1440,900", "--no-first-run", "about:blank",
], { stdio: "ignore" });
// Chrome órfão segura a porta de debug; perfil (e arquivos de teste dentro dele) não fica pra trás.
process.on("exit", () => {
  try { chrome.kill("SIGKILL"); } catch { /* já saiu */ }
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Arquivos de teste: WebP do repo, PNG 600×300 (recorte), texto disfarçado de imagem ---
const FIXTURE = new globalThis.URL("./fixtures/telao.webp", import.meta.url).pathname;
function png(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(x < width / 2 ? [200, 30, 30] : [30, 30, 200], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const WIDE = join(profileDir, "largo.png");
writeFileSync(WIDE, png(600, 300));
const FAKE = join(profileDir, "falso.png");
writeFileSync(FAKE, "isto não é imagem");

/** Largura × altura de um WebP (VP8, VP8L ou VP8X). */
function webpSize(buf) {
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8X") return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === "VP8L") { const bits = buf.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]; }
  return null;
}

// --- Chrome + CDP ---
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
const choosers = [];
ws.onmessage = (message) => {
  const data = JSON.parse(message.data);
  if (data.id && waiting.has(data.id)) { waiting.get(data.id)(data); waiting.delete(data.id); }
  if (data.method === "Runtime.exceptionThrown") problems.push(`exceção: ${data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text}`);
  if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
    problems.push(`error: ${data.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ")}`);
  }
  if (data.method === "Page.fileChooserOpened") choosers.push(data.params);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  waiting.set(id, (data) => (data.error ? reject(new Error(`${method}: ${data.error.message}`)) : resolve(data.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
};
const waitFor = async (expression, label, timeout = 20_000) => {
  for (const start = Date.now(); Date.now() - start < timeout; await sleep(150)) {
    if (await evaluate(expression)) return;
  }
  throw new Error(`tempo esgotado: ${label}\n${await evaluate("document.body.innerText.slice(0, 1500)").catch(() => "")}`);
};
const shot = async (name) => {
  if (!SHOTS) return;
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"));
};

// --- API do painel simulada, com as regras do back ---
const now = new Date().toISOString();
const SEED = readFileSync(FIXTURE);
let version = 1;
const bytes = new Map(); // "slug/n" → { image, thumb }
const image = (slug, number) => ({ number, url: `/api/club/images/${slug}/${number}?v=${version}`, thumbUrl: `/api/club/images/${slug}/${number}/thumb?v=${version}` });
const team = (slug, name, count, isActive, fans, nickname = null) => ({ slug, name, nickname, isActive, fans, createdAt: now, images: Array.from({ length: count }, (_, i) => image(slug, i + 1)) });
const state = {
  isActive: true, participants: 3, changesUsed: 1,
  clubs: [team("flamengo", "Flamengo", 3, true, 2), team("gremio", "Grêmio", 3, true, 1), team("santos", "Santos", 3, false, 0), team("sem-imagem", "Sem Imagem", 0, true, 0)],
};
const uploads = [];
const adminCalls = [];
const findClub = (slug) => state.clubs.find((club) => club.slug === slug);
function decode(dataUrl, max) {
  const match = /^data:image\/webp;base64,(.+)$/.exec(dataUrl ?? "");
  const buf = match && Buffer.from(match[1], "base64");
  return buf && buf.toString("ascii", 8, 12) === "WEBP" && buf.length <= max ? buf : null;
}
function adminApi(method, path, body) {
  const input = body ? JSON.parse(body) : {};
  if (path === "/api/admin/auth/me") return [200, { data: { id: 1, username: "admin", email: "admin@cidoe.test", is_admin: true, is_active: true }, expiresIn: 3600 }];
  if (path === "/api/admin/club-event" && method === "GET") return [200, { data: state }];
  if (path === "/api/admin/club-event" && method === "PUT") { state.isActive = input.isActive; return [200, { data: { isActive: state.isActive } }]; }
  if (path === "/api/admin/club-event/clubs" && method === "POST") {
    if (findClub(input.slug) || state.clubs.some((club) => club.name.toLowerCase() === input.name.toLowerCase())) return [409, { message: "Já existe um time com esse slug ou nome." }];
    const club = team(input.slug, input.name, 0, input.isActive, 0, input.nickname ?? null);
    state.clubs.push(club);
    return [201, { data: club }];
  }
  const match = /^\/api\/admin\/club-event\/clubs\/([a-z0-9-]+)(?:\/images(?:\/(\d+))?)?$/.exec(path);
  const club = match && findClub(match[1]);
  if (!club) return [404, { message: "Time não encontrado" }];
  const number = match[2] && Number(match[2]);
  if (path.endsWith("/images") && method === "POST" || number && method === "PUT") {
    const pair = { image: decode(input.image, 300_000), thumb: decode(input.thumb, 60_000) };
    if (!pair.image || !pair.thumb) return [400, { message: "Imagem inválida. Use JPEG, PNG ou WebP." }];
    uploads.push({ image: webpSize(pair.image), thumb: webpSize(pair.thumb) });
    version += 1;
    if (method === "POST") {
      if (club.images.length >= 12) return [400, { message: "Limite de 12 imagens por time." }];
      const next = Math.max(0, ...club.images.map((item) => item.number)) + 1;
      club.images.push(image(club.slug, next));
      bytes.set(`${club.slug}/${next}`, pair);
    } else {
      const index = club.images.findIndex((item) => item.number === number);
      if (index < 0) return [404, { message: "Imagem não encontrada" }];
      club.images[index] = image(club.slug, number);
      bytes.set(`${club.slug}/${number}`, pair);
    }
    return [method === "POST" ? 201 : 200, { data: club }];
  }
  if (number && method === "DELETE") {
    if (!club.images.some((item) => item.number === number)) return [404, { message: "Imagem não encontrada" }];
    club.images = club.images.filter((item) => item.number !== number);
    return [200, { data: club }];
  }
  if (method === "PUT") { Object.assign(club, input); return [200, { data: club }]; }
  if (method === "DELETE") {
    state.participants -= club.fans;
    state.clubs = state.clubs.filter((item) => item !== club);
    return [200, { message: "Time excluído" }];
  }
  return [404, { message: "rota não simulada" }];
}
ws.addEventListener("message", (message) => {
  const data = JSON.parse(message.data);
  if (data.method !== "Fetch.requestPaused") return;
  const { requestId, request } = data.params;
  const path = new globalThis.URL(request.url).pathname;
  const imageMatch = /^\/api\/club\/images\/([a-z0-9-]+)\/(\d+)(\/thumb)?$/.exec(path);
  if (imageMatch) {
    const stored = bytes.get(`${imageMatch[1]}/${imageMatch[2]}`);
    const body = stored ? stored[imageMatch[3] ? "thumb" : "image"] : SEED;
    return void send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "image/webp" }], body: body.toString("base64") }).catch(() => {});
  }
  if (!path.startsWith("/api/admin/")) return void send("Fetch.continueRequest", { requestId }).catch(() => {});
  adminCalls.push(`${request.method} ${path}`);
  const [status, reply] = adminApi(request.method, path, request.postData);
  send("Fetch.fulfillRequest", {
    requestId, responseCode: status, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify(reply)).toString("base64"),
  }).catch(() => {});
});

await send("Runtime.enable");
await send("Page.enable");
await send("DOM.enable");
// Headless não tem foco de janela: a área de transferência exige documento focado.
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Page.setInterceptFileChooserDialog", { enabled: true });
await send("Browser.grantPermissions", { origin: new globalThis.URL(URL).origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*", requestStage: "Request" }] });
await send("Emulation.setDeviceMetricsOverride", MOBILE
  ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: new globalThis.URL("/dale/times", URL).href });

// --- Helpers de tela ---
const dialog = `[...document.querySelectorAll('[role="dialog"][data-state="open"]')].at(-1)`;
const bodyText = () => evaluate("document.body.innerText");
const click = (label, scope = "document") => evaluate(`(() => {
  const el = [...${scope}.querySelectorAll("button, [role=switch]")].find((b) => (b.getAttribute("aria-label") ?? b.textContent.trim()) === ${JSON.stringify(label)} || b.textContent.trim() === ${JSON.stringify(label)});
  if (!el) throw new Error("botão ausente: " + ${JSON.stringify(label)});
  if (el.disabled) throw new Error("botão desabilitado: " + ${JSON.stringify(label)});
  el.click();
})()`);
const typeInto = (selector, value) => evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
/** Clica no botão que abre o seletor de arquivo e entrega `files` ao input que ele abriu. */
async function choose(label, files) {
  choosers.length = 0;
  await click(label, dialog);
  for (let i = 0; i < 40 && !choosers.length; i++) await sleep(50);
  assert.ok(choosers.length, `seletor de arquivo não abriu (${label})`);
  await send("DOM.setFileInputFiles", { files, backendNodeId: choosers[0].backendNodeId });
}
const imageTiles = () => evaluate(`[...${dialog}.querySelectorAll('section[aria-labelledby="club-images"] li img')].map((img) => img.getAttribute("src"))`);
const rows = () => evaluate(`[...document.querySelectorAll("main ul > li")].map((li) => li.querySelector("p")?.textContent)`);
const noSideScroll = async (step) => assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `rolagem lateral (${step})`);

// --- Evento: números, link, liga/desliga ---
await waitFor(`document.body.innerText.includes("Participantes")`, "página do evento");
// Celular: o item mora no menu da barra inferior (fechado).
if (!MOBILE) assert.ok(await evaluate(`[...document.querySelectorAll("a")].some((a) => a.getAttribute("href") === "/dale/times")`), "menu sem Evento dos times");
const stats = await evaluate(`[...document.querySelectorAll("dl > div")].map((d) => d.innerText.replace(/\\s+/g, " ").trim())`);
assert.deepEqual(stats, ["Participantes 3", "Trocas usadas 1", "Na lista 2"], "números do evento (Na lista = ativo com imagem)");
assert.deepEqual(await rows(), ["Flamengo", "Grêmio", "Santos", "Sem Imagem"]);
assert.match(await bodyText(), /Sem imagem/);
await noSideScroll("lista");
await shot("0-evento");
await click("Copiar link da lista");
await waitFor(`navigator.clipboard.readText().then((text) => text === "https://cidoe.com.br/?time=")`, "link da lista copiado");
await evaluate(`document.querySelector("#club-event-active").click()`);
await waitFor(`document.querySelector("#club-event-active")?.getAttribute("aria-checked") === "false"`, "evento desligado");
assert.equal(state.isActive, false);
await waitFor(`document.body.innerText.includes("Evento desligado.")`, "aviso de evento desligado");
console.log("Evento: números, menu, link da lista copiado e liga/desliga OK.");

// --- Times: busca, copiar link, ativar/desativar ---
await typeInto('input[aria-label="Buscar time"]', "gre");
await waitFor(`document.querySelectorAll("main ul > li").length === 1`, "busca");
assert.deepEqual(await rows(), ["Grêmio"]);
await click("Copiar link: Grêmio");
await waitFor(`navigator.clipboard.readText().then((text) => text === "https://cidoe.com.br/?time=gremio")`, "link do Grêmio copiado");
await waitFor(`document.body.innerText.includes("Link copiado")`, "aviso de link copiado");
await click("Time ativo: Grêmio");
await waitFor(`document.body.innerText.includes("Grêmio: desativado.")`, "Grêmio desativado");
assert.equal(findClub("gremio").isActive, false);
assert.match(await evaluate(`document.querySelector("main ul > li").innerText`), /Inativo/);
await typeInto('input[aria-label="Buscar time"]', "");
console.log("Times: busca, link do time copiado e ativar/desativar OK.");

// --- Criar time → imagens ---
await click("Adicionar time");
await waitFor(`${dialog}?.querySelector("h2")?.textContent === "Adicionar time"`, "editor de time");
await typeInto("#club-name", "São José Teste");
assert.equal(await evaluate(`document.querySelector("#club-slug").value`), "sao-jose-teste", "slug sugerido pelo nome");
await typeInto("#club-slug", "Inválido!");
assert.equal(await evaluate(`[...${dialog}.querySelectorAll("button[type=submit]")][0].disabled`), true, "slug inválido liberou salvar");
await typeInto("#club-slug", "sao-jose-teste");
await typeInto("#club-nickname", "  Zequinha ");
await click("Salvar", dialog);
await waitFor(`${dialog}?.querySelector("h2")?.textContent === "Editar time"`, "time criado vira edição");
assert.match(await evaluate(`${dialog}.innerText`), /Time cadastrado\. Adicione as imagens\./);
assert.equal(findClub("sao-jose-teste").nickname, "Zequinha", "apelido não foi aparado no envio");
assert.match(await evaluate(`${dialog}.innerText`), /https:\/\/cidoe\.com\.br\/\?time=sao-jose-teste/);
await choose("Adicionar imagem", [FIXTURE, WIDE]);
await waitFor(`${dialog}.querySelectorAll('section[aria-labelledby="club-images"] li').length === 2`, "duas imagens enviadas");
assert.deepEqual(uploads, [{ image: [256, 256], thumb: [96, 96] }, { image: [256, 256], thumb: [96, 96] }], "imagem 256 px + miniatura 96 px quadradas (PNG 600×300 recortado)");
assert.match(await evaluate(`${dialog}.innerText`), /2\/12/);
assert.match(await evaluate(`${dialog}.querySelector('section[aria-labelledby="club-images"] li').innerText`), /Capa/);
await shot("1-imagens");

const beforeReplace = (await imageTiles())[1];
await choose("Trocar imagem 2", [FIXTURE]);
await waitFor(`${dialog}.querySelectorAll('section[aria-labelledby="club-images"] li img')[1]?.getAttribute("src") !== ${JSON.stringify(beforeReplace)}`, "imagem 2 trocada (versão nova)");
assert.ok(adminCalls.includes("PUT /api/admin/club-event/clubs/sao-jose-teste/images/2"), "troca não foi para a imagem 2");

await click("Remover imagem 1", dialog);
assert.ok(!adminCalls.some((call) => call.startsWith("DELETE")), "removeu sem confirmar");
await click("Remover", dialog);
await waitFor(`${dialog}.querySelectorAll('section[aria-labelledby="club-images"] li').length === 1`, "imagem removida");
assert.ok(adminCalls.includes("DELETE /api/admin/club-event/clubs/sao-jose-teste/images/1"));
assert.match((await imageTiles())[0], /\/api\/club\/images\/sao-jose-teste\/2\?v=\d+$/, "sobra a imagem 2 (número estável)");
assert.match(await evaluate(`${dialog}.querySelector('section[aria-labelledby="club-images"] li').innerText`), /Capa/, "capa passa para a primeira que sobrou");

const before = adminCalls.length;
await choose("Adicionar imagem", [FAKE]);
await waitFor(`${dialog}.querySelector('[role="alert"]')?.textContent.includes("não é uma imagem válida")`, "arquivo falso recusado");
assert.equal(adminCalls.length, before, "arquivo falso chegou na API");
await noSideScroll("editor");
await click("Fechar", dialog);
await waitFor(`!${dialog}`, "editor fechado");
assert.match(await evaluate(`[...document.querySelectorAll("main ul > li")].find((li) => li.innerText.includes("São José Teste"))?.innerText ?? ""`), /sao-jose-teste · 0 torcedores · 1 imagem/);
console.log("Criar time: slug sugerido, imagens (várias, recorte quadrado, miniatura), trocar, remover com confirmação e arquivo falso OK.");

// --- Renomear e excluir ---
await click("Editar São José Teste");
await waitFor(`${dialog}?.querySelector("h2")?.textContent === "Editar time"`, "editor de edição");
await typeInto("#club-name", "São José Renomeado");
assert.equal(await evaluate(`document.querySelector("#club-nickname").value`), "Zequinha", "edição sem o apelido gravado");
await typeInto("#club-nickname", "");
await click("Salvar", dialog);
await waitFor(`!${dialog} && document.body.innerText.includes("São José Renomeado")`, "renomeado");
assert.equal(findClub("sao-jose-teste").name, "São José Renomeado");
assert.equal(findClub("sao-jose-teste").nickname, null, "apelido apagado não virou null (remover)");
await click("Excluir Flamengo");
await waitFor(`${dialog}?.innerText.includes("2 torcedores ficam sem time")`, "confirmação com torcedores");
await click("Excluir time", dialog);
await waitFor(`document.body.innerText.includes("Flamengo foi excluído.") && ![...document.querySelectorAll("main ul > li")].some((li) => li.innerText.includes("Flamengo"))`, "Flamengo excluído");
await waitFor(`[...document.querySelectorAll("dl > div")][0]?.innerText.replace(/\\s+/g, " ").trim() === "Participantes 1"`, "números recarregados");
await shot("2-final");
assert.deepEqual(problems, [], `console com problema:\n${problems.join("\n")}`);
console.log("Apelido (aparado, editado, removido), renomear, excluir com aviso de torcedores, números recarregados e console limpo OK.");
process.exit(0);
