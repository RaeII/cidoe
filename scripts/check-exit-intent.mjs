// node scripts/check-exit-intent.mjs — saída de visitante (src/lib/exitIntent.ts): topo da janela,
// troca de aba, beforeunload, links internos, diálogo aberto, repetição, flag do cadastro, dispositivo com conta
// (`cidoe:has-account`) e limpeza. Sem servidor/navegador.
import assert from "node:assert/strict";
import { build } from "esbuild";

const { outputFiles: [bundle] } = await build({
  entryPoints: ["src/lib/exitIntent.ts"], bundle: true, format: "cjs", platform: "node", write: false,
});
const ORIGIN = "https://cidoe.com.br";

/** `storage`: objeto chave→valor; `null` = armazenamento bloqueado (getItem/setItem lançam). */
function setup(storage = {}) {
  const on = {};
  const localStorage = {
    getItem(key) { if (!storage) throw new Error("bloqueado"); return storage[key] ?? null; },
    setItem(key, value) { if (!storage) throw new Error("bloqueado"); storage[key] = value; },
  };
  const target = () => ({
    addEventListener: (type, fn) => { on[type] = fn; },
    removeEventListener: (type, fn) => { if (on[type] === fn) delete on[type]; },
  });
  const document = {
    ...target(), visibilityState: "visible", dialogOpen: false,
    querySelector(selector) {
      assert.equal(selector, '[role="dialog"][data-state="open"]');
      return document.dialogOpen ? {} : null;
    },
  };
  const module = { exports: {} };
  new Function("module", "exports", "document", "window", "location", "localStorage", bundle.text)(
    module, module.exports, document, target(), { origin: ORIGIN }, localStorage);
  let calls = 0;
  const stop = module.exports.watchExitIntent(() => calls++);
  const visibility = (state) => { document.visibilityState = state; on.visibilitychange(); };
  const unload = (timeStamp = 10_000) => {
    const event = { timeStamp, prevented: false, preventDefault() { this.prevented = true; } };
    on.beforeunload(event);
    return event.prevented && event.returnValue === true;
  };
  const click = (origin, timeStamp) => on.click({ timeStamp, target: { closest: () => (origin ? { origin } : null) } });
  return {
    on, document, stop, visibility, unload, click, calls: () => calls,
    shown: () => module.exports.exitPromptShown, remember: module.exports.rememberAccount,
  };
}

// Desktop: só sai pelo topo, sem elemento de destino.
{
  const t = setup();
  t.on.mouseout({ relatedTarget: {}, clientY: -5 });
  t.on.mouseout({ relatedTarget: null, clientY: 300 });
  assert.equal(t.calls(), 0, "troca de elemento ou saída lateral não conta");
  assert.equal(t.shown(), false, "cadastro sem modal não leva a flag");
  t.on.mouseout({ relatedTarget: null, clientY: -1 });
  assert.equal(t.calls(), 1);
  assert.equal(t.shown(), true, "modal apareceu → cadastro leva exitPrompt");
  t.document.dialogOpen = true; // o próprio modal aberto
  t.on.mouseout({ relatedTarget: null, clientY: -1 });
  assert.equal(t.calls(), 1, "não reabre por cima de si mesmo");
  t.document.dialogOpen = false; // fechou no X
  t.on.mouseout({ relatedTarget: null, clientY: -1 });
  t.visibility("hidden"); t.visibility("visible");
  assert.equal(t.calls(), 3, "volta a cada tentativa de sair");
  assert.ok(t.unload(), "beforeunload segue ativo depois do modal");
}

// Aba/app: pergunta na volta; aba aberta em segundo plano não conta.
{
  const t = setup();
  t.visibility("visible");
  assert.equal(t.calls(), 0);
  t.visibility("hidden");
  assert.equal(t.calls(), 0, "oculto não dá pra segurar");
  t.visibility("visible");
  assert.equal(t.calls(), 1);
}

// Outro diálogo aberto (login, contribuição): espera e tenta na próxima saída.
{
  const t = setup();
  t.document.dialogOpen = true;
  t.visibility("hidden"); t.visibility("visible");
  t.on.mouseout({ relatedTarget: null, clientY: 0 });
  assert.equal(t.calls(), 0);
  t.document.dialogOpen = false;
  t.on.mouseout({ relatedTarget: null, clientY: 0 });
  assert.equal(t.calls(), 1);
}

// beforeunload: pergunta, exceto logo após clicar em link do próprio site.
{
  const t = setup();
  assert.ok(t.unload());
  t.click(ORIGIN, 5_000);
  assert.ok(!t.unload(5_500), "link interno não pergunta");
  assert.ok(t.unload(6_500), "janela de 1 s expira (clique sem navegar)");
  t.click("https://instagram.com", 7_000);
  assert.ok(t.unload(7_100), "link externo pergunta");
  t.click(null, 8_000);
  assert.ok(t.unload(8_100), "clique fora de link pergunta");
}

// Dispositivo que já teve sessão: logout não religa nada, nem beforeunload.
{
  const storage = {};
  setup(storage).remember();
  assert.deepEqual(storage, { "cidoe:has-account": "1" });
  assert.deepEqual(Object.keys(setup(storage).on), [], "nenhum ouvinte com conta no dispositivo");
}

// Armazenamento bloqueado: lembrar não quebra e o modal segue funcionando.
{
  const t = setup(null);
  t.remember();
  t.on.mouseout({ relatedTarget: null, clientY: -1 });
  assert.equal(t.calls(), 1);
}

// Limpeza remove todos os ouvintes.
{
  const t = setup();
  t.stop();
  assert.deepEqual(Object.keys(t.on), []);
}

console.log("check-exit-intent: ok");
