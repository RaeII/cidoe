// Componente real com hooks/API simulados; sem servidor, navegador ou envio real.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as React from "react";
import ts from "typescript";

const source = await readFile("src/components/admin/LocalEmailSettings.tsx", "utf8");
const ast = ts.createSourceFile("LocalEmailSettings.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const fn = ast.statements.find((node) => ts.isFunctionDeclaration(node));
const code = ts.transpileModule(fn.getText(ast), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const flush = () => new Promise(setImmediate);
function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node.props) ? [node.props] : []), ...find(node.props.children, predicate)];
}
function mount(overrides = {}) {
  const state = [], effects = [], calls = [];
  let cursor = 0, effectCursor = 0;
  const scope = {
    ...Object.fromEntries(["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent", "Label", "Switch", "Button"].map((name) => [name, name])),
    require: createRequire(import.meta.url), exports: {}, ApiError: class extends Error {},
    useState(initial) {
      const i = cursor++;
      if (!(i in state)) state[i] = initial;
      return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
    },
    useEffect(effect, deps) {
      const i = effectCursor++;
      if (effects[i]?.deps.every((value, j) => Object.is(value, deps[j]))) return;
      effects[i]?.cleanup();
      effects[i] = { deps, cleanup: effect() };
    },
    getLocalEmailSettings: async () => ({ enabled: false }),
    saveLocalEmailSettings: async (enabled) => { calls.push(enabled); return { enabled }; },
    ...overrides,
  };
  vm.createContext(scope);
  vm.runInContext(code, scope);
  return {
    calls,
    render() { cursor = 0; effectCursor = 0; return scope.exports.LocalEmailSettings(); },
    unmount() { effects.forEach((effect) => effect.cleanup()); },
  };
}
const control = (tree) => find(tree, (props) => props.id === "local-email-enabled")[0];
const normal = mount();
assert.equal(control(normal.render()).disabled, true, "Carregamento impede alterar valor desconhecido");
await flush();
assert.equal(control(normal.render()).checked, false);
control(normal.render()).onCheckedChange(true);
assert.equal(control(normal.render()).disabled, true, "Gravação pendente bloqueia outro clique");
await flush();
assert.equal(control(normal.render()).checked, true);
control(normal.render()).onCheckedChange(false);
await flush();
assert.equal(control(normal.render()).checked, false);
assert.deepEqual(normal.calls, [true, false]);

const failed = mount({ saveLocalEmailSettings: async () => { throw new Error("offline"); } });
failed.render(); await flush();
control(failed.render()).onCheckedChange(true); await flush();
assert.equal(control(failed.render()).checked, false, "Falha preserva último valor salvo");
assert.equal(find(failed.render(), (props) => props.role === "alert").length, 1);

let loads = 0;
const retry = mount({ getLocalEmailSettings: async () => { if (++loads === 1) throw new Error("offline"); return { enabled: true }; } });
retry.render(); await flush();
assert.equal(control(retry.render()).disabled, true);
find(retry.render(), (props) => props.children === "Tentar de novo")[0].onClick();
retry.render(); await flush();
assert.equal(control(retry.render()).checked, true);
normal.unmount(); failed.unmount(); retry.unmount();
console.log("OK — envio local: carregamento, ativar/desativar, clique pendente, erro e retry.");
