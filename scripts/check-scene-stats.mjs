// node scripts/check-scene-stats.mjs — estatísticas e controles de distância reais; sem servidor/navegador/GPU.
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

const distances = [];
function findDistances(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "RangeField") distances.push(node);
  ts.forEachChild(node, findDistances);
}
findDistances(ast);
assert.equal(distances.length, 2, "Cena expõe somente os dois controles de distância");
let horizon = { distance: 150, backDistance: 46.2, renderDistance: 190, groundDistance: 209, fogDensity: 0.007 };
for (const [index, distance] of [260, 70].entries()) {
  const onChange = distances[index].attributes.properties.find((attribute) => attribute.name?.getText(ast) === "onChange").initializer.expression;
  vm.runInNewContext(ts.transpileModule(`(${onChange.getText(ast)})(${distance})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    setHorizonSettings(update) { horizon = update(horizon); },
  });
}
assert.deepEqual({ ...horizon }, { distance: 260, backDistance: 70, renderDistance: 190, groundDistance: 209, fogDensity: 0.007 }, "Ajustes frente/trás preservam horizonte, chão e névoa");
console.log("ok stats — métricas públicas, loading síncrono, diagnóstico admin e controles frente/trás independentes");
