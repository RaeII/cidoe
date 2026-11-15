// node scripts/check-project-status.mjs — aviso de pré-lançamento (src/lib/projectStatus.ts): espera de 20 s,
// adia com outro diálogo aberto, uma vez por navegador (`cidoe:prelaunch:status-seen`), storage bloqueado e
// limpeza. Relógio falso. Sem servidor/navegador.
import assert from "node:assert/strict";
import { build } from "esbuild";

const { outputFiles: [bundle] } = await build({
  entryPoints: ["src/lib/projectStatus.ts"], bundle: true, format: "cjs", platform: "node", write: false,
});
const KEY = "cidoe:prelaunch:status-seen";

/** `storage`: objeto chave→valor; `null` = armazenamento bloqueado (getItem/setItem lançam). */
function setup(storage = {}) {
  let now = 0;
  let timers = [];
  const setTimeout = (fn, ms) => { const timer = { fn, at: now + ms }; timers.push(timer); return timer; };
  const clearTimeout = (timer) => { timers = timers.filter((t) => t !== timer); };
  const tick = (ms) => {
    const end = now + ms;
    for (let next; (next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0]);) {
      clearTimeout(next);
      now = next.at;
      next.fn();
    }
    now = end;
  };
  const localStorage = {
    getItem(key) { if (!storage) throw new Error("bloqueado"); return storage[key] ?? null; },
    setItem(key, value) { if (!storage) throw new Error("bloqueado"); storage[key] = value; },
  };
  const document = {
    dialogOpen: false,
    querySelector(selector) {
      assert.equal(selector, '[role="dialog"][data-state="open"]');
      return document.dialogOpen ? {} : null;
    },
  };
  const module = { exports: {} };
  new Function("module", "exports", "document", "localStorage", "setTimeout", "clearTimeout", bundle.text)(
    module, module.exports, document, localStorage, setTimeout, clearTimeout);
  let calls = 0;
  const stop = module.exports.scheduleProjectStatus(() => calls++);
  return { document, stop, tick, storage, calls: () => calls, mark: module.exports.markProjectStatusSeen, pending: () => timers.length };
}

// 20 s exatos com a cidade pronta, uma vez.
{
  const t = setup();
  t.tick(19_999);
  assert.equal(t.calls(), 0, "antes de 20 s não abre");
  t.tick(1);
  assert.equal(t.calls(), 1, "abre aos 20 s");
  t.tick(120_000);
  assert.equal(t.calls(), 1, "não repete na mesma visita");
}

// Outro diálogo aberto adia até fechar; confere a cada 1 s.
{
  const t = setup();
  t.document.dialogOpen = true;
  t.tick(60_000);
  assert.equal(t.calls(), 0, "não empilha sobre login/contribuição/menu");
  t.document.dialogOpen = false;
  t.tick(999);
  assert.equal(t.calls(), 0);
  t.tick(1);
  assert.equal(t.calls(), 1, "abre no segundo seguinte ao fechar");
}

// Fechar grava a chave; próxima visita não agenda nada.
{
  const storage = {};
  setup(storage).mark();
  assert.equal(storage[KEY], "1");
  const t = setup(storage);
  assert.equal(t.pending(), 0, "navegador que já viu não agenda timer");
  t.tick(60_000);
  assert.equal(t.calls(), 0);
}

// Storage bloqueado: aparece mesmo assim, gravar não lança.
{
  const t = setup(null);
  t.tick(20_000);
  assert.equal(t.calls(), 1, "storage bloqueado não esconde o aviso");
  assert.doesNotThrow(() => t.mark());
}

// Limpeza (unmount) cancela, inclusive durante a espera por diálogo.
{
  const t = setup();
  t.stop();
  t.tick(60_000);
  assert.equal(t.calls(), 0, "limpeza antes dos 20 s cancela");
  const u = setup();
  u.document.dialogOpen = true;
  u.tick(25_000);
  u.stop();
  u.document.dialogOpen = false;
  u.tick(60_000);
  assert.equal(u.calls(), 0, "limpeza durante a espera cancela o reagendamento");
}

console.log("check-project-status: ok");
