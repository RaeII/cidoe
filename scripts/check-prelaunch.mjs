// node scripts/check-prelaunch.mjs — sem servidor/navegador ou requisição de rede.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";

const storage = new Map();
const events = [];
const window = {
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, value); },
  },
  dispatchEvent(event) { events.push(event.detail); },
};
const source = await readFile(new URL("../src/lib/prelaunchCity.ts", import.meta.url), "utf8");
const projectStorage = {};
const storageSource = await readFile(new URL("../src/lib/projectStorage.ts", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(storageSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: projectStorage });
function loadLocal() {
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  vm.runInNewContext(outputText, { exports, window, require: () => projectStorage, CustomEvent: class { constructor(_name, options) { this.detail = options.detail; } } });
  return exports;
}
let local = loadLocal();
const city = { id: 3550308, name: "São Paulo", uf: "SP" };
const contribution = { donationId: null, ongId: 1, cityId: city.id, value: 5.1 };
const id = local.simulateContribution(1, contribution, city);
assert.equal(id, -1);
assert.equal(local.readLocalBuildings(1).length, 1);
assert.equal(local.readLocalBuildings(2).length, 0, "Outra conta não herda a cidade");
assert.equal(local.simulateContribution(2, contribution, city), -1, "IDs isolados por conta");
local.simulateContribution(1, { donationId: id, ongId: 2, value: 5.2 });
assert.equal(local.readLocalBuildings(1)[0].value, 10.3, "Soma em centavos");
assert.equal(local.readLocalBuildings(1)[0].ongIds.join(), "1,2");
assert.equal(local.readLocalBuildings(2)[0].value, 5.1, "Aumento não alcança outro usuário");
local.saveLocalCustomization(1, id, { color: "#112233", signText: "Local" });
const profile = { name: "Meu edifício", description: "Teste", image: "data:image/jpeg;base64,AA==" };
local.saveLocalProfile(1, id, profile);
local.writeLocalValue(1, "scene:environment", { night: true });
local = loadLocal();
assert.equal(local.readLocalBuildings(1)[0].value, 10.3, "Remontagem/reload preserva edifício");
assert.equal(local.readLocalValue(1, "customizations", {})[id].color, "#112233");
assert.equal(local.readLocalValue(1, "profiles", {})[id].name, profile.name);
assert.equal(local.readLocalValue(1, "scene:environment", {}).night, true);
assert.equal(Object.keys(local.readLocalValue(2, "profiles", {})).length, 0);
assert.equal(Object.keys(local.readLocalValue(null, "customizations", {})).length, 0, "Logout não expõe personalização");
assert.equal(local.readLocalValue(null, "scene:environment", {}).night, undefined);
for (const value of [0, -1, 4.99, NaN, Infinity, Number.MAX_VALUE]) {
  assert.throws(() => local.simulateContribution(1, { ...contribution, value }, city));
}
assert.throws(() => local.simulateContribution(0, contribution, city));
assert.throws(() => local.simulateContribution(1, { donationId: 1, ongId: 1, value: 5 }), /não pertence/);
assert.throws(() => local.simulateContribution(3, contribution, { ...city, id: 1 }), /cidade/);
local.simulateContribution(1, contribution, city);
local.simulateContribution(1, contribution, city);
const before = window.localStorage.getItem(local.localCityKey(1, "buildings"));
assert.throws(() => local.simulateContribution(1, contribution, city), /3 edifícios/);
assert.equal(window.localStorage.getItem(local.localCityKey(1, "buildings")), before);
const write = window.localStorage.setItem;
window.localStorage.setItem = () => { throw new Error("quota"); };
assert.throws(() => local.simulateContribution(1, { donationId: id, ongId: 1, value: 5 }), /Não foi possível salvar/);
assert.equal(window.localStorage.getItem(local.localCityKey(1, "buildings")), before, "Quota não perde dados anteriores");
window.localStorage.setItem = write;
const invalidKey = local.localCityKey(4, "buildings");
for (const raw of ["broken", "null", "{}", '[{"id": -1}]']) {
  storage.set(invalidKey, raw);
  assert.throws(() => local.simulateContribution(4, contribution, city), /Dados locais inválidos/);
  assert.equal(storage.get(invalidKey), raw, "Dados inválidos nunca são sobrescritos");
}
assert.ok(events.includes(local.localCityKey(1, "buildings")));
const seeds = local.createSeedBuildings([{ id: 7 }, { id: 9 }]);
assert.ok(seeds.length > 0 && new Set(seeds.map((s) => s.id)).size === seeds.length, "Seeds com IDs únicos");
assert.ok(seeds.every((s) => s.id < -3 && s.city.id === s.cityId && [7, 9].includes(s.ongId)), "Seeds fora da faixa local, ONG do catálogo");
assert.equal(local.createSeedBuildings([])[0].ongIds.length, 0, "Sem catálogo de ONG, sem beneficiária");

// Executa os adaptadores reais: nenhuma mutação HTTP pode passar.
const requests = [];
const http = { get: async (url) => { requests.push(url); return { data: { data: null } }; } };
function loadApi(path) {
  return readFile(new URL(path, import.meta.url), "utf8").then((apiSource) => {
    const exports = {};
    const { outputText } = ts.transpileModule(apiSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
    vm.runInNewContext(outputText, { exports, require: (name) => name === "./http" ? { http } : local });
    return exports;
  });
}
const contributionApi = await loadApi("../src/api/contributionApi.ts");
const donationApi = await loadApi("../src/api/donationApi.ts");
await donationApi.saveDonationCustomization(1, id, { color: "#445566" });
await contributionApi.saveBuildingProfile(1, id, profile);
assert.equal((await contributionApi.fetchBuildingProfile(id, undefined, 1)).name, profile.name);
assert.equal(await contributionApi.fetchBuildingProfile(id, undefined, 2), null);
assert.equal(requests.length, 0, "Criar/aumentar/personalizar/perfil local nunca usa HTTP");
await contributionApi.fetchBuildingProfile(42, undefined, 1);
assert.equal(requests.join(), "/donation/42/profile", "Só o perfil público faz GET");

// A mescla do hook nunca grava edifícios locais no snapshot público.
const hookSource = await readFile(new URL("../src/components/hooks/useDonations.ts", import.meta.url), "utf8");
const hookAst = ts.createSourceFile("hook.ts", hookSource, ts.ScriptTarget.ES2022, true);
const hook = hookAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "useDonations");
const derived = hook.body.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => ["seeds", "extraBuildings", "allDonations", "cities", "savedCustomizations"].includes(item.name.getText(hookAst))));
const derivedScript = ts.transpileModule(derived.map((node) => node.getText(hookAst)).join("\n") + "\nObject.assign(globalThis, { allDonations, cities, savedCustomizations });", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const hookGlobals = { IS_PRELAUNCH: false, EMPTY_DONATIONS: [], EMPTY_CITIES: [], EMPTY_LOCAL_BUILDINGS: [], createSeedBuildings: local.createSeedBuildings, createSeedCustomizations: local.createSeedCustomizations, useMemo: (calculate) => calculate() };
const publicDataset = { donations: [{ id: 42, value: 50 }], cities: [], ongs: [], customizations: new Map([[42, { color: "#000000" }]]) };
const emptyContext = { ...hookGlobals, userId: undefined, dataset: { ...publicDataset, donations: [], customizations: new Map() }, localBuildings: [], localCustomizations: {} };
vm.runInNewContext(derivedScript, emptyContext);
assert.equal(emptyContext.allDonations.length, local.createSeedBuildings([]).length, "Snapshot vazio → cidade inicial do front");
assert.ok(emptyContext.cities.length > 0);
const seedLooks = [...emptyContext.savedCustomizations.values()];
assert.ok(seedLooks.length < emptyContext.allDonations.length / 2, "Maioria dos edifícios iniciais segue a cena");
const colored = seedLooks.filter((c) => c.color !== "#d4d4d4");
assert.ok(colored.length > 5 && colored.length <= 25, "Cor só em poucos edifícios");
const sceneTypes = ts.createSourceFile("types.ts", await readFile(new URL("../src/scene/types.ts", import.meta.url), "utf8"), ts.ScriptTarget.ES2022, true);
const buildingShapeType = sceneTypes.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === "BuildingShape");
assert.deepEqual([...new Set(seedLooks.map((c) => c.buildingShape))].sort(),
  buildingShapeType.type.types.map((node) => node.literal.text).sort(), "Cidade inicial inclui todos os formatos disponíveis");
assert.ok(new Set(colored.map((c) => c.color)).size > 5 && seedLooks.some((c) => c.signText) && seedLooks.some((c) => c.edgeLightType === "led"), "Cores, letreiros e LED variados");
assert.ok(seedLooks.every((c) => c.textureKey === null), "Textura segue o sorteio da cena");
assert.ok(emptyContext.allDonations.length >= 400, "Cidade inicial cheia");
assert.ok(seedLooks.filter((c) => c.edgeLightType === "led").length <= emptyContext.allDonations.length / 40, "LED raro");
const seedIndex = (id) => -1_000_000 - id;
for (const shape of ["apartment", "gourmet", "loft"]) {
  const buildings = [...emptyContext.savedCustomizations].filter(([, c]) => c.buildingShape === shape);
  assert.ok(buildings.length >= 25, `${shape}: muitas unidades na cidade inicial`);
  assert.ok(buildings.some(([id]) => seedIndex(id) < 40), `${shape}: presente nas torres centrais`);
  assert.ok(buildings.some(([id]) => seedIndex(id) >= 40), `${shape}: presente nas quadras de base`);
}
assert.ok([...emptyContext.savedCustomizations].every(([id, c]) => c.edgeLightType === "none" || seedIndex(id) < 40), "LED só nas torres altas");
assert.ok(colored.every((c) => [1, 3, 5].every((at) => parseInt(c.color.slice(at, at + 2), 16) <= 0x50)), "Só cores escuras");
const shaped = seedLooks.filter((c) => c.buildingShape !== "default").length;
assert.ok(shaped >= 100 && shaped <= emptyContext.allDonations.length / 3, "Muitos formatos, maioria instanciada");
for (const userId of [1, 2, undefined]) {
  const context = { ...hookGlobals, userId, dataset: publicDataset,
    localBuildings: userId ? local.readLocalBuildings(userId) : [],
    localCustomizations: userId ? local.readLocalValue(userId, "customizations", {}) : {},
  };
  vm.runInNewContext(derivedScript, context);
  assert.equal(context.allDonations.length, userId === 1 ? 4 : userId === 2 ? 2 : 1);
  assert.equal(context.savedCustomizations.has(-1), userId === 1);
  assert.equal(context.cities.length, userId ? 1 : 0);
}
assert.equal(publicDataset.donations.length, 1);
assert.equal(publicDataset.customizations.has(-1), false);

// Pré-lançamento: banco vazio em produção e 105 registros locais geram a mesma cidade.
const localDataset = { ...publicDataset,
  donations: Array.from({ length: 105 }, (_, i) => ({ id: 100 + i, value: 1000 + i, cityId: city.id, ongId: 1, ongIds: [1] })),
  ongs: Array.from({ length: 150 }, (_, i) => ({ id: i + 1 })),
};
for (const dataset of [emptyContext.dataset, localDataset]) {
  const context = { ...hookGlobals, IS_PRELAUNCH: true, userId: undefined, dataset, localBuildings: [], localCustomizations: {} };
  vm.runInNewContext(derivedScript, context);
  assert.equal(context.allDonations.length, 480, "Mesma quantidade inicial nos dois ambientes");
  assert.deepEqual(Array.from(context.allDonations, ({ id, value, cityId }) => [id, value, cityId]),
    Array.from(emptyContext.allDonations, ({ id, value, cityId }) => [id, value, cityId]), "Mesmos IDs, valores e cidades");
  assert.deepEqual(context.savedCustomizations, emptyContext.savedCustomizations, "Mesmos formatos e aparência");
}
const simulatedContext = { ...hookGlobals, IS_PRELAUNCH: true, userId: 1, dataset: localDataset,
  localBuildings: local.readLocalBuildings(1), localCustomizations: local.readLocalValue(1, "customizations", {}) };
vm.runInNewContext(derivedScript, simulatedContext);
assert.equal(simulatedContext.allDonations.length, 483, "Simulações da conta somam à cidade inicial");
assert.equal(simulatedContext.savedCustomizations.has(-1), true, "Personalização local preservada");
assert.equal(simulatedContext.savedCustomizations.has(42), false, "Personalização do banco não vaza para a cidade inicial");
assert.equal(localDataset.donations.length, 105, "Dados locais do backend preservados");

// Executa o pool real do editor: catálogo não altera fachadas da cidade inicial.
const editorSource = await readFile(new URL("../src/components/CitySceneEditor.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("editor.tsx", editorSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const editor = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "CitySceneEditor");
const pool = editor.body.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(ast) === "facadeTexturePool"));
const poolScript = ts.transpileModule(pool.getText(ast) + "\nglobalThis.pool = facadeTexturePool;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const excludedFacades = ["Facade007_1K-JPG", "Facade014_1K-JPG", "Facade016_1K-JPG", "Facade019A_1K-PNG"]
  .flatMap((key) => [key, `texture/${key}`]);
const allowedFacade = "texture/Facade020_1K-PNG";
const catalogValues = [...excludedFacades, allowedFacade];
for (const seeded of [true, false]) {
  const context = { seeded, textureSettings: { randomPerBuilding: true },
    customizationCatalog: { textures: [...catalogValues, null].map((value) => ({ value })) },
    SEED_FACADE_TEXTURES: local.SEED_FACADE_TEXTURES, useMemo: (calculate) => calculate() };
  vm.runInNewContext(poolScript, context);
  assert.deepEqual(Array.from(context.pool), seeded ? Array.from(local.SEED_FACADE_TEXTURES) : catalogValues,
    "Cidade inicial usa pool fixo; catálogo preservado nas cidades públicas");
  assert.ok(excludedFacades.every((key) => !local.SEED_FACADE_TEXTURES.includes(key)), "Seeds sem fachadas bloqueadas");
  const disabledContext = { ...context, textureSettings: { randomPerBuilding: false } };
  vm.runInNewContext(poolScript, disabledContext);
  assert.equal(disabledContext.pool.length, 0, "Sorteio desligado mantém pool vazio");
}

// Executa a lista de atalhos real para contas comum/admin.
const shortcuts = editor.body.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(ast) === "shortcuts"));
for (const isAdmin of [false, true]) {
  const context = { isAdmin, myBuildingsOpen: false, setShowControlPanel: () => {}, selectedBuildingId: null, infoBuildingId: null };
  vm.runInNewContext(ts.transpileModule(shortcuts.getText(ast) + "\nglobalThis.keys = shortcuts.map((item) => item.key);", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  assert.equal(context.keys.includes("m"), isAdmin, "Atalho de configurações exclusivo do admin");
}
assert.match(editorSource, /isAdmin && showControlPanel &&/);
assert.match(editorSource, /isAdmin && !showControlPanel &&/);
assert.match(editorSource, /window.addEventListener\("pagehide", flushPending\)/);
assert.doesNotMatch(editorSource, /upsertDonations|refreshOwned|<BuildingHeightInput/);
console.log("Pré-lançamento: isolamento, reload, centavos, limites, perfil/aparência, falhas locais, zero mutações HTTP e acesso admin OK.");
