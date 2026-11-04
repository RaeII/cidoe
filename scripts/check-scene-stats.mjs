// Callback real do editor, sem servidor, navegador ou GPU.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/components/CitySceneEditor.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("CitySceneEditor.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleStatsChange") callback = node.initializer.arguments[0];
  ts.forEachChild(node, visit);
}
visit(ast);
assert(callback, "Callback de estatísticas ausente");
const code = ts.transpileModule(`(${callback.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function editor(isAdmin, initial) {
  let current = initial, renders = 0, expectedReady;
  const sceneReadyRef = { current: initial.sceneReady };
  const update = vm.runInNewContext(code, {
    isAdmin, sceneReadyRef,
    setSceneStats(updater) {
      assert.equal(sceneReadyRef.current, expectedReady, "sceneReady deve ser síncrono antes do estado React");
      const next = typeof updater === "function" ? updater(current) : updater;
      if (next !== current) renders++;
      current = next;
    },
  });
  return {
    publish(stats) { expectedReady = stats.sceneReady; update(stats); },
    get state() { return current; }, get renders() { return renders; },
  };
}

const ready = { sceneReady: true, buildings: 480, culled: 100, performance: { fps: 20 } };
const visitor = editor(false, ready);
for (let i = 0; i < 120; i++) visitor.publish({ ...ready, culled: i, performance: { fps: i % 60 } });
assert.equal(visitor.renders, 0, "Órbita atualizou a interface pública por causa das métricas");
assert.equal(visitor.state, ready);
const loading = { ...ready, sceneReady: false };
visitor.publish(loading);
assert.equal(visitor.state, loading, "Carregamento de assets não atualizou a interface");
const loaded = { ...ready, buildings: 500 };
visitor.publish(loaded);
assert.equal(visitor.state, loaded);
assert.equal(visitor.renders, 2);

const admin = editor(true, ready);
const diagnostic = { ...ready, culled: 200, performance: { fps: 30, drawCalls: 500 } };
admin.publish(diagnostic);
assert.equal(admin.state, diagnostic, "Painel admin perdeu métricas de desempenho");
assert.equal(admin.renders, 1);
admin.publish(loading); assert.equal(admin.state, loading);
console.log("ok stats — público sem renders por métricas, sceneReady síncrono, carga/retomada e diagnóstico admin");
