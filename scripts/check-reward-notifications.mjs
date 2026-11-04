// node scripts/check-reward-notifications.mjs — ciclo do hook sem servidor/navegador.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/components/hooks/useCustomizationCatalog.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const slots = [];
let cursor = 0;
let effects = [];
let auth = { user: null, isAdmin: false };
let revision = 0;
let catalogReads = 0;
let failAck = false;
let errors = 0;
const requests = [];
const acknowledgments = [];
const catalog = { shapes: [], rooftops: [], edgeLights: [], colors: [], textures: [], features: { sign: null, hologram: null } };
const reward = { key: "option:1", label: "Torre", categoryKey: "shape", categoryLabel: "Formato", optionKey: "tower", unlock: null };
const snapshot = { progress: { donated: 30, referrals: 1 }, unlockedOptionIds: [1], unlockedCategoryKeys: [], pendingRewards: [reward] };
const react = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
  },
  useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
  useMemo(compute) { cursor++; return compute(); },
  useEffect(effect, deps) {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      effects.push(() => {
        previous?.cleanup?.();
        slots[index] = { deps, cleanup: effect() };
      });
    }
  },
};
const api = {
  fetchCustomizationCatalog() { catalogReads++; return Promise.resolve(catalog); },
  fetchMyUnlocks({ signal }) { return new Promise((resolve) => requests.push({ signal, resolve })); },
  acknowledgeRewards(keys) {
    acknowledgments.push([...keys]);
    return failAck ? Promise.reject(new Error("offline")) : Promise.resolve();
  },
};
const modules = {
  react, axios: { default: { isCancel: () => false } },
  "@/hooks/useAuth": { useAuth: () => auth },
  "@/lib/unlock": { canUseCustomization: () => false },
  "@/lib/rewardNotifications": { getNextReward: () => null },
  "@/components/ui/toast": { toast: { error() { errors++; } } },
  "../../api/customizationApi": api,
};
const context = { exports: {}, require: (name) => { assert.ok(name in modules, name); return modules[name]; }, AbortController, console };
vm.runInNewContext(js, context);
function render() {
  cursor = 0;
  const result = context.exports.useCustomizationCatalog(revision);
  for (const effect of effects) effect();
  effects = [];
  return result;
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

render();
await settle();
assert.equal(catalogReads, 1);
assert.equal(requests.length, 0, "Visitante não consulta conquistas");
auth = { user: { id: 7 }, isAdmin: false };
render();
requests[0].resolve(snapshot);
await settle();
let result = render();
assert.equal(result.rewards.pending.length, 1, "Conquista chega na leitura já existente");
for (let i = 0; i < 10; i++) render();
assert.equal(requests.length, 1, "Renders da cena não disparam consultas");
result.rewards.dismiss([reward.key]);
assert.deepEqual(acknowledgments, [[reward.key]], "Uma confirmação em lote");
assert.equal(render().rewards.pending.length, 0, "Fecha imediatamente");
revision++;
render();
requests[1].resolve(snapshot);
await settle();
assert.equal(render().rewards.pending.length, 0, "Resposta antiga não ressuscita aviso dispensado");
revision++;
render();
auth = { user: { id: 8 }, isAdmin: false };
assert.equal(render().rewards.pending.length, 0, "Troca de conta nunca mostra conquistas anteriores");
assert.equal(requests[2].signal.aborted, true);
requests[2].resolve({ ...snapshot, pendingRewards: [{ ...reward, key: "option:99" }] });
await settle();
assert.equal(render().rewards.pending.length, 0, "Resposta atrasada de outra conta é ignorada");
requests[3].resolve(snapshot);
await settle();
result = render();
assert.equal(result.rewards.pending.length, 1, "Outra conta recebe o próprio aviso do mesmo item");
failAck = true;
result.rewards.dismiss([reward.key]);
await settle();
assert.equal(render().rewards.pending.length, 0, "Falha de rede não prende usuário no modal");
assert.equal(errors, 1, "Falha informa que aviso pode reaparecer");
auth = { user: { id: 9 }, isAdmin: true };
assert.equal(render().rewards.pending.length, 0);
assert.equal(requests.length, 4, "Admin não consulta conquistas");
auth = { user: null, isAdmin: false };
assert.equal(render().rewards.pending.length, 0);
assert.equal(catalogReads, 1, "Pagamento/menu não baixam catálogo novamente");
console.log("Recompensas: reuso de requests, troca de conta, abort, resposta atrasada, lote, offline, admin e logout OK.");
