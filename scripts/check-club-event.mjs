// node scripts/check-club-event.mjs — evento dos times, sem servidor/navegador.
// Confere: contrato com o back (formato do slug e da key do telão, teto de imagens, se ../cidoa-back
// existir); key do telão → URL da API; catálogo (lib/clubs.ts): busca sem acento só com ativos, time
// do link, troca por posição; e o modal real (ClubEventDialog) em todos os estados: catálogo
// carregando/erro, evento desligado, login, carregando, erro, oferta, lista, meu time, conquista,
// troca usada, time inativo, 409 e fechar durante o salvamento.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import { build } from "esbuild";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);
async function bundle(path) {
  const { outputFiles } = await build({ entryPoints: [path], bundle: true, format: "cjs", platform: "node", write: false });
  const module = { exports: {} };
  new Function("module", "exports", outputFiles[0].text)(module, module.exports);
  return module.exports;
}
const clubs = await bundle("src/lib/clubs.ts");
const manifest = await bundle("src/scene/textures/screenImageManifest.ts");

// --- Contrato com o back: mesmo formato de slug, de key do telão e mesmo teto de imagens ---
const regexIn = (file, name) => {
  const found = readFileSync(file, "utf8").match(new RegExp(`${name} = (/.+/);`))?.[1];
  assert.ok(found, `${name} não encontrado em ${file}`);
  return found;
};
const frontSlug = regexIn("src/pages/admin/Clubs.tsx", "SLUG");
const frontKey = regexIn("src/scene/textures/screenImageManifest.ts", "KEY");
const back = "../cidoa-back";
if (existsSync(back)) {
  assert.equal(regexIn(`${back}/src/modules/club/schema/club.schema.ts`, "CLUB_SLUG"), frontSlug, "Formato do slug: painel ≠ back");
  assert.ok(readFileSync(`${back}/migrations/0033_club_catalog.sql`, "utf8").includes(`slug ~ '${frontSlug.slice(1, -1)}'`), "Formato do slug: painel ≠ CHECK do banco");
  assert.equal(regexIn(`${back}/src/modules/donation/schema/donation.schema.ts`, "SCREEN_IMAGE_KEY"), frontKey, "Key do telão: cena ≠ back");
  const max = (file, name) => {
    const found = readFileSync(file, "utf8").match(new RegExp(`${name} = (\\d+)`))?.[1];
    assert.ok(found, `${name} não encontrado em ${file}`);
    return found;
  };
  assert.equal(max("src/pages/admin/Clubs.tsx", "MAX_IMAGES"), max(`${back}/src/modules/admin/club-event/schema/admin-club-event.schema.ts`, "CLUB_MAX_IMAGES"), "Teto de imagens: painel ≠ back");
  console.log("Contrato com o back: slug, key do telão e teto de imagens OK.");
} else console.log("(back ausente: contrato com o back pulado)");

// --- Key do telão: formato fechado, nada de caminho; URL da API sem versão ---
assert.equal(manifest.getScreenImageUrl("gremio/1"), "/api/club/images/gremio/1");
assert.equal(manifest.getScreenImageUrl("sao-paulo/12"), "/api/club/images/sao-paulo/12");
for (const bad of ["gremio/0", "gremio/01", "gremio/1000", "../gremio/1", "gremio/1/../../x", "GREMIO/1", "escudo-pixelado-do-gremio", "", "gremio/1.webp", "/gremio/1", "gremio/1?v=2"]) {
  assert.equal(manifest.getScreenImageUrl(bad), null, `Key aceita: ${bad}`);
}
console.log("Key do telão: formato e URL da API OK.");

// --- Catálogo: time do link, imagens, busca (só ativos), troca por posição ---
const team = (slug, name, numbers = [1, 2, 3], isActive = true) => ({
  slug, name, isActive, thumbUrl: `/api/club/images/${slug}/${numbers[0]}/thumb?v=1`,
  images: numbers.map((n) => ({ key: `${slug}/${n}`, url: `/api/club/images/${slug}/${n}?v=1` })),
});
const fixture = [
  team("chapecoense", "Chapecoense"), team("flamengo", "Flamengo"), team("gremio", "Grêmio"),
  team("ponte-preta", "Ponte Preta"), team("santos", "Santos", [1, 2, 3], false), team("sao-bernardo", "São Bernardo"),
  team("sao-caetano", "São Caetano"), team("sao-jose-rs", "São José-RS"), team("sao-luiz-ijui", "São Luiz"),
  team("sao-paulo", "São Paulo", [2, 5, 9]), team("vasco", "Vasco", [1, 2]),
];
const activeCount = fixture.filter((club) => club.isActive).length;
assert.equal(clubs.findClub(fixture, " Gremio "), fixture[2], "Slug do link normaliza caixa/espaço");
assert.equal(clubs.findClub(fixture, "santos")?.isActive, false, "Inativo segue achável (quem torce mantém)");
assert.equal(clubs.findClub(fixture, "time-inexistente"), null);
assert.equal(clubs.findClub(fixture, null), null);
assert.deepEqual(clubs.clubImages(clubs.findClub(fixture, "sao-paulo")).map((image) => [image.key, image.label]),
  [["sao-paulo/2", "São Paulo, imagem 1"], ["sao-paulo/5", "São Paulo, imagem 2"], ["sao-paulo/9", "São Paulo, imagem 3"]], "Rótulo pela posição, não pelo número");
const names = (query) => clubs.searchClubs(fixture, query).map((club) => club.name);
assert.equal(names("").length, activeCount);
assert.ok(!names("").includes("Santos") && !names("santos").length, "Time inativo na lista");
assert.deepEqual(names("sao").slice(0, 5), ["São Bernardo", "São Caetano", "São José-RS", "São Luiz", "São Paulo"], "Sem acento e prefixo primeiro");
assert.ok(names("preta").includes("Ponte Preta"), "Prefixo de palavra do meio");
assert.equal(names("GRÊMIO")[0], "Grêmio");
assert.deepEqual(names("zzz"), []);
assert.ok(names("ense").includes("Chapecoense"), "Trecho no meio entra depois");
const remap = (keys, slug) => clubs.remapScreenImages(fixture, keys, slug);
assert.deepEqual(remap(["gremio/3", "gremio/1"], "flamengo"), ["flamengo/3", "flamengo/1"], "Mesma posição, ordem mantida");
assert.deepEqual(remap(["gremio/3", "gremio/2"], "sao-paulo"), ["sao-paulo/9", "sao-paulo/5"], "Posição, não número (buracos)");
assert.deepEqual(remap(["sao-paulo/9", "sao-paulo/2"], "gremio"), ["gremio/3", "gremio/1"]);
assert.deepEqual(remap(["gremio/3", "gremio/1"], "vasco"), ["vasco/1"], "Time novo com menos imagens perde a posição");
assert.deepEqual(remap(["gremio/7", "time-inexistente/1", "gremio/2"], "flamengo"), ["flamengo/2"], "Imagem fora do catálogo sai");
assert.deepEqual(remap(["flamengo/2", "flamengo/1"], "flamengo"), ["flamengo/2", "flamengo/1"], "Idempotente");
assert.deepEqual(remap([], "flamengo"), []);
console.log("Catálogo: link, rótulos, busca só com ativos, troca por posição OK.");

// --- Modal real ---
const jsx = nativeRequire("react/jsx-runtime");
const source = readFileSync("src/components/club/ClubEventDialog.tsx", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const settle = () => new Promise(setImmediate);
const text = (node) => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return React.isValidElement(node) ? text(node.props.children) : "";
};
const find = (node, predicate) => {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...find(node.props.children, predicate)];
};

function mount({ user = { id: 7 }, authLoading = false, mine: mineInit = {}, initialClub = null, startPicking, gate, reduced = false, choose,
  catalog = { isActive: true, clubs: fixture }, catalogError = null } = {}) {
  const slots = [];
  let cursor = 0;
  const calls = { choose: [], chosen: [], retry: 0, close: 0, catalogRetry: 0 };
  const mine = { club: null, canChange: true, ready: true, error: null, ...mineInit,
    retry: () => { calls.retry += 1; },
    async choose(slug) {
      calls.choose.push(slug);
      if (choose) await choose(slug);
      Object.assign(mine, { club: slug, canChange: mine.club === null ? true : false });
    },
  };
  const context = { exports: {}, require: (name) => {
    const modules = {
      react: { ...React, useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
      }, useEffect: (effect) => { effect(); } },
      "react/jsx-runtime": jsx,
      "motion/react": { domAnimation: {}, LazyMotion: "LazyMotion", useReducedMotion: () => reduced },
      "motion/react-m": { li: "m.li" },
      "@/api/http": { ApiError },
      "@/hooks/useAuth": { useAuth: () => ({ user, isLoading: authLoading }) },
      "@/components/hooks/useMyClub": { useMyClub: () => mine },
      "@/components/hooks/useClubCatalog": { useClubCatalog: () => ({ catalog, error: catalogError, retry: () => { calls.catalogRetry += 1; } }) },
      "@/lib/clubs": clubs,
      "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
      "@/components/pass/RewardConfetti": { RewardConfetti: "RewardConfetti" },
      "@/components/ui/button": { Button: "Button" },
      "@/components/ui/input": { Input: "Input" },
      "@/components/ui/pixel-icon": { BlockLoader: "BlockLoader", ErrorMark: "ErrorMark", PixelArrow: "PixelArrow", PixelCheck: "PixelCheck" },
      "@/components/ui/dialog": Object.fromEntries(["Dialog", "DialogContent", "DialogDescription", "DialogTitle"].map((name) => [name, name])),
    };
    assert.ok(name in modules, `Import não previsto: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(js, context);
  const Dialog = context.exports.default;
  const render = () => {
    cursor = 0;
    return Dialog({ initialClub, startPicking, gate, loginPanel: React.createElement("AuthPanel"), onChosen: (remap) => calls.chosen.push(remap), onClose: () => { calls.close += 1; } });
  };
  const ui = {
    tree: render(), calls, mine,
    render() { ui.tree = render(); return ui; },
    title: () => text(find(ui.tree, (node) => node.type === "DialogTitle")),
    buttons: () => find(ui.tree, (node) => node.type === "Button"),
    button: (label) => {
      const found = ui.buttons().find((node) => text(node.props.children).includes(label));
      assert.ok(found, `Botão "${label}" ausente em "${ui.title()}"`);
      return found;
    },
    has: (label) => ui.buttons().some((node) => text(node.props.children).includes(label)),
    images: () => find(ui.tree, (node) => node.type?.name === "ClubImages").map((node) => node.props.club.slug),
    confetti: () => find(ui.tree, (node) => node.type === "RewardConfetti").length > 0,
    content: () => find(ui.tree, (node) => node.type === "DialogContent")[0],
    clubButtons: () => find(ui.tree, (node) => node.type === "button"),
  };
  return ui;
}

// Catálogo carregando: nada na tela (sem piscar). Erro: tentar de novo. Evento desligado: fecha sozinho.
let ui = mount({ catalog: null, initialClub: "gremio" });
assert.equal(ui.tree, null, "Modal antes do catálogo");
assert.equal(ui.calls.close, 0);
ui = mount({ catalog: null, catalogError: "Sem rede", initialClub: "gremio" });
assert.match(text(ui.tree), /Sem rede/);
ui.button("Tentar de novo").props.onClick();
assert.equal(ui.calls.catalogRetry, 1, "Tentar de novo não releu o catálogo");
for (const user of [null, { id: 7 }]) {
  ui = mount({ user, catalog: { isActive: false, clubs: fixture }, initialClub: "gremio" });
  assert.equal(ui.tree, null, "Evento desligado mostrou o modal");
  assert.equal(ui.calls.close, 1, "Evento desligado não fechou (limpa ?time)");
}
console.log("Catálogo: carregando sem modal, erro com tentar de novo, evento desligado fecha OK.");

// Visitante: login embutido, com as imagens do time do link.
ui = mount({ user: null, initialClub: "gremio" });
assert.equal(find(ui.tree, (node) => node.type === "AuthPanel").length, 1, "Login embutido ausente");
assert.deepEqual(ui.images(), ["gremio"]);
assert.match(text(ui.tree), /Entre para ganhar estas imagens/);
ui = mount({ user: null, initialClub: "nao-existe" });
assert.deepEqual(ui.images(), []);
assert.match(text(ui.tree), /Entre para escolher seu time/);
ui = mount({ user: null, authLoading: true, initialClub: "gremio" });
assert.equal(find(ui.tree, (node) => node.type === "AuthPanel").length, 0, "Login antes de saber a sessão");
console.log("Visitante: login embutido com/sem time do link OK.");

// Etapa obrigatória da conta (reaceite dos termos) vem antes de tudo, inclusive do time carregando.
ui = mount({ initialClub: "gremio", gate: React.createElement("TermsPanel"), mine: { ready: false } });
assert.equal(find(ui.tree, (node) => node.type === "TermsPanel").length, 1, "Etapa obrigatória ausente");
assert.equal(ui.has("Sim"), false, "Escolha antes da etapa obrigatória");
assert.equal(find(mount({ user: null, gate: React.createElement("TermsPanel") }).tree, (node) => node.type === "TermsPanel").length, 0, "Etapa da conta para visitante");
console.log("Etapa obrigatória (termos) antes da escolha OK.");

// Carregando e erro do time.
ui = mount({ mine: { ready: false }, initialClub: "gremio" });
assert.equal(find(ui.tree, (node) => node.type === "BlockLoader").length, 1);
assert.equal(ui.has("Sim"), false);
ui = mount({ mine: { ready: false, error: "Falhou" }, initialClub: "gremio" });
assert.match(text(ui.tree), /Falhou/);
ui.button("Tentar de novo").props.onClick();
assert.equal(ui.calls.retry, 1);
console.log("Carregando/erro: sem ação até saber o time, tentar de novo OK.");

// Sem time + link: oferta → aceitar → conquista com confete → Continuar fecha.
ui = mount({ initialClub: "gremio" });
assert.equal(ui.title(), "Grêmio é seu time?");
assert.deepEqual(ui.images(), ["gremio"]);
assert.ok(ui.has("Escolher outro time"));
ui.button("Sim, é meu time").props.onClick();
await settle();
ui.render();
assert.deepEqual(ui.calls.choose, ["gremio"]);
assert.equal(ui.calls.chosen.length, 1, "Editor não soube da escolha");
assert.deepEqual(ui.calls.chosen[0](["flamengo/3", "flamengo/1"]), ["gremio/3", "gremio/1"], "Editor recebeu a troca por posição do time escolhido");
assert.doesNotMatch(text(ui.tree), /Seu time:/, "Kicker sem time anterior");
assert.equal(ui.title(), "Imagens liberadas");
assert.ok(ui.confetti(), "Conquista sem confete");
assert.equal(find(ui.tree, (node) => node.type?.name === "ClubImages")[0].props.animate, true);
ui.button("Continuar").props.onClick();
assert.equal(ui.calls.close, 1);
ui = mount({ initialClub: "gremio", reduced: true });
ui.button("Sim, é meu time").props.onClick();
await settle();
assert.equal(ui.render().confetti(), false, "Movimento reduzido com confete");
console.log("Oferta: aceitar, conquista, confete (e sem ele no movimento reduzido), continuar OK.");

// Escolher outro: lista com busca, sem Voltar quando não há para onde voltar.
ui = mount({ initialClub: "gremio" });
ui.button("Escolher outro time").props.onClick();
ui.render();
assert.equal(ui.title(), "Escolha seu time");
assert.equal(ui.clubButtons().length, activeCount, "Lista só com times ativos");
assert.ok(ui.has("Voltar"));
const search = find(ui.tree, (node) => node.type === "Input")[0];
search.props.onChange({ target: { value: "flam" } });
ui.render();
assert.deepEqual(ui.clubButtons().map((node) => text(node.props.children)), ["Flamengo"]);
ui.clubButtons()[0].props.onClick();
ui.render();
assert.equal(ui.title(), "Flamengo é seu time?", "Escolha da lista vira oferta");
find(ui.tree, (node) => node.type === "Button").find((node) => text(node.props.children).includes("Escolher outro")).props.onClick();
ui.render();
find(ui.tree, (node) => node.type === "Input")[0].props.onChange({ target: { value: "zzz" } });
assert.match(text(ui.render().tree), /Nenhum time encontrado/);
ui = mount({ initialClub: "nao-existe" });
assert.equal(ui.title(), "Escolha seu time", "Link sem time válido abre a lista");
assert.equal(ui.has("Voltar"), false);
assert.equal(mount({ mine: { club: "gremio", canChange: true }, initialClub: "nao-existe" }).title(), "Grêmio", "Com time, link inválido mostra o time");
assert.equal(mount({ mine: { club: "gremio", canChange: true }, startPicking: true }).title(), "Escolha seu time", "Trocar time abre na lista");
ui = mount({ initialClub: "santos" });
assert.equal(ui.title(), "Escolha seu time", "Link de time inativo ofereceu o time");
assert.equal(mount({ user: null, initialClub: "santos" }).images().length, 0, "Visitante viu imagens de time inativo");
ui = mount({ mine: { club: "santos", canChange: true }, initialClub: "santos" });
assert.equal(ui.title(), "Santos", "Quem torce por time inativo perdeu o time");
assert.deepEqual(ui.images(), ["santos"]);
console.log("Lista: busca, vazio, escolha vira oferta, voltar só com destino OK.");

// Já tem time: mesmo link mostra o time; troca disponível = Trocar time; usada = sem opção.
ui = mount({ mine: { club: "gremio", canChange: true }, initialClub: "gremio" });
assert.equal(ui.title(), "Grêmio");
assert.equal(ui.confetti(), false);
ui.button("Trocar time").props.onClick();
ui.render();
const current = ui.clubButtons().find((node) => node.props["aria-current"]);
assert.equal(text(current.props.children), "Grêmio", "Time atual marcado na lista");
ui.clubButtons().find((node) => text(node.props.children) === "Grêmio").props.onClick();
assert.equal(ui.render().title(), "Grêmio", "Escolher o próprio time não oferece troca");
ui = mount({ mine: { club: "gremio", canChange: true }, initialClub: "flamengo" });
assert.equal(ui.title(), "Flamengo é seu time?", "Link de outro time oferece a troca");
assert.match(text(ui.tree), /Seu time: Grêmio/, "Oferta de troca sem o time atual");
ui = mount({ mine: { club: "time-que-o-front-nao-conhece", canChange: false }, initialClub: "flamengo" });
assert.notEqual(ui.title(), "Flamengo é seu time?", "Slug desconhecido destravou a troca");
for (const link of ["flamengo", null, "gremio"]) {
  ui = mount({ mine: { club: "gremio", canChange: false }, initialClub: link });
  assert.equal(ui.title(), "Grêmio", `Troca usada mostra o time (link ${link})`);
  assert.equal(ui.has("Trocar time") || ui.has("Escolher outro time") || ui.has("Sim"), false, "Troca usada ainda oferece troca");
}
console.log("Meu time: troca disponível, troca usada sem opção, link de outro time OK.");

// 409 (troca usada em outra aba): erro na tela, sem conquista. Fechar durante o salvamento não fecha.
ui = mount({ mine: { club: "gremio", canChange: true }, initialClub: "flamengo", choose: async () => { throw new ApiError(409, "Você já trocou de time."); } });
ui.button("Sim, é meu time").props.onClick();
ui.render();
assert.equal(ui.button("Salvando").props.disabled, true, "Botão livre durante o salvamento");
ui.content().props.onEscapeKeyDown({ preventDefault: () => { ui.blockedEscape = true; } });
assert.equal(ui.blockedEscape, true, "Esc fecha durante o salvamento");
find(ui.tree, (node) => node.type === "Dialog")[0].props.onOpenChange(false);
assert.equal(ui.calls.close, 0, "Fechou durante o salvamento");
await settle();
ui.render();
assert.match(text(ui.tree), /Você já trocou de time\./);
assert.deepEqual(ui.calls.chosen, [], "409 avisou o editor");
assert.equal(ui.title(), "Flamengo é seu time?");
find(ui.tree, (node) => node.type === "Dialog")[0].props.onOpenChange(false);
assert.equal(ui.calls.close, 1);
console.log("409 e fechar durante o salvamento OK.");
